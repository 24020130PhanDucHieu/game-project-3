package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/auth"
	"project-tuan3/internal/repository"
	"project-tuan3/internal/service"
)

func TestCameraClipsAreAppendedInOrderAndPrivate(t *testing.T) {
	gin.SetMode(gin.TestMode)
	clipMinPartGap = 0
	defer func() { clipMinPartGap = 2 * time.Second }()
	dir := t.TempDir()
	repo := repository.NewJSONTournamentRepository(filepath.Join(dir, "t.json"))
	svc := service.NewTournamentService(repo, nil)
	if err := repo.Save("t1", map[string]interface{}{"tournament_id": "t1", "matches": map[string]interface{}{
		"m1": map[string]interface{}{"current_round_idx": 2.0,
			"team_a": map[string]interface{}{"student_id": "SVA"}, "team_b": map[string]interface{}{"student_id": "SVB"}}}}); err != nil {
		t.Fatal(err)
	}
	h := &SnapshotHandler{Service: svc, Dir: filepath.Join(dir, "snaps")}
	as := func(s auth.Session) gin.HandlerFunc { return func(c *gin.Context) { c.Set("session", s) } }
	r := gin.New()
	r.POST("/a/:id/:matchId", as(auth.Session{Role: "TEAM", StudentID: "SVA", MatchID: "m1", Side: "team_a"}), h.UploadClip)
	r.POST("/viewer/:id/:matchId", as(auth.Session{Role: "ADMIN"}), h.UploadClip)
	r.GET("/admin/:id/:matchId", as(auth.Session{Role: "ADMIN"}), h.ListClips)
	r.GET("/admin-file/:id/:matchId", as(auth.Session{Role: "ADMIN"}), h.ClipFile)
	r.GET("/other/:id/:matchId", as(auth.Session{Role: "TEAM", StudentID: "SVZ"}), h.ListClips)

	head := append([]byte{0x1A, 0x45, 0xDF, 0xA3}, bytes.Repeat([]byte{7}, 300)...)
	tail := bytes.Repeat([]byte{9}, 200)
	post := func(path string, body []byte) int {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body)))
		return w.Code
	}
	q := "/a/t1/m1?round=2&mime=video/webm&seq="
	if post(q+"0", []byte("not a video")) != http.StatusBadRequest {
		t.Fatal("mảnh đầu không phải video phải bị từ chối")
	}
	if post(q+"1", tail) != http.StatusConflict {
		t.Fatal("mảnh không bắt đầu từ 0 phải bị từ chối")
	}
	if post(q+"0", head) != http.StatusCreated {
		t.Fatal("mảnh đầu hợp lệ phải được nhận")
	}
	if post(q+"2", tail) != http.StatusConflict {
		t.Fatal("nhảy cóc thứ tự phải bị từ chối")
	}
	if post(q+"1", tail) != http.StatusCreated {
		t.Fatal("mảnh kế tiếp phải được nhận")
	}
	if post("/a/t1/m1?round=3&mime=video/webm&seq=0", head) != http.StatusBadRequest {
		t.Fatal("hiệp chưa tới phải bị từ chối")
	}
	if post("/a/t1/m1?round=2&mime=image/png&seq=0", head) != http.StatusBadRequest {
		t.Fatal("định dạng lạ phải bị từ chối")
	}
	if post("/viewer/t1/m1?round=2&mime=video/webm&seq=0", head) != http.StatusForbidden {
		t.Fatal("người không phải đội trong trận không được gửi video")
	}
	if post(q+"2", bytes.Repeat([]byte{1}, clipPartMaxBytes+1)) != http.StatusBadRequest {
		t.Fatal("mảnh quá lớn phải bị từ chối")
	}

	get := func(path string) (int, map[string]interface{}, []byte) {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		var out map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &out)
		return w.Code, out, w.Body.Bytes()
	}
	code, out, _ := get("/admin/t1/m1?round=2")
	items, _ := out["items"].([]interface{})
	if code != 200 || len(items) != 1 {
		t.Fatal("admin phải thấy 1 video của hiệp 2", code, out)
	}
	file := items[0].(map[string]interface{})["file"].(string)
	code, _, raw := get("/admin-file/t1/m1?path=" + file)
	if code != 200 || !bytes.Equal(raw, append(append([]byte{}, head...), tail...)) {
		t.Fatal("video phải là các mảnh nối đúng thứ tự", code, len(raw))
	}
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/admin-file/t1/m1?path="+file, nil)
	req.Header.Set("Range", "bytes=0-9")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusPartialContent || w.Body.Len() != 10 {
		t.Fatal("phải hỗ trợ Range để tua", w.Code, w.Body.Len())
	}
	if code, _, _ := get("/admin-file/t1/m1?path=../../etc/passwd"); code != http.StatusBadRequest {
		t.Fatal("đường dẫn lạ phải bị chặn", code)
	}
	if code, _, _ := get("/other/t1/m1?round=2"); code != http.StatusForbidden {
		t.Fatal("đội ngoài trận không được xem video", code)
	}
	// Bắt đầu lại (seq 0) thay clip cũ chứ không nối tiếp.
	if post(q+"0", head) != http.StatusCreated {
		t.Fatal("ghi lại từ đầu phải được")
	}
	if info, err := os.Stat(filepath.Join(h.Dir, "t1", "m1", "2", "team_a", "clip.webm")); err != nil || info.Size() != int64(len(head)) {
		t.Fatal("clip mới phải thay clip cũ", err)
	}
	// Dọn tệp cũ.
	old := time.Now().Add(-31 * 24 * time.Hour)
	p := filepath.Join(h.Dir, "t1", "m1", "2", "team_a", "clip.webm")
	_ = os.Chtimes(p, old, old)
	h.Cleanup()
	if _, err := os.Stat(p); err == nil {
		t.Fatal("Cleanup phải xóa clip quá 30 ngày")
	}
}

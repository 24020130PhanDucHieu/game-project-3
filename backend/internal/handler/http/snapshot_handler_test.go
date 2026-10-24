package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/auth"
	"project-tuan3/internal/repository"
	"project-tuan3/internal/service"
)

func TestCameraSnapshotsAreStoredPerRoundAndPrivate(t *testing.T) {
	gin.SetMode(gin.TestMode)
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
	teamA := auth.Session{Role: "TEAM", StudentID: "SVA", MatchID: "m1", Side: "team_a"}
	r.POST("/a/:id/:matchId", as(teamA), h.Upload)
	r.GET("/a/:id/:matchId", as(teamA), h.List)
	r.GET("/admin/:id/:matchId", as(auth.Session{Role: "ADMIN"}), h.List)
	r.GET("/admin-file/:id/:matchId", as(auth.Session{Role: "ADMIN"}), h.File)
	r.GET("/other/:id/:matchId", as(auth.Session{Role: "TEAM", StudentID: "SVZ"}), h.List)

	post := func(body []byte) int {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/a/t1/m1", bytes.NewReader(body)))
		return w.Code
	}
	jpeg := append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, bytes.Repeat([]byte{1}, 500)...)
	if code := post([]byte("not an image")); code != http.StatusBadRequest {
		t.Fatal("file không phải JPEG phải bị từ chối", code)
	}
	h.last = nil
	if code := post(jpeg); code != http.StatusCreated {
		t.Fatal("gửi ảnh hợp lệ thất bại", code)
	}
	if code := post(jpeg); code != http.StatusTooManyRequests {
		t.Fatal("gửi ảnh liên tục phải bị giới hạn", code)
	}
	get := func(path string) (int, map[string]interface{}) {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		var out map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &out)
		return w.Code, out
	}
	code, out := get("/admin/t1/m1?round=2")
	items, _ := out["items"].([]interface{})
	if code != 200 || len(items) != 1 {
		t.Fatal("admin phải thấy 1 ảnh của hiệp 2", code, out)
	}
	file := items[0].(map[string]interface{})["file"].(string)
	if code, _ := get("/admin-file/t1/m1?path=" + file); code != 200 {
		t.Fatal("admin không tải được ảnh", code)
	}
	if code, _ := get("/admin-file/t1/m1?path=../../etc/passwd"); code != http.StatusBadRequest {
		t.Fatal("đường dẫn lạ phải bị chặn", code)
	}
	if code, _ := get("/other/t1/m1"); code != http.StatusForbidden {
		t.Fatal("đội ngoài trận không được xem ảnh", code)
	}
	if code, out := get("/a/t1/m1?round=1"); code != 200 || len(out["items"].([]interface{})) != 0 {
		t.Fatal("hiệp 1 không có ảnh", code, out)
	}
}

package http

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// Video ngắn của từng hiệp cho replay mượt: trình duyệt ghi hình bằng MediaRecorder rồi gửi từng mảnh vài giây;
// các mảnh được NỐI thành một tệp phát được. Quyền và nơi lưu giống ảnh camera (xem snapshot_handler.go).
const (
	clipPartMaxBytes  = 600 * 1024
	clipMaxBytes      = 6 * 1024 * 1024
	clipMaxParts      = 120
	clipSessionExpiry = 15 * time.Minute
)

// Biến (không phải hằng) để bài kiểm thử rút ngắn được.
var clipMinPartGap = 2 * time.Second

var clipFile = regexp.MustCompile(`^([0-9]{1,2})/(team_a|team_b)/clip\.(webm|mp4)$`)

type clipState struct {
	seq   int
	bytes int
	at    time.Time
}

type clipSessions struct {
	mu sync.Mutex
	m  map[string]*clipState
}

var clipLive = &clipSessions{m: map[string]*clipState{}}

func clipExt(mime string) (string, bool) {
	switch mime {
	case "video/webm", "webm":
		return "webm", true
	case "video/mp4", "mp4":
		return "mp4", true
	}
	return "", false
}

func looksLikeVideo(ext string, head []byte) bool {
	switch ext {
	case "webm":
		// Chrome có thể cắt mảnh đầu rất ngắn, nên chỉ so phần đầu đã có.
		magic := []byte{0x1A, 0x45, 0xDF, 0xA3}
		n := min(len(head), len(magic))
		return n > 0 && bytes.Equal(head[:n], magic[:n])
	case "mp4":
		return len(head) < 8 || string(head[4:8]) == "ftyp"
	}
	return false
}

// UploadClip: POST …/clips?round=&seq=&mime= (body = một mảnh video). seq bắt đầu từ 0 và tăng dần 1 mỗi mảnh.
func (h *SnapshotHandler) UploadClip(c *gin.Context) {
	s := requestSession(c)
	m, ok := h.match(c)
	if !ok {
		return
	}
	if s.Role != "TEAM" || s.MatchID != c.Param("matchId") || (s.Side != "team_a" && s.Side != "team_b") {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Chỉ đội trong phòng trận gửi video camera."})
		return
	}
	round, err := strconv.Atoi(c.Query("round"))
	if err != nil || round < 1 || round > 99 || round > max(roundOf(m), 1) {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Hiệp không hợp lệ."})
		return
	}
	seq, err := strconv.Atoi(c.Query("seq"))
	if err != nil || seq < 0 || seq >= clipMaxParts {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Số thứ tự mảnh không hợp lệ."})
		return
	}
	ext, okExt := clipExt(c.Query("mime"))
	if !okExt {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Chỉ nhận video WebM hoặc MP4."})
		return
	}
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, clipPartMaxBytes+1))
	if err != nil || len(body) == 0 || len(body) > clipPartMaxBytes {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Mảnh video rỗng hoặc quá 600 KB."})
		return
	}
	if seq == 0 && !looksLikeVideo(ext, body) {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Mảnh đầu không phải video hợp lệ."})
		return
	}
	key := fmt.Sprintf("%s/%s/%d/%s", c.Param("id"), c.Param("matchId"), round, s.Side)
	dir := filepath.Join(h.Dir, c.Param("id"), c.Param("matchId"), strconv.Itoa(round), s.Side)
	path := filepath.Join(dir, "clip."+ext)

	clipLive.mu.Lock()
	st := clipLive.m[key]
	if st != nil && time.Since(st.at) > clipSessionExpiry {
		st = nil
	}
	switch {
	case seq == 0:
		st = &clipState{}
	case st == nil || seq != st.seq+1:
		clipLive.mu.Unlock()
		c.JSON(http.StatusConflict, gin.H{"detail": "Mảnh video sai thứ tự."})
		return
	case time.Since(st.at) < clipMinPartGap:
		clipLive.mu.Unlock()
		c.JSON(http.StatusTooManyRequests, gin.H{"detail": "Gửi mảnh video quá nhanh."})
		return
	}
	if st.bytes+len(body) > clipMaxBytes {
		clipLive.mu.Unlock()
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"detail": "Video của hiệp đã đạt dung lượng tối đa."})
		return
	}
	st.seq, st.bytes, st.at = seq, st.bytes+len(body), time.Now()
	clipLive.m[key] = st
	for k, v := range clipLive.m {
		if time.Since(v.at) > clipSessionExpiry {
			delete(clipLive.m, k)
		}
	}
	total := st.bytes
	clipLive.mu.Unlock()

	if err := os.MkdirAll(dir, 0o750); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Chưa lưu được video camera."})
		return
	}
	flags := os.O_WRONLY | os.O_CREATE | os.O_APPEND
	if seq == 0 {
		flags = os.O_WRONLY | os.O_CREATE | os.O_TRUNC
		_ = os.Remove(filepath.Join(dir, "clip.webm"))
		_ = os.Remove(filepath.Join(dir, "clip.mp4"))
	}
	f, err := os.OpenFile(path, flags, 0o640)
	if err == nil {
		_, err = f.Write(body)
		if cerr := f.Close(); err == nil {
			err = cerr
		}
	}
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Chưa lưu được video camera."})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"status": "SUCCESS", "round": round, "seq": seq, "bytes": total})
}

// ListClips: GET …/clips?round=n → {items:[{side, file, bytes, mime}]}.
func (h *SnapshotHandler) ListClips(c *gin.Context) {
	m, ok := h.match(c)
	if !ok {
		return
	}
	if !canViewSnapshots(c, m) {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Chỉ ban tổ chức và hai đội của trận xem được video camera."})
		return
	}
	round, err := strconv.Atoi(c.DefaultQuery("round", strconv.Itoa(roundOf(m))))
	if err != nil || round < 1 || round > 99 {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Hiệp không hợp lệ."})
		return
	}
	items := []gin.H{}
	for _, side := range []string{"team_a", "team_b"} {
		for _, ext := range []string{"webm", "mp4"} {
			info, err := os.Stat(filepath.Join(h.Dir, c.Param("id"), c.Param("matchId"), strconv.Itoa(round), side, "clip."+ext))
			if err == nil && !info.IsDir() && info.Size() > 0 {
				items = append(items, gin.H{"side": side, "file": fmt.Sprintf("%d/%s/clip.%s", round, side, ext), "bytes": info.Size(), "mime": "video/" + ext})
				break
			}
		}
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"round": round, "items": items})
}

// ClipFile: GET …/clips/file?path=<round>/<side>/clip.(webm|mp4) — c.File hỗ trợ Range để tua.
func (h *SnapshotHandler) ClipFile(c *gin.Context) {
	m, ok := h.match(c)
	if !ok {
		return
	}
	if !canViewSnapshots(c, m) {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Không có quyền xem video này."})
		return
	}
	rel := c.Query("path")
	if !clipFile.MatchString(rel) {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Đường dẫn video không hợp lệ."})
		return
	}
	c.Header("Cache-Control", "private, no-cache")
	c.File(filepath.Join(h.Dir, c.Param("id"), c.Param("matchId"), filepath.FromSlash(rel)))
}

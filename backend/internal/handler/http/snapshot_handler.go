package http

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/service"
)

// Ảnh camera lưu lại cho replay: mỗi đội gửi một ảnh JPEG nhỏ ~10 giây/lần trong lúc đấu.
// Ảnh nằm trên đĩa gateway, chỉ admin và hai đội của trận được xem (ảnh có khuôn mặt sinh viên).
const (
	snapshotMaxBytes = 40 * 1024
	snapshotInterval = 8 * time.Second
	snapshotMaxAge   = 30 * 24 * time.Hour
)

var safeID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

type SnapshotHandler struct {
	Service *service.TournamentService
	Dir     string

	mu   sync.Mutex
	last map[string]time.Time
}

func SnapshotDir() string {
	if dir := os.Getenv("SNAPSHOT_DIR"); dir != "" {
		return dir
	}
	if info, err := os.Stat("/var/lib/arena"); err == nil && info.IsDir() {
		return "/var/lib/arena/snapshots"
	}
	return filepath.Join("data", "snapshots")
}

func (h *SnapshotHandler) match(c *gin.Context) (map[string]interface{}, bool) {
	tid, mid := c.Param("id"), c.Param("matchId")
	if !safeID.MatchString(tid) || !safeID.MatchString(mid) {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Mã giải hoặc trận không hợp lệ."})
		return nil, false
	}
	t, err := h.Service.GetTournamentByID(tid)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Không tìm thấy giải."})
		return nil, false
	}
	matches, _ := t["matches"].(map[string]interface{})
	m, ok := matches[mid].(map[string]interface{})
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Không tìm thấy trận."})
		return nil, false
	}
	return m, true
}

// canView: admin, hoặc đội thuộc trận này.
func canViewSnapshots(c *gin.Context, m map[string]interface{}) bool {
	s := requestSession(c)
	if s.Role == "ADMIN" {
		return true
	}
	if s.Role != "TEAM" || s.StudentID == "" {
		return false
	}
	for _, side := range []string{"team_a", "team_b"} {
		if team, ok := m[side].(map[string]interface{}); ok && strings.EqualFold(fmt.Sprint(team["student_id"]), s.StudentID) {
			return true
		}
	}
	return false
}

func roundOf(m map[string]interface{}) int {
	switch v := m["current_round_idx"].(type) {
	case float64:
		return int(v)
	case int:
		return v
	}
	return 1
}

// Upload: POST …/snapshots (body = ảnh JPEG). Chỉ đội đang ở trong phòng trận này.
func (h *SnapshotHandler) Upload(c *gin.Context) {
	s := requestSession(c)
	m, ok := h.match(c)
	if !ok {
		return
	}
	if s.Role != "TEAM" || s.MatchID != c.Param("matchId") || (s.Side != "team_a" && s.Side != "team_b") {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Chỉ đội trong phòng trận gửi ảnh camera."})
		return
	}
	key := c.Param("id") + "/" + c.Param("matchId") + "/" + s.Side
	h.mu.Lock()
	if h.last == nil {
		h.last = map[string]time.Time{}
	}
	if time.Since(h.last[key]) < snapshotInterval {
		h.mu.Unlock()
		c.JSON(http.StatusTooManyRequests, gin.H{"detail": "Gửi ảnh quá nhanh."})
		return
	}
	h.last[key] = time.Now()
	h.mu.Unlock()

	body, err := io.ReadAll(io.LimitReader(c.Request.Body, snapshotMaxBytes+1))
	if err != nil || len(body) == 0 || len(body) > snapshotMaxBytes || !bytes.HasPrefix(body, []byte{0xFF, 0xD8, 0xFF}) {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Ảnh camera phải là JPEG tối đa 40 KB."})
		return
	}
	dir := filepath.Join(h.Dir, c.Param("id"), c.Param("matchId"), strconv.Itoa(roundOf(m)), s.Side)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Chưa lưu được ảnh camera."})
		return
	}
	name := strconv.FormatInt(time.Now().UnixMilli(), 10) + ".jpg"
	if err := os.WriteFile(filepath.Join(dir, name), body, 0o640); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Chưa lưu được ảnh camera."})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"status": "SUCCESS", "round": roundOf(m)})
}

// List: GET …/snapshots?round=n → [{side, at, file}] theo thời gian.
func (h *SnapshotHandler) List(c *gin.Context) {
	m, ok := h.match(c)
	if !ok {
		return
	}
	if !canViewSnapshots(c, m) {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Chỉ ban tổ chức và hai đội của trận xem được ảnh camera."})
		return
	}
	round, err := strconv.Atoi(c.DefaultQuery("round", strconv.Itoa(roundOf(m))))
	if err != nil || round < 1 || round > 99 {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Hiệp không hợp lệ."})
		return
	}
	items := []gin.H{}
	for _, side := range []string{"team_a", "team_b"} {
		entries, _ := os.ReadDir(filepath.Join(h.Dir, c.Param("id"), c.Param("matchId"), strconv.Itoa(round), side))
		for _, e := range entries {
			ms, err := strconv.ParseInt(strings.TrimSuffix(e.Name(), ".jpg"), 10, 64)
			if err != nil || !strings.HasSuffix(e.Name(), ".jpg") {
				continue
			}
			items = append(items, gin.H{"side": side, "at": float64(ms) / 1000, "file": fmt.Sprintf("%d/%s/%s", round, side, e.Name())})
		}
	}
	sort.Slice(items, func(i, j int) bool { return items[i]["at"].(float64) < items[j]["at"].(float64) })
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"round": round, "items": items})
}

var snapshotFile = regexp.MustCompile(`^([0-9]{1,2})/(team_a|team_b)/([0-9]{10,16})\.jpg$`)

// File: GET …/snapshots/file?path=<round>/<side>/<ms>.jpg
func (h *SnapshotHandler) File(c *gin.Context) {
	m, ok := h.match(c)
	if !ok {
		return
	}
	if !canViewSnapshots(c, m) {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Không có quyền xem ảnh này."})
		return
	}
	rel := c.Query("path")
	if !snapshotFile.MatchString(rel) {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Đường dẫn ảnh không hợp lệ."})
		return
	}
	c.Header("Cache-Control", "private, max-age=86400")
	c.File(filepath.Join(h.Dir, c.Param("id"), c.Param("matchId"), filepath.FromSlash(rel)))
}

// Cleanup xoá ảnh cũ hơn 30 ngày; gọi định kỳ từ gateway.
func (h *SnapshotHandler) Cleanup() {
	cutoff := time.Now().Add(-snapshotMaxAge)
	_ = filepath.Walk(h.Dir, func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() && strings.HasSuffix(path, ".jpg") && info.ModTime().Before(cutoff) {
			_ = os.Remove(path)
		}
		return nil
	})
}

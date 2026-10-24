package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func hit(r *gin.Engine, remote, forwarded, bearer string) int {
	req := httptest.NewRequest(http.MethodPost, "/api/write", nil)
	req.RemoteAddr = remote
	if forwarded != "" {
		req.Header.Set("X-Forwarded-For", forwarded)
	}
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w.Code
}

func TestRateLimitBehindCaddyUsesRealClientAndPerTeamQuota(t *testing.T) {
	gin.SetMode(gin.TestMode)
	rateState.Lock()
	rateState.clients = make(map[string]rateEntry)
	rateState.Unlock()
	r := gin.New()
	r.Use(RateLimitMiddleware())
	r.POST("/api/write", func(c *gin.Context) { c.Status(http.StatusNoContent) })

	// Đội A (qua Caddy) dùng hết 120 lượt ghi.
	for i := 0; i < 120; i++ {
		if code := hit(r, "127.0.0.1:5000", "203.0.113.7", "team-a"); code != http.StatusNoContent {
			t.Fatalf("lượt %d bị chặn sớm: %d", i+1, code)
		}
	}
	if code := hit(r, "127.0.0.1:5000", "203.0.113.7", "team-a"); code != http.StatusTooManyRequests {
		t.Fatalf("lượt 121 của đội A phải bị chặn, nhận %d", code)
	}
	// Đội B cùng IP trường vẫn dùng được; người dùng ở IP khác cũng vậy.
	if code := hit(r, "127.0.0.1:5000", "203.0.113.7", "team-b"); code != http.StatusNoContent {
		t.Fatalf("đội B chung IP bị chặn oan: %d", code)
	}
	if code := hit(r, "127.0.0.1:5000", "198.51.100.9", ""); code != http.StatusNoContent {
		t.Fatalf("người dùng IP khác bị chặn oan: %d", code)
	}
}

func TestClientIPIgnoresSpoofedHeaderFromOutside(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var seen string
	r := gin.New()
	r.GET("/ip", func(c *gin.Context) { seen = ClientIP(c) })
	req := httptest.NewRequest(http.MethodGet, "/ip", nil)
	req.RemoteAddr = "192.0.2.50:1234"
	req.Header.Set("X-Forwarded-For", "1.2.3.4")
	r.ServeHTTP(httptest.NewRecorder(), req)
	if seen != "192.0.2.50" {
		t.Fatalf("kết nối trực tiếp không được tin X-Forwarded-For, nhận %s", seen)
	}
	req = httptest.NewRequest(http.MethodGet, "/ip", nil)
	req.RemoteAddr = "127.0.0.1:1234"
	req.Header.Set("X-Forwarded-For", "9.9.9.9, 203.0.113.7")
	r.ServeHTTP(httptest.NewRecorder(), req)
	if seen != "203.0.113.7" {
		t.Fatalf("sau Caddy phải lấy địa chỉ Caddy thêm vào cuối, nhận %s", seen)
	}
}

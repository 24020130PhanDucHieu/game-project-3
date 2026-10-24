package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/auth"
	"project-tuan3/internal/humancheck"
)

func adminLogin(r *gin.Engine, remote, forwarded string, body map[string]string) int {
	raw, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/admin/login", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = remote
	if forwarded != "" {
		req.Header.Set("X-Forwarded-For", forwarded)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w.Code
}

func TestAdminLoginLocksAfterFiveFailuresAndNeedsHumanCheck(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("ADMIN_PASSWORD", "dung-mat-khau")
	h := NewMatchHandler(nil, auth.NewManager())
	h.Human = humancheck.New([]byte("k"), 8, true)
	r := gin.New()
	_ = r.SetTrustedProxies([]string{"127.0.0.1"})
	r.POST("/admin/login", h.AdminLogin)
	r.GET("/challenge", (&AccountsHandler{Human: h.Human}).HumanChallenge)
	proof := func() map[string]string {
		_, out := send(r, "GET", "/challenge", "", nil)
		c := out["challenge"].(string)
		return map[string]string{"human_challenge": c, "human_solution": solveHuman(c, 8)}
	}
	attempt := func(password string) int {
		body := proof()
		body["password"] = password
		return adminLogin(r, "127.0.0.1:9000", "203.0.113.5", body)
	}

	// Người dùng qua Caddy phải tích ô robot.
	if code := adminLogin(r, "127.0.0.1:9000", "203.0.113.5", map[string]string{"password": "dung-mat-khau"}); code != http.StatusBadRequest {
		t.Fatalf("đăng nhập admin thiếu xác minh robot phải bị chặn, nhận %d", code)
	}
	for i := 0; i < 5; i++ {
		if code := attempt("sai"); code != http.StatusUnauthorized {
			t.Fatalf("lần sai %d trả %d", i+1, code)
		}
	}
	if code := attempt("dung-mat-khau"); code != http.StatusTooManyRequests {
		t.Fatalf("sau 5 lần sai phải khóa kể cả khi nhập đúng, nhận %d", code)
	}
	// IP khác không bị ảnh hưởng.
	body := proof()
	body["password"] = "dung-mat-khau"
	if code := adminLogin(r, "127.0.0.1:9000", "198.51.100.20", body); code != http.StatusOK {
		t.Fatalf("IP khác bị khóa oan: %d", code)
	}
	// Watchdog chạy ngay trên gateway (không qua Caddy) không cần tích ô robot.
	if code := adminLogin(r, "127.0.0.1:9100", "", map[string]string{"password": "dung-mat-khau"}); code != http.StatusOK {
		t.Fatalf("watchdog trên máy không đăng nhập được: %d", code)
	}
}

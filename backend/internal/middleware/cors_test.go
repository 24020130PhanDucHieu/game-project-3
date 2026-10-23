package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestCORSExactOrigins(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(CORSMiddleware("http://localhost:3000,https://arena.example"))
	router.GET("/api/session", func(c *gin.Context) { c.Status(http.StatusOK) })
	for _, test := range []struct {
		origin string
		status int
	}{
		{"http://localhost:3000", http.StatusOK},
		{"https://arena.example", http.StatusOK},
		{"http://localhost:3000.evil.example", http.StatusForbidden},
		{"http://localhost:30001", http.StatusForbidden},
		{"https://untrusted.sslip.io", http.StatusForbidden},
	} {
		t.Run(test.origin, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/api/session", nil)
			request.Header.Set("Origin", test.origin)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != test.status {
				t.Fatalf("got %d, want %d", response.Code, test.status)
			}
		})
	}
}

package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestRateLimitUsesIndependentAuthBucket(t *testing.T) {
	gin.SetMode(gin.TestMode)
	rateState.Lock()
	rateState.clients = make(map[string]rateEntry)
	rateState.Unlock()

	router := gin.New()
	router.Use(RateLimitMiddleware())
	router.POST("/api/admin/login", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	router.POST("/api/write", func(c *gin.Context) { c.Status(http.StatusNoContent) })

	for i := 0; i < 10; i++ {
		request := httptest.NewRequest(http.MethodPost, "/api/admin/login", nil)
		request.RemoteAddr = "192.0.2.10:1234"
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != http.StatusNoContent {
			t.Fatalf("auth request %d unexpectedly returned %d", i+1, response.Code)
		}
	}
	limited := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/admin/login", nil)
	request.RemoteAddr = "192.0.2.10:1234"
	router.ServeHTTP(limited, request)
	if limited.Code != http.StatusTooManyRequests {
		t.Fatalf("11th auth request returned %d", limited.Code)
	}

	independent := httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodPost, "/api/write", nil)
	request.RemoteAddr = "192.0.2.10:1234"
	router.ServeHTTP(independent, request)
	if independent.Code != http.StatusNoContent {
		t.Fatalf("auth traffic consumed write bucket: %d", independent.Code)
	}
}

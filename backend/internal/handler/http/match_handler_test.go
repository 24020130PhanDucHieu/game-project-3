package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/auth"
)

func TestAdminLoginBootstrapsWithoutTournament(t *testing.T) {
	t.Setenv("ADMIN_PASSWORD", "test-organizer-password")
	gin.SetMode(gin.TestMode)
	sessions := auth.NewManager()
	handler := NewMatchHandler(nil, sessions)
	router := gin.New()
	router.POST("/api/admin/login", handler.AdminLogin)

	body, _ := json.Marshal(map[string]string{"username": "admin", "password": "test-organizer-password"})
	request := httptest.NewRequest(http.MethodPost, "/api/admin/login", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var result map[string]interface{}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	token, _ := result["session_token"].(string)
	session, ok := sessions.Get(token)
	if !ok || session.Role != "ADMIN" {
		t.Fatal("bootstrap did not create an organizer session")
	}
}

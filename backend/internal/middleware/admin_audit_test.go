package middleware

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/auth"
	"project-tuan3/internal/repository"
)

func TestAdminAuditRedactsPayloadAndRefusesUnauditedMutation(t *testing.T) {
	dir := t.TempDir()
	store, err := repository.NewQualifierRecords(repository.NewJSONTournamentRepository(filepath.Join(dir, "t.json")), filepath.Join(dir, "audit"))
	if err != nil {
		t.Fatal(err)
	}
	calls := 0
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set("session", auth.Session{Role: "ADMIN"}) })
	r.Use(AdminAudit(store))
	r.POST("/action", func(c *gin.Context) { calls++; c.JSON(200, gin.H{"ok": true}) })
	request := func() int {
		req := httptest.NewRequest("POST", "/action?token=secret-query", strings.NewReader(`{"password":"secret-body"}`))
		req.Header.Set("Authorization", "Bearer secret-header")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Code
	}
	if request() != 200 || calls != 1 {
		t.Fatal("action failed")
	}
	rows, err := store.List("audit:")
	if err != nil || len(rows) != 1 {
		t.Fatal(rows, err)
	}
	for _, raw := range rows {
		if strings.Contains(string(raw), "secret-") || !strings.Contains(string(raw), "FINISHED") {
			t.Fatal(string(raw))
		}
	}
	if err := os.Rename(filepath.Join(dir, "audit"), filepath.Join(dir, "moved")); err != nil {
		t.Fatal(err)
	}
	if request() != 503 || calls != 1 {
		t.Fatal("mutation ran without durable audit")
	}
}

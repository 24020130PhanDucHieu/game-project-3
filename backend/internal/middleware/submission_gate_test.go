package middleware

import (
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/auth"
	"project-tuan3/internal/repository"
)

func TestSubmissionReceiptSurvivesGateRestartAndRejectsChangedPayload(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	repo := repository.NewJSONTournamentRepository(filepath.Join(dir, "t.json"))
	store, err := repository.NewQualifierRecords(repo, filepath.Join(dir, "q"))
	if err != nil {
		t.Fatal(err)
	}
	calls := 0
	router := func() *gin.Engine {
		r := gin.New()
		r.Use(func(c *gin.Context) { c.Set("session", auth.Session{Role: "TEAM", StudentID: "A"}) })
		r.Use(SubmissionGate(store, 1))
		r.POST("/api/qualifiers/q/submissions", func(c *gin.Context) { calls++; c.JSON(200, gin.H{"id": "accepted", "valid": true}) })
		return r
	}
	request := func(r *gin.Engine, body string) int {
		req := httptest.NewRequest("POST", "/api/qualifiers/q/submissions", strings.NewReader(body))
		req.Header.Set("X-Submission-Id", "same-request")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Code
	}
	if request(router(), `{"code":"A"}`) != 200 {
		t.Fatal("first submission")
	}
	if request(router(), `{"code":"A"}`) != 200 || calls != 1 {
		t.Fatal("replayed request ran handler")
	}
	if request(router(), `{"code":"B"}`) != 409 || calls != 1 {
		t.Fatal("changed payload accepted")
	}
}

func TestSubmissionGateRejectsBusyWithoutRunningSecondHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(SubmissionGate(nil, 1))
	started, finish, done := make(chan struct{}), make(chan struct{}), make(chan struct{})
	r.POST("/api/bots/validate", func(c *gin.Context) { close(started); <-finish; c.Status(200) })
	go func() {
		r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("POST", "/api/bots/validate", nil))
		close(done)
	}()
	<-started
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest("POST", "/api/bots/validate", nil))
	close(finish)
	<-done
	if w.Code != 429 || w.Header().Get("Retry-After") == "" {
		t.Fatalf("missing backpressure: %d", w.Code)
	}
}

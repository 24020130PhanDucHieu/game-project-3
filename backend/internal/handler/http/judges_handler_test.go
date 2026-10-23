package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/auth"
	"project-tuan3/internal/repository"
)

func judgeFixture(t *testing.T) (*gin.Engine, *auth.Manager, *repository.Judges) {
	t.Helper()
	t.Setenv("ADMIN_PASSWORD", "owner-password")
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	store, err := repository.NewQualifierRecords(repository.NewJSONTournamentRepository(filepath.Join(dir, "t.json")), filepath.Join(dir, "kv"))
	if err != nil {
		t.Fatal(err)
	}
	judges := repository.NewJudges(store)
	sessions := auth.NewManager()
	sessions.CheckSession = func(s auth.Session) (bool, error) {
		if s.Role == "ADMIN" && s.Judge != "" {
			return judges.Valid(s.Judge, s.IssuedAt)
		}
		return true, nil
	}
	mh := NewMatchHandler(nil, sessions)
	mh.Judges = judges
	jh := &JudgesHandler{Judges: judges}
	withSession := func(c *gin.Context) {
		token := c.GetHeader("Authorization")
		if len(token) > 7 {
			if s, ok, _ := sessions.GetChecked(token[7:]); ok {
				c.Set("session", s)
				return
			}
		}
		c.AbortWithStatus(http.StatusUnauthorized)
	}
	r := gin.New()
	r.POST("/login", mh.AdminLogin)
	r.GET("/judges", withSession, jh.List)
	r.POST("/judges", withSession, jh.Create)
	r.POST("/judges/:username/:action", withSession, jh.Action)
	r.GET("/me", withSession, func(c *gin.Context) { c.JSON(200, gin.H{"actor": requestSession(c).Actor()}) })
	return r, sessions, judges
}

func send(r *gin.Engine, method, path, token string, body interface{}) (int, map[string]interface{}) {
	raw, _ := json.Marshal(body)
	req := httptest.NewRequest(method, path, bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var out map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return w.Code, out
}

func TestJudgeAccountsLoginAuditAndRevocation(t *testing.T) {
	r, _, _ := judgeFixture(t)
	code, owner := send(r, "POST", "/login", "", map[string]string{"username": "admin", "password": "owner-password"})
	if code != 200 {
		t.Fatal("owner login failed", code, owner)
	}
	ownerToken := owner["session_token"].(string)

	if code, _ := send(r, "POST", "/judges", ownerToken, map[string]string{"username": "gk.lan", "display_name": "Giám khảo Lan", "password": "short"}); code != 400 {
		t.Fatal("weak password must be rejected", code)
	}
	if code, out := send(r, "POST", "/judges", ownerToken, map[string]string{"username": "GK.Lan", "display_name": "Giám khảo Lan", "password": "lan-secret-1"}); code != 200 {
		t.Fatal("create judge failed", code, out)
	}
	if code, _ := send(r, "POST", "/judges", ownerToken, map[string]string{"username": "admin", "display_name": "X", "password": "whatever-123"}); code != 400 {
		t.Fatal("reserved admin alias must not become a judge", code)
	}

	if code, _ := send(r, "POST", "/login", "", map[string]string{"username": "gk.lan", "password": "wrong-password"}); code != 401 {
		t.Fatal("wrong judge password accepted", code)
	}
	code, judgeLogin := send(r, "POST", "/login", "", map[string]string{"username": "gk.lan", "password": "lan-secret-1"})
	if code != 200 || judgeLogin["judge"] != "gk.lan" {
		t.Fatal("judge login failed", code, judgeLogin)
	}
	judgeToken := judgeLogin["session_token"].(string)
	if _, me := send(r, "GET", "/me", judgeToken, nil); me["actor"] != "gk.lan" {
		t.Fatal("audit actor must be the judge username", me)
	}
	// Giám khảo không được quản lý giám khảo khác.
	if code, _ := send(r, "GET", "/judges", judgeToken, nil); code != 403 {
		t.Fatal("judge must not manage judges", code)
	}
	code, list := send(r, "GET", "/judges", ownerToken, nil)
	raw, _ := json.Marshal(list)
	if code != 200 || bytes.Contains(raw, []byte("password_hash")) || bytes.Contains(raw, []byte("$2a$")) {
		t.Fatal("judge list must not expose hashes", string(raw))
	}

	// Khóa tài khoản thu hồi phiên đang mở.
	time.Sleep(5 * time.Millisecond)
	if code, _ := send(r, "POST", "/judges/gk.lan/disable", ownerToken, nil); code != 200 {
		t.Fatal("disable failed", code)
	}
	if code, _ := send(r, "GET", "/me", judgeToken, nil); code != 401 {
		t.Fatal("disabled judge session still valid", code)
	}
	if code, _ := send(r, "POST", "/login", "", map[string]string{"username": "gk.lan", "password": "lan-secret-1"}); code != 401 {
		t.Fatal("disabled judge can still log in", code)
	}
	send(r, "POST", "/judges/gk.lan/enable", ownerToken, nil)
	if code, _ := send(r, "POST", "/login", "", map[string]string{"username": "gk.lan", "password": "lan-secret-1"}); code != 200 {
		t.Fatal("re-enabled judge cannot log in", code)
	}
}

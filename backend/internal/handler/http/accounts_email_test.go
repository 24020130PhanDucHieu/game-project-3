package http

import (
	"net/http"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/auth"
	"project-tuan3/internal/repository"
	"project-tuan3/internal/service"
)

type fakeMailer struct{ to, body string }

func (f *fakeMailer) Configured() bool { return true }
func (f *fakeMailer) Send(to, subject, body string) error {
	f.to, f.body = to, body
	return nil
}

func TestEmailRecoveryAndAdminPasswordView(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	repo := repository.NewJSONTournamentRepository(filepath.Join(dir, "t.json"))
	store, err := repository.NewAccounts(repo, filepath.Join(dir, "accounts.json"))
	if err != nil {
		t.Fatal(err)
	}
	mail := &fakeMailer{}
	h := &AccountsHandler{Store: store, Service: service.NewTournamentService(repo, nil), Mailer: mail}
	guest := func(c *gin.Context) {}
	admin := func(c *gin.Context) { c.Set("session", auth.Session{Role: "ADMIN", Judge: "gk.lan"}) }
	r := gin.New()
	r.POST("/register", guest, h.Register)
	r.POST("/forgot", guest, h.ForgotPassword)
	r.POST("/reset", guest, h.ResetPassword)
	r.GET("/admin/:studentId/password", admin, h.ViewPassword)

	if code, _ := send(r, "POST", "/register", "", map[string]string{"student_id": "SV7001", "team_name": "Đội Email", "password": "first-pass"}); code != 400 {
		t.Fatal("registration without email must be rejected", code)
	}
	if code, out := send(r, "POST", "/register", "", map[string]string{"student_id": "SV7001", "team_name": "Đội Email", "password": "first-pass", "email": "Doi.Email@Gmail.com"}); code != http.StatusCreated {
		t.Fatal("register failed", code, out)
	}

	// Email sai: vẫn trả thông báo chung, không gửi mail.
	code, wrong := send(r, "POST", "/forgot", "", map[string]string{"student_id": "SV7001", "email": "khac@gmail.com"})
	if code != 200 || mail.to != "" {
		t.Fatal("wrong email must not send a code", code, mail.to)
	}
	_, unknown := send(r, "POST", "/forgot", "", map[string]string{"student_id": "SV9999", "email": "a@b.com"})
	if wrong["message"] != unknown["message"] {
		t.Fatal("responses must not reveal which accounts exist")
	}
	if code, _ := send(r, "POST", "/forgot", "", map[string]string{"student_id": "SV7001", "email": "doi.email@gmail.com"}); code != 200 || mail.to != "doi.email@gmail.com" {
		t.Fatal("matching email must receive the code", code, mail.to)
	}
	lines := strings.Split(mail.body, "\r\n")
	token := ""
	for _, l := range lines {
		if strings.HasPrefix(l, "    ") {
			token = strings.TrimSpace(l)
		}
	}
	if code, out := send(r, "POST", "/reset", "", map[string]string{"student_id": "SV7001", "reset_token": token, "new_password": "second-pass"}); code != 200 {
		t.Fatal("reset with emailed token failed", code, out)
	}
	if _, err := store.Authenticate("SV7001", "second-pass"); err != nil {
		t.Fatal("new password does not work", err)
	}
	send(r, "POST", "/forgot", "", map[string]string{"student_id": "SV7001", "email": "doi.email@gmail.com"}) // lần thứ 3 trong giờ
	if code, _ := send(r, "POST", "/forgot", "", map[string]string{"student_id": "SV7001", "email": "doi.email@gmail.com"}); code != http.StatusTooManyRequests {
		t.Fatal("fourth request within an hour must be rate limited", code)
	}

	code, view := send(r, "GET", "/admin/SV7001/password", "", nil)
	if code != 200 || view["password"] != "second-pass" {
		t.Fatal("admin password view failed", code, view)
	}
	logs, _ := store.ListAdminAuditLogs("", 10)
	found := false
	for _, l := range logs {
		if l.Action == "VIEW_PASSWORD" && l.AdminUser == "gk.lan" {
			found = true
		}
	}
	if !found {
		t.Fatal("viewing a password must be audited with the judge name", logs)
	}
}

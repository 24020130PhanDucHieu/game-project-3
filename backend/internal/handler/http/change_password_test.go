package http

import (
	"net/http"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/auth"
	"project-tuan3/internal/repository"
)

func TestTeamChangesOwnPassword(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	repo := repository.NewJSONTournamentRepository(filepath.Join(dir, "t.json"))
	store, err := repository.NewAccounts(repo, filepath.Join(dir, "accounts.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Create("SV9100", "Đội Đổi", "mat-khau-cu"); err != nil {
		t.Fatal(err)
	}
	h := &AccountsHandler{Store: store}
	team := func(c *gin.Context) { c.Set("session", auth.Session{Role: "TEAM", StudentID: "SV9100"}) }
	guest := func(c *gin.Context) {}
	r := gin.New()
	r.POST("/team/password", team, h.ChangePassword)
	r.POST("/guest/password", guest, h.ChangePassword)

	if code, _ := send(r, "POST", "/guest/password", "", map[string]string{"current_password": "mat-khau-cu", "new_password": "mat-khau-moi"}); code != http.StatusForbidden {
		t.Fatal("khách không được đổi mật khẩu", code)
	}
	if code, _ := send(r, "POST", "/team/password", "", map[string]string{"current_password": "sai", "new_password": "mat-khau-moi"}); code != http.StatusUnauthorized {
		t.Fatal("sai mật khẩu hiện tại phải bị từ chối", code)
	}
	if code, _ := send(r, "POST", "/team/password", "", map[string]string{"current_password": "mat-khau-cu", "new_password": "123"}); code != http.StatusBadRequest {
		t.Fatal("mật khẩu mới quá ngắn phải bị từ chối", code)
	}
	if code, out := send(r, "POST", "/team/password", "", map[string]string{"current_password": "mat-khau-cu", "new_password": "mat-khau-moi"}); code != http.StatusOK {
		t.Fatal("đổi mật khẩu thất bại", code, out)
	}
	if _, err := store.Authenticate("SV9100", "mat-khau-moi"); err != nil {
		t.Fatal("không đăng nhập được bằng mật khẩu mới", err)
	}
	if _, err := store.Authenticate("SV9100", "mat-khau-cu"); err == nil {
		t.Fatal("mật khẩu cũ vẫn dùng được")
	}
}

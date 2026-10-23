package http

import (
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/auth"
	"project-tuan3/internal/repository"
	"project-tuan3/internal/service"
)

func TestImportAccountsCreatesGeneratesAndReportsEachRow(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	repo := repository.NewJSONTournamentRepository(filepath.Join(dir, "t.json"))
	store, err := repository.NewAccounts(repo, filepath.Join(dir, "accounts.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err = store.Create("SV0001", "Đã có", "existing-pass"); err != nil {
		t.Fatal(err)
	}
	h := &AccountsHandler{Store: store, Service: service.NewTournamentService(repo, nil)}
	r := gin.New()
	admin := func(c *gin.Context) { c.Set("session", auth.Session{Role: "ADMIN", Judge: "gk.lan"}) }
	// Cùng cấu trúc route như main.go: đường dẫn tĩnh "import" cạnh tham số :studentId.
	r.POST("/admin/accounts/import", admin, h.ImportAccounts)
	r.POST("/admin/accounts/:studentId/enroll", admin, h.Enroll)

	rows := []map[string]string{
		{"student_id": "sv1001", "team_name": "Alpha"},
		{"student_id": "SV1002", "team_name": "Beta", "password": "chosen-pass"},
		{"student_id": "SV1001", "team_name": "Alpha lặp"},
		{"student_id": "SV0001", "team_name": "Đã có"},
		{"student_id": "x", "team_name": "Sai mã"},
	}
	code, out := send(r, "POST", "/admin/accounts/import", "", map[string]interface{}{"rows": rows})
	if code != 200 || out["created"].(float64) != 2 {
		t.Fatal("import failed", code, out)
	}
	results := out["results"].([]interface{})
	want := []string{"CREATED", "CREATED", "DUPLICATE", "EXISTS", "INVALID"}
	for i, raw := range results {
		row := raw.(map[string]interface{})
		if row["status"] != want[i] {
			t.Fatalf("row %d: want %s got %v", i+1, want[i], row)
		}
	}
	generated, _ := results[0].(map[string]interface{})["password"].(string)
	if len(generated) != 10 {
		t.Fatal("blank password must be generated once", results[0])
	}
	if _, has := results[1].(map[string]interface{})["password"]; has {
		t.Fatal("a chosen password must never be echoed back")
	}
	if _, err := store.Authenticate("SV1001", generated); err != nil {
		t.Fatal("generated password does not work", err)
	}
	if _, err := store.Authenticate("SV0001", "existing-pass"); err != nil {
		t.Fatal("import must not overwrite existing passwords", err)
	}
}

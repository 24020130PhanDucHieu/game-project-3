package http

import (
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"sort"
	"testing"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/repository"
	"project-tuan3/internal/service"
)

func TestAccountKeyMismatchDoesNotHideRegistryAndLoginRepairs(t *testing.T) {
	t.Setenv("ACCOUNT_ENCRYPTION_KEY", "old-fixture-key")
	dir := t.TempDir()
	repo := repository.NewJSONTournamentRepository(filepath.Join(dir, "tournaments.json"))
	path := filepath.Join(dir, "accounts.json")
	old, err := repository.NewAccounts(repo, path)
	if err != nil {
		t.Fatal(err)
	}
	if err = old.Create("SV1001", "Old key team", "original-password"); err != nil {
		t.Fatal(err)
	}
	t.Setenv("ACCOUNT_ENCRYPTION_KEY", "new-fixture-key")
	current, err := repository.NewAccounts(repo, path)
	if err != nil {
		t.Fatal(err)
	}
	if err = current.Create("SV1002", "New key team", "second-password"); err != nil {
		t.Fatal(err)
	}
	handler := &AccountsHandler{Store: current, Service: service.NewTournamentService(repo, nil)}
	router := gin.New()
	router.GET("/accounts", handler.List)
	read := func() []map[string]interface{} {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest("GET", "/accounts", nil))
		if w.Code != 200 || w.Header().Get("Cache-Control") != "no-store" {
			t.Fatal(w.Code, w.Body.String())
		}
		var rows []map[string]interface{}
		if err := json.Unmarshal(w.Body.Bytes(), &rows); err != nil {
			t.Fatal(err)
		}
		sort.Slice(rows, func(i, j int) bool { return rows[i]["student_id"].(string) < rows[j]["student_id"].(string) })
		return rows
	}
	rows := read()
	for _, row := range rows {
		if _, leaked := row["password"]; leaked {
			t.Fatal("registry must not expose plaintext passwords", row)
		}
	}
	if len(rows) != 2 || rows[0]["password_available"] != false || rows[1]["password_available"] != true {
		t.Fatal(rows)
	}
	before, _ := current.Get("SV1001")
	if _, err = current.Authenticate("SV1001", "incorrect"); err == nil {
		t.Fatal("wrong password accepted")
	}
	unchanged, _ := current.Get("SV1001")
	if unchanged.Secret != before.Secret {
		t.Fatal("unverified login modified ciphertext")
	}
	if _, err = current.Authenticate("SV1001", "original-password"); err != nil {
		t.Fatal(err)
	}
	after, _ := current.Get("SV1001")
	if after.Hash != before.Hash || after.Secret == before.Secret {
		t.Fatal("repair changed hash or failed")
	}
	rows = read()
	if rows[0]["password_available"] != true {
		t.Fatal(rows)
	}
	restarted, err := repository.NewAccounts(repo, path)
	if err != nil {
		t.Fatal(err)
	}
	saved, _ := restarted.Get("SV1001")
	if password, err := restarted.Password(saved); err != nil || password != "original-password" {
		t.Fatal("repair not durable", err)
	}
}

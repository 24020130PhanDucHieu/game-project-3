package repository

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestAccountsPersistEncryptAndDelete(t *testing.T) {
	t.Setenv("ACCOUNT_ENCRYPTION_KEY", "test-account-key")
	dir := t.TempDir()
	path := filepath.Join(dir, "accounts.json")
	repo := NewJSONTournamentRepository(filepath.Join(dir, "tournaments.json"))
	store, err := NewAccounts(repo, path)
	if err != nil {
		t.Fatal(err)
	}
	password := "custom secret 123"
	if err = store.Create("sv1001", "Team One", password); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), password) {
		t.Fatal("plain password on disk")
	}
	restarted, err := NewAccounts(repo, path)
	if err != nil {
		t.Fatal(err)
	}
	a, err := restarted.Authenticate(" SV1001 ", password)
	if err != nil {
		t.Fatal(err)
	}
	decrypted, err := restarted.Password(a)
	if err != nil || decrypted != password {
		t.Fatal("admin password reveal failed", err)
	}
	if _, err = restarted.Authenticate("SV1001", "k69SV1001"); err == nil {
		t.Fatal("default password bypassed custom password")
	}
	if err = restarted.Delete("sv1001"); err != nil {
		t.Fatal(err)
	}
	restarted, err = NewAccounts(repo, path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = restarted.Authenticate("SV1001", password); err == nil {
		t.Fatal("deleted account authenticated")
	}
	if err = restarted.Create("sv1001", "Impersonator", "password"); !errors.Is(err, ErrAccountExists) {
		t.Fatal("deleted identity reused", err)
	}
	list, err := restarted.List()
	if err != nil || len(list) != 0 {
		t.Fatal("deleted account listed", err)
	}
}

func TestConcurrentAccountRegistration(t *testing.T) {
	t.Setenv("ACCOUNT_ENCRYPTION_KEY", "test-account-key")
	dir := t.TempDir()
	store, err := NewAccounts(NewJSONTournamentRepository(filepath.Join(dir, "tournaments.json")), filepath.Join(dir, "accounts.json"))
	if err != nil {
		t.Fatal(err)
	}
	results := make(chan error, 6)
	var wg sync.WaitGroup
	for i := 0; i < 6; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); results <- store.Create("sv1002", "One Team", "password123") }()
	}
	wg.Wait()
	close(results)
	successes := 0
	for err := range results {
		if err == nil {
			successes++
		} else if !errors.Is(err, ErrAccountExists) {
			t.Fatal(err)
		}
	}
	if successes != 1 {
		t.Fatalf("created %d duplicate accounts", successes)
	}
}

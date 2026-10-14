package auth

import (
	"errors"
	"testing"
)

func TestSessionDatabaseOutageIsRecoverable(t *testing.T) {
	m := NewManager()
	token, err := m.Create(Session{Role: "TEAM", StudentID: "student"})
	if err != nil {
		t.Fatal(err)
	}
	m.CheckStudent = func(string) (bool, error) { return false, errors.New("database unavailable") }
	if _, ok, err := m.GetChecked(token); ok || err == nil {
		t.Fatal("outage indistinguishable from invalid token")
	}
	m.CheckStudent = func(string) (bool, error) { return true, nil }
	if _, ok, err := m.GetChecked(token); !ok || err != nil {
		t.Fatal("session did not recover")
	}
	m.CheckStudent = func(string) (bool, error) { return false, nil }
	if _, ok, err := m.GetChecked(token); ok || err != nil {
		t.Fatal("deleted account accepted")
	}
}

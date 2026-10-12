package auth

import (
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"
)

func TestSessionSurvivesRestartAndRejectsTampering(t *testing.T) {
	t.Setenv("SESSION_SECRET", "test-stable-session-key")
	first := NewManager()
	token, err := first.Create(Session{Role: "TEAM_A", StudentID: "24020001", TeamName: "Team", TournamentID: "cup", MatchID: "m1", Side: "team_a"})
	if err != nil {
		t.Fatal(err)
	}
	restarted := NewManager()
	session, ok := restarted.Get(token)
	if !ok || session.Role != "TEAM" || session.StudentID != "24020001" || session.MatchID != "m1" {
		t.Fatal("session was lost across restart")
	}
	if _, ok := restarted.Get("a" + token); ok {
		t.Fatal("tampered token accepted")
	}
	t.Setenv("SESSION_SECRET", "different-key")
	if _, ok := NewManager().Get(token); ok {
		t.Fatal("token signed with another key accepted")
	}
}

func TestExpiredAndRevokedSessionsRejected(t *testing.T) {
	manager := NewManager()
	token, _ := manager.Create(Session{Role: "ADMIN"})
	manager.Revoke(token)
	if _, ok := manager.Get(token); ok {
		t.Fatal("revoked session accepted")
	}
	data, _ := json.Marshal(Session{Role: "ADMIN", Nonce: "test", ExpiresAt: time.Now().Add(-time.Minute)})
	payload := base64.RawURLEncoding.EncodeToString(data)
	expired := payload + "." + base64.RawURLEncoding.EncodeToString(manager.signature(payload))
	if _, ok := manager.Get(expired); ok {
		t.Fatal("expired session accepted")
	}
}

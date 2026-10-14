package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"os"
	"strings"
	"sync"
	"time"
)

type Session struct {
	Role         string    `json:"role"`
	Side         string    `json:"side,omitempty"`
	TournamentID string    `json:"tournament_id,omitempty"`
	MatchID      string    `json:"match_id,omitempty"`
	StudentID    string    `json:"student_id,omitempty"`
	TeamName     string    `json:"team_name,omitempty"`
	ExpiresAt    time.Time `json:"expires_at"`
	Nonce        string    `json:"nonce"`
}

type Manager struct {
	ValidateStudent func(string) bool
	CheckStudent    func(string) (bool, error)
	mu              sync.RWMutex
	key             []byte
	revoked         map[string]time.Time
}

// A stable signing key keeps browser sessions valid across service restarts.
func NewManager() *Manager {
	secret := os.Getenv("SESSION_SECRET")
	if secret == "" {
		secret = os.Getenv("ADMIN_PASSWORD")
	}
	if secret == "" {
		var randomKey [32]byte
		if _, err := rand.Read(randomKey[:]); err != nil {
			panic(err)
		}
		secret = base64.RawURLEncoding.EncodeToString(randomKey[:])
	}
	key := sha256.Sum256([]byte("arena-session-v1:" + secret))
	return &Manager{key: key[:], revoked: make(map[string]time.Time)}
}

func (m *Manager) signature(payload string) []byte {
	mac := hmac.New(sha256.New, m.key)
	mac.Write([]byte(payload))
	return mac.Sum(nil)
}

func (m *Manager) Create(session Session) (string, error) {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	session.Nonce = base64.RawURLEncoding.EncodeToString(raw[:])
	session.ExpiresAt = time.Now().Add(7 * 24 * time.Hour)
	if strings.HasPrefix(session.Role, "TEAM") {
		session.Role = "TEAM"
	}
	data, err := json.Marshal(session)
	if err != nil {
		return "", err
	}
	payload := base64.RawURLEncoding.EncodeToString(data)
	return payload + "." + base64.RawURLEncoding.EncodeToString(m.signature(payload)), nil
}

func (m *Manager) Get(token string) (Session, bool) {
	session, ok, _ := m.GetChecked(token)
	return session, ok
}

func (m *Manager) GetChecked(token string) (Session, bool, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return Session{}, false, nil
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || !hmac.Equal(sig, m.signature(parts[0])) {
		return Session{}, false, nil
	}
	data, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return Session{}, false, nil
	}
	var session Session
	if json.Unmarshal(data, &session) != nil || session.Nonce == "" || !time.Now().Before(session.ExpiresAt) {
		return Session{}, false, nil
	}
	if session.Role != "ADMIN" && (session.Role != "TEAM" || session.StudentID == "") {
		return Session{}, false, nil
	}
	m.mu.RLock()
	_, revoked := m.revoked[token]
	m.mu.RUnlock()
	if !revoked && session.Role == "TEAM" && m.ValidateStudent != nil && !m.ValidateStudent(session.StudentID) {
		return Session{}, false, nil
	}
	if !revoked && session.Role == "TEAM" && m.CheckStudent != nil {
		valid, err := m.CheckStudent(session.StudentID)
		if err != nil {
			return Session{}, false, err
		}
		if !valid {
			return Session{}, false, nil
		}
	}
	return session, !revoked, nil
}

func (m *Manager) Revoke(token string) {
	if session, ok := m.Get(token); ok {
		m.mu.Lock()
		for existing, expires := range m.revoked {
			if time.Now().After(expires) {
				delete(m.revoked, existing)
			}
		}
		m.revoked[token] = session.ExpiresAt
		m.mu.Unlock()
	}
}

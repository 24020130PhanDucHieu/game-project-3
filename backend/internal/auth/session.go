package auth

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

type Session struct {
	Role         string
	Side         string
	TournamentID string
	MatchID      string
	StudentID    string
	ExpiresAt    time.Time
}

type Manager struct {
	mu       sync.RWMutex
	sessions map[string]Session
}

func NewManager() *Manager { return &Manager{sessions: make(map[string]Session)} }

func (m *Manager) Create(session Session) (string, error) {
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	token := hex.EncodeToString(raw[:])
	session.ExpiresAt = time.Now().Add(12 * time.Hour)
	m.mu.Lock()
	if len(m.sessions) >= 2048 {
		now := time.Now()
		for existingToken, existingSession := range m.sessions {
			if now.After(existingSession.ExpiresAt) {
				delete(m.sessions, existingToken)
			}
		}
	}
	m.sessions[token] = session
	m.mu.Unlock()
	return token, nil
}

func (m *Manager) Get(token string) (Session, bool) {
	m.mu.RLock()
	session, ok := m.sessions[token]
	m.mu.RUnlock()
	if !ok || time.Now().After(session.ExpiresAt) {
		if ok {
			m.mu.Lock()
			delete(m.sessions, token)
			m.mu.Unlock()
		}
		return Session{}, false
	}
	return session, true
}

func (m *Manager) Revoke(token string) {
	m.mu.Lock()
	delete(m.sessions, token)
	m.mu.Unlock()
}

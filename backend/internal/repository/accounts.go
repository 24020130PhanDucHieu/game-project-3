package repository

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var ErrAccountExists = errors.New("Mã sinh viên đã được đăng ký.")
var ErrAccountMissing = errors.New("Tài khoản không tồn tại hoặc đã bị xóa.")

type Account struct {
	StudentID string    `json:"student_id"`
	TeamName  string    `json:"team_name"`
	Hash      string    `json:"password_hash"`
	Secret    string    `json:"password_encrypted"`
	CreatedAt time.Time `json:"created_at"`
	Deleted   bool      `json:"deleted"`
}

// Accounts are independent of tournament rosters. Deleted IDs remain reserved
// so an old signed session cannot regain access through re-registration.
type Accounts struct {
	mu            sync.Mutex
	db            *sql.DB
	path          string
	items         map[string]Account
	cipher        cipher.AEAD
	resets        map[string]PasswordReset
	pwdAudits     []PasswordAuditLog
	notifications []Notification
	profiles      map[string]TeamProfile
	adminLogs     []AdminAuditLog
}

func NewAccounts(repo TournamentRepository, path string) (*Accounts, error) {
	s := &Accounts{
		path:          path,
		items:         map[string]Account{},
		resets:        map[string]PasswordReset{},
		pwdAudits:     []PasswordAuditLog{},
		notifications: []Notification{},
		profiles:      map[string]TeamProfile{},
		adminLogs:     []AdminAuditLog{},
	}
	secret := os.Getenv("ACCOUNT_ENCRYPTION_KEY")
	if secret == "" {
		secret = os.Getenv("SESSION_SECRET")
	}
	if secret == "" {
		secret = os.Getenv("ADMIN_PASSWORD")
	}
	if pg, ok := repo.(*PostgresTournamentRepository); ok {
		s.db = pg.db
		if secret == "" {
			return nil, errors.New("Configure ACCOUNT_ENCRYPTION_KEY or SESSION_SECRET or ADMIN_PASSWORD")
		}
		schema := `
CREATE TABLE IF NOT EXISTS arena_accounts (student_id TEXT PRIMARY KEY, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS arena_password_resets (student_id VARCHAR(64) NOT NULL, reset_token_hash VARCHAR(128) PRIMARY KEY, expires_at TIMESTAMP WITH TIME ZONE NOT NULL, used BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS arena_password_audit_logs (id SERIAL PRIMARY KEY, student_id VARCHAR(64) NOT NULL, action VARCHAR(64) NOT NULL, ip_address VARCHAR(64), user_agent TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS arena_notifications (id VARCHAR(64) PRIMARY KEY, recipient_id VARCHAR(64) NOT NULL, event_type VARCHAR(64) NOT NULL, title VARCHAR(255) NOT NULL, message TEXT NOT NULL, link_tab VARCHAR(64), link_data JSONB DEFAULT '{}', dedup_key VARCHAR(128) UNIQUE, is_read BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS arena_team_profiles (student_id VARCHAR(64) PRIMARY KEY, team_name VARCHAR(128) NOT NULL, captain_name VARCHAR(128), university VARCHAR(128) DEFAULT 'ĐHQG Hà Nội', members JSONB DEFAULT '[]', preferred_language VARCHAR(32) DEFAULT 'PYTHON', bio TEXT DEFAULT '', achievements JSONB DEFAULT '[]', updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS arena_admin_audit_logs (id SERIAL PRIMARY KEY, admin_user VARCHAR(64) NOT NULL DEFAULT 'admin', action VARCHAR(64) NOT NULL, tournament_id VARCHAR(64), match_id VARCHAR(64), details JSONB DEFAULT '{}', created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);
`
		if _, err := s.db.Exec(schema); err != nil {
			return nil, err
		}
	} else {
		if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			return nil, err
		}
		if secret == "" {
			keyPath := path + ".key"
			key, err := os.ReadFile(keyPath)
			if os.IsNotExist(err) {
				key = make([]byte, 32)
				if _, err = rand.Read(key); err != nil {
					return nil, err
				}
				if err = os.WriteFile(keyPath, key, 0600); err != nil {
					return nil, err
				}
			} else if err != nil {
				return nil, err
			}
			secret = string(key)
		}
		data, err := os.ReadFile(path)
		if err == nil {
			if err = json.Unmarshal(data, &s.items); err != nil {
				return nil, err
			}
		} else if !os.IsNotExist(err) {
			return nil, err
		}
	}
	key := sha256.Sum256([]byte("arena-account-v1:" + secret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	s.cipher, err = cipher.NewGCM(block)
	return s, err
}

func accountID(id string) string { return strings.ToUpper(strings.TrimSpace(id)) }

// Include deleted identities so migration never recreates a removed account.
func (s *Accounts) KnownIDs() (map[string]bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ids := map[string]bool{}
	if s.db == nil {
		for id := range s.items {
			ids[id] = true
		}
		return ids, nil
	}
	rows, err := s.db.Query(`SELECT student_id FROM arena_accounts`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids[id] = true
	}
	return ids, rows.Err()
}

func (s *Accounts) Get(id string) (Account, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.get(accountID(id))
}
func (s *Accounts) get(id string) (Account, error) {
	if s.db != nil {
		var data []byte
		err := s.db.QueryRow(`SELECT data FROM arena_accounts WHERE student_id=$1`, id).Scan(&data)
		if errors.Is(err, sql.ErrNoRows) {
			return Account{}, ErrAccountMissing
		}
		if err != nil {
			return Account{}, err
		}
		var a Account
		err = json.Unmarshal(data, &a)
		return a, err
	}
	a, ok := s.items[id]
	if !ok {
		return a, ErrAccountMissing
	}
	return a, nil
}

func (s *Accounts) save(a Account, create bool) error {
	data, err := json.Marshal(a)
	if err != nil {
		return err
	}
	if s.db != nil {
		if create {
			result, err := s.db.Exec(`INSERT INTO arena_accounts(student_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING`, a.StudentID, string(data))
			if err != nil {
				return err
			}
			n, err := result.RowsAffected()
			if err != nil {
				return err
			}
			if n == 0 {
				return ErrAccountExists
			}
			return nil
		}
		_, err = s.db.Exec(`UPDATE arena_accounts SET data=$2 WHERE student_id=$1`, a.StudentID, string(data))
		return err
	}
	next := make(map[string]Account, len(s.items)+1)
	for k, v := range s.items {
		next[k] = v
	}
	next[a.StudentID] = a
	data, err = json.Marshal(next)
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(s.path), ".accounts-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if err = f.Chmod(0600); err != nil {
		f.Close()
		return err
	}
	if _, err = f.Write(data); err != nil {
		f.Close()
		return err
	}
	if err = f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	if err = os.Rename(f.Name(), s.path); err != nil {
		return err
	}
	s.items = next
	return nil
}

func (s *Accounts) Create(id, name, password string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	id = accountID(id)
	if _, err := s.get(id); err == nil {
		return ErrAccountExists
	} else if !errors.Is(err, ErrAccountMissing) {
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	sealed, err := s.sealPassword(id, password)
	if err != nil {
		return err
	}
	return s.save(Account{StudentID: id, TeamName: strings.TrimSpace(name), Hash: string(hash), Secret: sealed, CreatedAt: time.Now().UTC()}, true)
}
func (s *Accounts) sealPassword(id, password string) (string, error) {
	nonce := make([]byte, s.cipher.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(s.cipher.Seal(nonce, nonce, []byte(password), []byte(id))), nil
}
func (s *Accounts) Authenticate(id, password string) (Account, error) {
	a, err := s.Get(id)
	if err != nil {
		return a, err
	}
	if a.Deleted {
		return a, ErrAccountMissing
	}
	if err = bcrypt.CompareHashAndPassword([]byte(a.Hash), []byte(password)); err != nil {
		return a, err
	}
	if _, err = s.Password(a); err == nil {
		return a, nil
	}
	// A verified login supplies the original password even when an old
	// encryption key was lost. Repair only its ciphertext, never the hash.
	s.mu.Lock()
	defer s.mu.Unlock()
	current, err := s.get(a.StudentID)
	if err != nil {
		return Account{}, err
	}
	if current.Deleted {
		return Account{}, ErrAccountMissing
	}
	if current.Hash != a.Hash {
		return Account{}, errors.New("Account credentials changed; sign in again")
	}
	sealed, err := s.sealPassword(a.StudentID, password)
	if err == nil {
		current.Secret = sealed
		err = s.save(current, false)
		if err == nil {
			return current, nil
		}
	}
	log.Printf("[Accounts] Verified login succeeded; ciphertext repair deferred")
	return a, nil
}
func (s *Accounts) Password(a Account) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(a.Secret)
	if err != nil {
		return "", err
	}
	n := s.cipher.NonceSize()
	if len(raw) < n {
		return "", errors.New("Invalid encrypted password")
	}
	data, err := s.cipher.Open(nil, raw[:n], raw[n:], []byte(a.StudentID))
	return string(data), err
}
func (s *Accounts) List() ([]Account, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	list := []Account{}
	if s.db != nil {
		rows, err := s.db.Query(`SELECT data FROM arena_accounts`)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		for rows.Next() {
			var raw []byte
			if err = rows.Scan(&raw); err != nil {
				return nil, err
			}
			var a Account
			if err = json.Unmarshal(raw, &a); err != nil {
				return nil, err
			}
			if !a.Deleted {
				list = append(list, a)
			}
		}
		if err = rows.Err(); err != nil {
			return nil, err
		}
	} else {
		for _, a := range s.items {
			if !a.Deleted {
				list = append(list, a)
			}
		}
	}
	sort.Slice(list, func(i, j int) bool { return list[i].CreatedAt.After(list[j].CreatedAt) })
	return list, nil
}
func (s *Accounts) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	a, err := s.get(accountID(id))
	if err != nil {
		return err
	}
	if a.Deleted {
		return ErrAccountMissing
	}
	a.Deleted = true
	a.Hash = ""
	a.Secret = ""
	return s.save(a, false)
}

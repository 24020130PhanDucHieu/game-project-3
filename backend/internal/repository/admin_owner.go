package repository

import (
	"crypto/subtle"
	"errors"
	"os"
	"strings"
	"sync"
	"time"
	"unicode"

	"golang.org/x/crypto/bcrypt"
)

// kv là phần của kho bản ghi (Postgres hoặc tệp JSON) mà các kho tài khoản quản trị cần.
type kv interface {
	Get(key string, target interface{}) error
	Batch(values map[string]interface{}) error
}

const ownerKey = "adminowner"

type ownerRecord struct {
	Hash              string    `json:"password_hash"`
	PasswordChangedAt time.Time `json:"password_changed_at"`
	ChangedBy         string    `json:"changed_by,omitempty"`
}

// AdminOwner là mật khẩu của tài khoản chủ ban tổ chức. Lúc đầu nó là biến môi trường ADMIN_PASSWORD;
// sau khi đổi qua web, mật khẩu mới (băm bcrypt) nằm trong kho bản ghi và thay thế hẳn ADMIN_PASSWORD.
//
// Khẩn cấp (quên mật khẩu và không dùng được email): đặt ADMIN_PASSWORD_FORCE_ENV=1 rồi khởi động lại
// để quay về ADMIN_PASSWORD trong file môi trường.
type AdminOwner struct {
	store kv
	mu    sync.Mutex
}

func NewAdminOwner(store kv) *AdminOwner { return &AdminOwner{store: store} }

func (a *AdminOwner) record() (ownerRecord, bool) {
	var rec ownerRecord
	if err := a.store.Get(ownerKey, &rec); err != nil || rec.Hash == "" {
		return ownerRecord{}, false
	}
	return rec, true
}

// UsesEnv: true khi mật khẩu chủ vẫn là ADMIN_PASSWORD trong file môi trường (chưa đổi qua web hoặc đang ép dùng env).
func (a *AdminOwner) UsesEnv() bool {
	_, stored := a.record()
	return !stored || os.Getenv("ADMIN_PASSWORD_FORCE_ENV") == "1"
}

// Verify so mật khẩu với thời gian không đổi.
func (a *AdminOwner) Verify(password string) bool {
	if rec, ok := a.record(); ok && os.Getenv("ADMIN_PASSWORD_FORCE_ENV") != "1" {
		return bcrypt.CompareHashAndPassword([]byte(rec.Hash), []byte(password)) == nil
	}
	configured := os.Getenv("ADMIN_PASSWORD")
	return configured != "" && subtle.ConstantTimeCompare([]byte(password), []byte(configured)) == 1
}

// Set đặt mật khẩu mới và ghi thời điểm đổi; mọi phiên cấp trước thời điểm này không còn hiệu lực (xem Valid).
func (a *AdminOwner) Set(newPassword, changedBy string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.store.Batch(map[string]interface{}{ownerKey: ownerRecord{Hash: string(hash), PasswordChangedAt: time.Now().UTC(), ChangedBy: changedBy}})
}

// Valid: phiên của chủ còn hiệu lực khi được cấp sau lần đổi mật khẩu gần nhất.
func (a *AdminOwner) Valid(issuedAt time.Time) bool {
	rec, ok := a.record()
	if !ok {
		return true
	}
	return rec.PasswordChangedAt.IsZero() || issuedAt.After(rec.PasswordChangedAt)
}

func (a *AdminOwner) ChangedAt() time.Time {
	rec, _ := a.record()
	return rec.PasswordChangedAt
}

var commonPasswords = map[string]bool{
	"admin123": true, "admin1234": true, "password": true, "password1": true, "password123": true, "12345678": true,
	"123456789": true, "1234567890": true, "qwerty123": true, "qwertyuiop": true, "iloveyou1": true, "matkhau123": true,
	"k69arena123": true, "botk69arena": true, "admin@123": true, "abc12345": true, "letmein123": true,
}

// ValidateAdminPassword: chính sách cho mật khẩu của chủ và giám khảo (tối thiểu 10 ký tự, tối đa 72 byte là giới hạn của bcrypt).
func ValidateAdminPassword(password, current, username string) error {
	if len(password) < 10 || len(password) > 72 {
		return errors.New("Mật khẩu mới cần từ 10 đến 72 ký tự.")
	}
	var letter, digit bool
	for _, r := range password {
		switch {
		case unicode.IsLetter(r):
			letter = true
		case unicode.IsDigit(r):
			digit = true
		}
	}
	if !letter || !digit {
		return errors.New("Mật khẩu mới cần có cả chữ và số.")
	}
	if password == current {
		return errors.New("Mật khẩu mới phải khác mật khẩu hiện tại.")
	}
	folded := strings.ToLower(password)
	if commonPasswords[folded] {
		return errors.New("Mật khẩu này quá phổ biến, hãy chọn mật khẩu khác.")
	}
	if u := strings.ToLower(strings.TrimSpace(username)); len(u) >= 3 && strings.Contains(folded, u) {
		return errors.New("Mật khẩu không được chứa tên đăng nhập.")
	}
	return nil
}

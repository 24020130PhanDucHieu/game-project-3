package repository

import (
	"database/sql"
	"encoding/json"
	"errors"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// Judge là tài khoản giám khảo/ban tổ chức riêng từng người, lưu trong kho KV bền vững
// với khóa "judge:<username>". Tài khoản chủ (ADMIN_PASSWORD) vẫn dùng được để khẩn cấp.
type Judge struct {
	Username          string    `json:"username"`
	DisplayName       string    `json:"display_name"`
	Hash              string    `json:"password_hash"`
	Email             string    `json:"email,omitempty"` // nhận mã xác thực khi tự đổi mật khẩu
	Disabled          bool      `json:"disabled"`
	CreatedAt         time.Time `json:"created_at"`
	CreatedBy         string    `json:"created_by"`
	PasswordChangedAt time.Time `json:"password_changed_at,omitempty"`
	LastLoginAt       time.Time `json:"last_login_at,omitempty"`
}

// JudgeView là dạng trả về API, không bao giờ có hash mật khẩu.
type JudgeView struct {
	Username    string    `json:"username"`
	DisplayName string    `json:"display_name"`
	Email       string    `json:"email"` // đã che: ab***@gmail.com
	HasEmail    bool      `json:"has_email"`
	Disabled    bool      `json:"disabled"`
	CreatedAt   time.Time `json:"created_at"`
	CreatedBy   string    `json:"created_by"`
	LastLoginAt time.Time `json:"last_login_at,omitempty"`
}

var (
	ErrJudgeExists      = errors.New("Tên đăng nhập giám khảo đã tồn tại.")
	ErrJudgeMissing     = errors.New("Không tìm thấy giám khảo.")
	ErrJudgeCredentials = errors.New("Sai tên đăng nhập hoặc mật khẩu, hoặc tài khoản đã bị khóa.")
	judgeNamePattern    = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{2,31}$`)
	dummyJudgeHash      []byte
	dummyJudgeHashOnce  sync.Once
	reservedJudgeNames  = map[string]bool{"admin": true, "bquantri": true, "btc": true, "trongtai": true, "referee": true, "owner": true}
)

type Judges struct{ store *QualifierRecords }

func NewJudges(store *QualifierRecords) *Judges { return &Judges{store: store} }

func judgeKey(username string) string { return "judge:" + username }

func NormalizeJudgeName(username string) string { return strings.ToLower(strings.TrimSpace(username)) }

func (j *Judges) Get(username string) (Judge, error) {
	var judge Judge
	err := j.store.Get(judgeKey(NormalizeJudgeName(username)), &judge)
	if errors.Is(err, sql.ErrNoRows) {
		return Judge{}, ErrJudgeMissing
	}
	return judge, err
}

func (j *Judges) save(judge Judge) error {
	return j.store.Batch(map[string]interface{}{judgeKey(judge.Username): judge})
}

func ValidateJudgePassword(password string) error {
	if len(password) < 8 || len(password) > 72 {
		return errors.New("Mật khẩu giám khảo cần 8–72 ký tự.")
	}
	return nil
}

func (j *Judges) Create(username, displayName, password, createdBy string) (JudgeView, error) {
	return j.CreateWithEmail(username, displayName, password, "", createdBy)
}

func (j *Judges) CreateWithEmail(username, displayName, password, email, createdBy string) (JudgeView, error) {
	username = NormalizeJudgeName(username)
	email = strings.TrimSpace(email)
	if email != "" && !emailOK(email) {
		return JudgeView{}, errors.New("Email giám khảo không hợp lệ.")
	}
	displayName = strings.TrimSpace(displayName)
	if !judgeNamePattern.MatchString(username) || reservedJudgeNames[username] {
		return JudgeView{}, errors.New("Tên đăng nhập 3–32 ký tự: chữ thường, số, dấu chấm, gạch ngang/gạch dưới; không trùng tên quản trị dành riêng.")
	}
	if displayName == "" || len([]rune(displayName)) > 80 {
		return JudgeView{}, errors.New("Tên hiển thị không được trống, tối đa 80 ký tự.")
	}
	if err := ValidateJudgePassword(password); err != nil {
		return JudgeView{}, err
	}
	if _, err := j.Get(username); err == nil {
		return JudgeView{}, ErrJudgeExists
	} else if !errors.Is(err, ErrJudgeMissing) {
		return JudgeView{}, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return JudgeView{}, err
	}
	judge := Judge{Username: username, DisplayName: displayName, Hash: string(hash), Email: email, CreatedAt: time.Now().UTC(), CreatedBy: createdBy}
	if err := j.save(judge); err != nil {
		return JudgeView{}, err
	}
	return judge.View(), nil
}

func (judge Judge) View() JudgeView {
	return JudgeView{Username: judge.Username, DisplayName: judge.DisplayName, Email: MaskEmail(judge.Email), HasEmail: judge.Email != "", Disabled: judge.Disabled, CreatedAt: judge.CreatedAt, CreatedBy: judge.CreatedBy, LastLoginAt: judge.LastLoginAt}
}

// Authenticate so sánh mật khẩu với thời gian không đổi kể cả khi tài khoản không tồn tại.
func (j *Judges) Authenticate(username, password string) (Judge, error) {
	judge, err := j.Get(username)
	if err != nil && !errors.Is(err, ErrJudgeMissing) {
		return Judge{}, err
	}
	hash := judge.Hash
	if hash == "" {
		dummyJudgeHashOnce.Do(func() { dummyJudgeHash, _ = bcrypt.GenerateFromPassword([]byte("no-such-judge"), bcrypt.DefaultCost) })
		hash = string(dummyJudgeHash)
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil || judge.Username == "" || judge.Disabled {
		return Judge{}, ErrJudgeCredentials
	}
	judge.LastLoginAt = time.Now().UTC()
	_ = j.save(judge)
	return judge, nil
}

// Valid xác nhận phiên giám khảo còn hiệu lực: tài khoản còn tồn tại, chưa khóa, phiên cấp sau lần đổi mật khẩu.
func (j *Judges) Valid(username string, issuedAt time.Time) (bool, error) {
	judge, err := j.Get(username)
	if errors.Is(err, ErrJudgeMissing) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return !judge.Disabled && (judge.PasswordChangedAt.IsZero() || issuedAt.After(judge.PasswordChangedAt)), nil
}

func (j *Judges) List() ([]JudgeView, error) {
	rows, err := j.store.List("judge:")
	if err != nil {
		return nil, err
	}
	out := make([]JudgeView, 0, len(rows))
	for _, raw := range rows {
		var judge Judge
		if json.Unmarshal(raw, &judge) == nil && judge.Username != "" {
			out = append(out, judge.View())
		}
	}
	sort.Slice(out, func(a, b int) bool { return out[a].Username < out[b].Username })
	return out, nil
}

func (j *Judges) SetDisabled(username string, disabled bool) (JudgeView, error) {
	judge, err := j.Get(username)
	if err != nil {
		return JudgeView{}, err
	}
	judge.Disabled = disabled
	if disabled {
		// Khóa cũng thu hồi mọi phiên đang mở của giám khảo này.
		judge.PasswordChangedAt = time.Now().UTC()
	}
	return judge.View(), j.save(judge)
}

func (j *Judges) ResetPassword(username, password string) (JudgeView, error) {
	if err := ValidateJudgePassword(password); err != nil {
		return JudgeView{}, err
	}
	judge, err := j.Get(username)
	if err != nil {
		return JudgeView{}, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return JudgeView{}, err
	}
	judge.Hash = string(hash)
	judge.PasswordChangedAt = time.Now().UTC()
	return judge.View(), j.save(judge)
}

var emailRe = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

func emailOK(email string) bool { return len(email) <= 120 && emailRe.MatchString(email) }

// MaskEmail che phần giữa địa chỉ email: ab***@gmail.com (rỗng nếu không hợp lệ).
func MaskEmail(email string) string {
	at := strings.LastIndex(email, "@")
	if at <= 0 {
		return ""
	}
	name := email[:at]
	keep := 2
	if len(name) <= 2 {
		keep = 1
	}
	return name[:keep] + "***" + email[at:]
}

// Email trả email đã lưu của giám khảo (dùng nội bộ để gửi mã xác thực).
func (j *Judges) Email(username string) (string, error) {
	judge, err := j.Get(username)
	if err != nil {
		return "", err
	}
	return judge.Email, nil
}

func (j *Judges) SetEmail(username, email string) (JudgeView, error) {
	email = strings.TrimSpace(email)
	if email != "" && !emailOK(email) {
		return JudgeView{}, errors.New("Email giám khảo không hợp lệ.")
	}
	judge, err := j.Get(username)
	if err != nil {
		return JudgeView{}, err
	}
	judge.Email = email
	return judge.View(), j.save(judge)
}

// CheckPassword kiểm mật khẩu mà không đổi gì (không cập nhật lần đăng nhập gần nhất).
func (j *Judges) CheckPassword(username, password string) bool {
	judge, err := j.Get(username)
	if err != nil || judge.Disabled || judge.Hash == "" {
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(judge.Hash), []byte(password)) == nil
}

// SetOwnPassword: giám khảo tự đổi mật khẩu (đã qua bước xác thực ở handler). Mọi phiên cũ của họ bị thu hồi
// vì PasswordChangedAt mới hơn thời điểm cấp phiên.
func (j *Judges) SetOwnPassword(username, password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	judge, err := j.Get(username)
	if err != nil {
		return err
	}
	judge.Hash = string(hash)
	judge.PasswordChangedAt = time.Now().UTC()
	return j.save(judge)
}

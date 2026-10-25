package http

import (
	"encoding/json"
	"errors"
	"net/http"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"project-tuan3/internal/auth"
	"project-tuan3/internal/humancheck"
	"project-tuan3/internal/repository"
)

type mailbox struct {
	mu       sync.Mutex
	messages []struct{ To, Subject, Body string }
	fail     bool
	disabled bool
}

func (m *mailbox) Configured() bool { return !m.disabled }
func (m *mailbox) Send(to, subject, body string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.fail {
		return errors.New("smtp down")
	}
	m.messages = append(m.messages, struct{ To, Subject, Body string }{to, subject, body})
	return nil
}
func (m *mailbox) last() (to, subject, body string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.messages) == 0 {
		return
	}
	x := m.messages[len(m.messages)-1]
	return x.To, x.Subject, x.Body
}
func (m *mailbox) count() int { m.mu.Lock(); defer m.mu.Unlock(); return len(m.messages) }

var codeRe = regexp.MustCompile(`\b\d{6}\b`)

func (m *mailbox) code(t *testing.T) string {
	t.Helper()
	_, _, body := m.last()
	c := codeRe.FindString(body)
	if c == "" {
		t.Fatalf("email không có mã 6 số: %q", body)
	}
	return c
}

type pwFixture struct {
	r      *gin.Engine
	mail   *mailbox
	owner  *repository.AdminOwner
	judges *repository.Judges
	store  *repository.QualifierRecords
	otp    *OTPService
	clock  *time.Time
	audit  []string
	h      *AdminPasswordHandler
}

func newPW(t *testing.T) *pwFixture {
	t.Helper()
	t.Setenv("ADMIN_PASSWORD", "owner-password")
	t.Setenv("ADMIN_EMAIL", "btc@example.com")
	t.Setenv("ADMIN_PASSWORD_FORCE_ENV", "")
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	store, err := repository.NewQualifierRecords(repository.NewJSONTournamentRepository(filepath.Join(dir, "t.json")), filepath.Join(dir, "kv"))
	if err != nil {
		t.Fatal(err)
	}
	f := &pwFixture{store: store, mail: &mailbox{}, owner: repository.NewAdminOwner(store), judges: repository.NewJudges(store)}
	clock := time.Now()
	f.clock = &clock
	sessions := auth.NewManager()
	sessions.CheckSession = func(s auth.Session) (bool, error) {
		if s.Role == "ADMIN" {
			if s.Judge == "" {
				return f.owner.Valid(s.IssuedAt), nil
			}
			return f.judges.Valid(s.Judge, s.IssuedAt)
		}
		return true, nil
	}
	mh := NewMatchHandler(nil, sessions)
	mh.Judges, mh.Owner = f.judges, f.owner
	f.otp = &OTPService{Store: store, Key: []byte("test-key"), Now: func() time.Time { return *f.clock }}
	f.h = &AdminPasswordHandler{Owner: f.owner, Judges: f.judges, OTP: f.otp, Mailer: f.mail, Sessions: sessions,
		Locked: mh.AdminLockedFor, Result: mh.AdminResultFor, AdminEmail: AdminEmailFromEnv,
		Audit: func(actor, action string, d map[string]interface{}) { f.audit = append(f.audit, actor+":"+action) }}
	jh := &JudgesHandler{Judges: f.judges}
	session := func(c *gin.Context) {
		token := c.GetHeader("Authorization")
		if len(token) > 7 {
			if s, ok, _ := sessions.GetChecked(token[7:]); ok {
				c.Set("session", s)
				return
			}
		}
		c.AbortWithStatus(http.StatusUnauthorized)
	}
	r := gin.New()
	r.POST("/login", mh.AdminLogin)
	r.GET("/me", session, func(c *gin.Context) { c.JSON(200, gin.H{"actor": requestSession(c).Actor()}) })
	r.POST("/judges", session, jh.Create)
	r.PUT("/judges/:username/email", session, jh.SetEmail)
	r.POST("/password/request", session, f.h.Request)
	r.POST("/password/change", session, f.h.Change)
	r.POST("/password/forgot", f.h.Forgot)
	r.POST("/password/reset", f.h.Reset)
	f.r = r
	return f
}

func (f *pwFixture) login(t *testing.T, user, pass string) string {
	t.Helper()
	code, out := send(f.r, "POST", "/login", "", map[string]string{"username": user, "password": pass})
	if code != 200 {
		t.Fatalf("đăng nhập %s: %d %v", user, code, out)
	}
	return out["session_token"].(string)
}

func (f *pwFixture) tick(d time.Duration) { *f.clock = f.clock.Add(d) }

func TestOwnerChangesPasswordWithEmailCode(t *testing.T) {
	f := newPW(t)
	old := f.login(t, "admin", "owner-password")
	other := f.login(t, "admin", "owner-password") // thiết bị khác

	code, out := send(f.r, "POST", "/password/request", old, map[string]string{"current_password": "sai-mat-khau"})
	if code != 403 || out["code"] != "BAD_CURRENT" || f.mail.count() != 0 {
		t.Fatalf("sai mật khẩu hiện tại không được gửi mã: %d %v", code, out)
	}
	code, out = send(f.r, "POST", "/password/request", old, map[string]string{"current_password": "owner-password"})
	if code != 200 || out["sent_to"] != "bt***@example.com" || out["expires_in"] != float64(600) {
		t.Fatalf("request: %d %v", code, out)
	}
	to, _, body := f.mail.last()
	if to != "btc@example.com" || !strings.Contains(body, "không chia sẻ") {
		t.Fatalf("mail gửi sai nơi/nội dung: %s", body)
	}
	mailCode := f.mail.code(t)
	for _, v := range out {
		if s, ok := v.(string); ok && strings.Contains(s, mailCode) {
			t.Fatal("mã không được xuất hiện trong phản hồi API")
		}
	}
	// mã không nằm thô trong kho lưu trữ
	for _, key := range []string{"adminotp:change:owner", "adminotpmeta:owner"} {
		var raw map[string]interface{}
		_ = f.store.Get(key, &raw)
		if strings.Contains(strings.ToLower(toJSON(raw)), mailCode) {
			t.Fatalf("mã thô nằm trong kho: %s", key)
		}
	}
	// mật khẩu yếu bị bác TRƯỚC khi dùng mã
	if code, out := send(f.r, "POST", "/password/change", old, map[string]string{"current_password": "owner-password", "code": mailCode, "new_password": "admin123"}); code != 400 || out["code"] != "WEAK_PASSWORD" {
		t.Fatalf("mật khẩu yếu: %d %v", code, out)
	}
	if code, out := send(f.r, "POST", "/password/change", old, map[string]string{"current_password": "owner-password", "code": "000000", "new_password": "mat-khau-moi-2026"}); code != 400 || out["code"] != "OTP_INVALID" || out["remaining"] != float64(4) {
		t.Fatalf("sai mã: %d %v", code, out)
	}
	if code, _ := send(f.r, "POST", "/password/change", old, map[string]string{"current_password": "sai", "code": mailCode, "new_password": "mat-khau-moi-2026"}); code != 403 {
		t.Fatalf("bước 2 phải kiểm lại mật khẩu hiện tại: %d", code)
	}
	code, out = send(f.r, "POST", "/password/change", old, map[string]string{"current_password": "owner-password", "code": mailCode, "new_password": "mat-khau-moi-2026"})
	if code != 200 || out["session_token"] == nil {
		t.Fatalf("change: %d %v", code, out)
	}
	fresh := out["session_token"].(string)
	if c, _ := send(f.r, "GET", "/me", old, nil); c != 401 {
		t.Fatalf("phiên cũ phải bị thu hồi: %d", c)
	}
	if c, _ := send(f.r, "GET", "/me", other, nil); c != 401 {
		t.Fatalf("phiên ở thiết bị khác phải bị thu hồi: %d", c)
	}
	if c, _ := send(f.r, "GET", "/me", fresh, nil); c != 200 {
		t.Fatalf("phiên mới phải dùng được: %d", c)
	}
	if c, _ := send(f.r, "POST", "/login", "", map[string]string{"username": "admin", "password": "owner-password"}); c != 401 {
		t.Fatalf("mật khẩu cũ (ADMIN_PASSWORD) phải ngừng hiệu lực: %d", c)
	}
	f.login(t, "admin", "mat-khau-moi-2026")
	// mã dùng một lần
	if code, out := send(f.r, "POST", "/password/change", fresh, map[string]string{"current_password": "mat-khau-moi-2026", "code": mailCode, "new_password": "mat-khau-khac-2026"}); code != 400 || out["code"] != "OTP_EXPIRED" {
		t.Fatalf("mã đã dùng phải bị bác: %d %v", code, out)
	}
	deadline := time.Now().Add(2 * time.Second)
	for f.mail.count() < 2 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if _, subject, body := f.mail.last(); !strings.Contains(subject, "vừa được đổi") || !strings.Contains(body, "Quên mật khẩu ban tổ chức") {
		t.Fatalf("thiếu email cảnh báo: %s / %s", subject, body)
	}
	if len(f.audit) != 1 || f.audit[0] != "owner:ADMIN_PASSWORD_CHANGED" {
		t.Fatalf("nhật ký quản trị: %v", f.audit)
	}
}

func TestOTPAttemptsExpiryAndRateLimits(t *testing.T) {
	f := newPW(t)
	tok := f.login(t, "admin", "owner-password")
	ask := func() (int, map[string]interface{}) {
		return send(f.r, "POST", "/password/request", tok, map[string]string{"current_password": "owner-password"})
	}
	if c, _ := ask(); c != 200 {
		t.Fatal("lần 1")
	}
	if c, out := ask(); c != 429 || out["code"] != "OTP_TOO_SOON" || out["retry_after"].(float64) < 50 {
		t.Fatalf("gửi lại quá sớm phải bị chặn: %d %v", c, out)
	}
	good := f.mail.code(t)
	body := func(code string) map[string]string {
		return map[string]string{"current_password": "owner-password", "code": code, "new_password": "mat-khau-moi-2026"}
	}
	wrong := "111111"
	if good == wrong {
		wrong = "222222"
	}
	for i := 0; i < 4; i++ {
		if c, out := send(f.r, "POST", "/password/change", tok, body(wrong)); c != 400 || out["code"] != "OTP_INVALID" {
			t.Fatalf("lần sai %d: %d %v", i+1, c, out)
		}
	}
	if c, out := send(f.r, "POST", "/password/change", tok, body(wrong)); c != 429 || out["code"] != "OTP_LOCKED" {
		t.Fatalf("sai lần 5 phải hủy mã: %d %v", c, out)
	}
	if c, out := send(f.r, "POST", "/password/change", tok, body(good)); c != 400 || out["code"] != "OTP_EXPIRED" {
		t.Fatalf("mã đúng nhưng đã bị hủy sau 5 lần sai: %d %v", c, out)
	}
	// hết hạn sau 10 phút
	f.tick(61 * time.Second)
	if c, _ := ask(); c != 200 {
		t.Fatal("mã mới")
	}
	fresh := f.mail.code(t)
	f.tick(11 * time.Minute)
	if c, out := send(f.r, "POST", "/password/change", tok, body(fresh)); c != 400 || out["code"] != "OTP_EXPIRED" {
		t.Fatalf("mã hết hạn: %d %v", c, out)
	}
	// tối đa 5 mã mỗi giờ
	f.tick(0)
	sent := 2
	for i := 0; i < 6 && sent < otpMaxPerHour; i++ {
		f.tick(61 * time.Second)
		if c, _ := ask(); c != 200 {
			break
		}
		sent++
	}
	f.tick(61 * time.Second)
	if c, out := ask(); c != 429 || out["code"] != "OTP_TOO_MANY" {
		t.Fatalf("vượt 5 mã/giờ: %d %v (đã gửi %d)", c, out, sent)
	}
	f.tick(time.Hour)
	if c, _ := ask(); c != 200 {
		t.Fatal("sau 1 giờ phải gửi lại được")
	}
}

func TestWrongCurrentPasswordTriggersSharedLockout(t *testing.T) {
	f := newPW(t)
	tok := f.login(t, "admin", "owner-password")
	for i := 0; i < adminMaxFailures; i++ {
		if c, _ := send(f.r, "POST", "/password/request", tok, map[string]string{"current_password": "sai"}); c != 403 {
			t.Fatalf("lần %d", i+1)
		}
	}
	if c, out := send(f.r, "POST", "/password/request", tok, map[string]string{"current_password": "owner-password"}); c != 429 || out["code"] != "LOCKED" {
		t.Fatalf("sai 5 lần phải bị khóa dù lần sau nhập đúng: %d %v", c, out)
	}
	// khóa này cũng chặn đăng nhập ban tổ chức từ cùng IP
	if c, _ := send(f.r, "POST", "/login", "", map[string]string{"username": "admin", "password": "owner-password"}); c != 429 {
		t.Fatalf("khóa dùng chung với đăng nhập: %d", c)
	}
}

func TestMailUnavailableAndFailureHandling(t *testing.T) {
	f := newPW(t)
	tok := f.login(t, "admin", "owner-password")
	req := map[string]string{"current_password": "owner-password"}
	f.mail.disabled = true
	if c, out := send(f.r, "POST", "/password/request", tok, req); c != 503 || out["code"] != "MAIL_UNCONFIGURED" {
		t.Fatalf("chưa cấu hình SMTP: %d %v", c, out)
	}
	f.mail.disabled, f.mail.fail = false, true
	if c, out := send(f.r, "POST", "/password/request", tok, req); c != 502 || out["code"] != "MAIL_FAILED" {
		t.Fatalf("gửi lỗi: %d %v", c, out)
	}
	// gửi lỗi không bị tính vào hạn mức và không để lại mã dùng được
	f.mail.fail = false
	if c, _ := send(f.r, "POST", "/password/request", tok, req); c != 200 {
		t.Fatal("sau khi mail hồi phục phải gửi được ngay, không bị chặn 60 giây")
	}
	t.Setenv("ADMIN_EMAIL", "")
	t.Setenv("SMTP_USER", "")
	f.tick(2 * time.Minute)
	if c, out := send(f.r, "POST", "/password/request", tok, req); c != 409 || out["code"] != "NO_EMAIL" {
		t.Fatalf("chưa có email nhận mã: %d %v", c, out)
	}
}

func TestJudgeNeedsOwnEmailAndRevokesSessions(t *testing.T) {
	f := newPW(t)
	owner := f.login(t, "admin", "owner-password")
	if c, out := send(f.r, "POST", "/judges", owner, map[string]string{"username": "gk.lan", "display_name": "Giám khảo Lan", "password": "mat-khau-gk-1", "email": "khong-hop-le"}); c != 400 {
		t.Fatalf("email sai: %d %v", c, out)
	}
	if c, out := send(f.r, "POST", "/judges", owner, map[string]string{"username": "gk.lan", "display_name": "Giám khảo Lan", "password": "mat-khau-gk-1"}); c != 200 {
		t.Fatalf("tạo giám khảo: %d %v", c, out)
	}
	judge := f.login(t, "gk.lan", "mat-khau-gk-1")
	cur := map[string]string{"current_password": "mat-khau-gk-1"}
	if c, out := send(f.r, "POST", "/password/request", judge, cur); c != 409 || out["code"] != "NO_EMAIL" || f.mail.count() != 0 {
		t.Fatalf("giám khảo chưa có email phải bị chặn, không hạ mức xác thực: %d %v", c, out)
	}
	if c, _ := send(f.r, "PUT", "/judges/gk.lan/email", judge, map[string]string{"email": "gk@example.com"}); c != 403 {
		t.Fatalf("giám khảo không được tự đặt email nhận mã: %d", c)
	}
	if c, out := send(f.r, "PUT", "/judges/gk.lan/email", owner, map[string]string{"email": "gk.lan@example.com"}); c != 200 {
		t.Fatalf("chủ đặt email: %d %v", c, out)
	}
	if c, out := send(f.r, "POST", "/password/request", judge, cur); c != 200 || out["sent_to"] != "gk***@example.com" {
		t.Fatalf("request: %d %v", c, out)
	}
	if to, _, _ := f.mail.last(); to != "gk.lan@example.com" {
		t.Fatalf("mã phải tới email của chính giám khảo: %s", to)
	}
	// mã của giám khảo không dùng được cho chủ và ngược lại
	if c, out := send(f.r, "POST", "/password/change", owner, map[string]string{"current_password": "owner-password", "code": f.mail.code(t), "new_password": "owner-moi-2026x"}); c != 400 || out["code"] != "OTP_EXPIRED" {
		t.Fatalf("mã không được dùng chéo danh tính: %d %v", c, out)
	}
	if c, out := send(f.r, "POST", "/password/change", judge, map[string]string{"current_password": "mat-khau-gk-1", "code": f.mail.code(t), "new_password": "gk.lan-2026-moi"}); c != 400 || out["code"] != "WEAK_PASSWORD" {
		t.Fatalf("mật khẩu chứa tên đăng nhập: %d %v", c, out)
	}
	c, out := send(f.r, "POST", "/password/change", judge, map[string]string{"current_password": "mat-khau-gk-1", "code": f.mail.code(t), "new_password": "mat-khau-gk-moi-9"})
	if c != 200 {
		t.Fatalf("giám khảo đổi: %d %v", c, out)
	}
	if cc, _ := send(f.r, "GET", "/me", judge, nil); cc != 401 {
		t.Fatalf("phiên cũ của giám khảo phải bị thu hồi: %d", cc)
	}
	if cc, me := send(f.r, "GET", "/me", out["session_token"].(string), nil); cc != 200 || me["actor"] != "gk.lan" {
		t.Fatalf("phiên mới của giám khảo: %d %v", cc, me)
	}
	f.login(t, "gk.lan", "mat-khau-gk-moi-9")
	if cc, _ := send(f.r, "GET", "/me", owner, nil); cc != 200 {
		t.Fatalf("đổi mật khẩu giám khảo không được làm văng chủ: %d", cc)
	}
}

func TestForgotAndResetPassword(t *testing.T) {
	f := newPW(t)
	tok := f.login(t, "admin", "owner-password")
	f.h.Human = humancheck.New([]byte("k"), 8, true)
	if c, out := send(f.r, "POST", "/password/forgot", "", map[string]string{}); c != 400 || out["human_check"] != true {
		t.Fatalf("phải có chống robot: %d %v", c, out)
	}
	f.h.Human = nil
	if c, out := send(f.r, "POST", "/password/forgot", "", map[string]string{}); c != 200 || out["sent_to"] != nil {
		t.Fatalf("forgot không được tiết lộ địa chỉ email: %d %v", c, out)
	}
	if to, subject, _ := f.mail.last(); to != "btc@example.com" || !strings.Contains(subject, "đặt lại") {
		t.Fatalf("mã đặt lại: %s %s", to, subject)
	}
	code := f.mail.code(t)
	// mã "đặt lại" không dùng được cho "đổi" và ngược lại
	if c, out := send(f.r, "POST", "/password/change", tok, map[string]string{"current_password": "owner-password", "code": code, "new_password": "mat-khau-moi-2026"}); c != 400 || out["code"] != "OTP_EXPIRED" {
		t.Fatalf("mã reset không được dùng cho đổi: %d %v", c, out)
	}
	if c, out := send(f.r, "POST", "/password/reset", "", map[string]string{"code": code, "new_password": "yeu"}); c != 400 || out["code"] != "WEAK_PASSWORD" {
		t.Fatalf("%d %v", c, out)
	}
	if c, out := send(f.r, "POST", "/password/reset", "", map[string]string{"code": "123456", "new_password": "mat-khau-moi-2026"}); c != 400 || out["code"] != "OTP_INVALID" {
		t.Fatalf("%d %v", c, out)
	}
	if c, out := send(f.r, "POST", "/password/reset", "", map[string]string{"code": code, "new_password": "mat-khau-moi-2026"}); c != 200 {
		t.Fatalf("reset: %d %v", c, out)
	}
	if c, _ := send(f.r, "GET", "/me", tok, nil); c != 401 {
		t.Fatalf("reset phải thu hồi phiên cũ: %d", c)
	}
	f.login(t, "admin", "mat-khau-moi-2026")
	// tối đa 3 lần quên mỗi giờ mỗi IP
	for i := 0; i < forgotPerHour; i++ {
		f.tick(61 * time.Second)
		send(f.r, "POST", "/password/forgot", "", map[string]string{})
	}
	f.tick(61 * time.Second)
	if c, _ := send(f.r, "POST", "/password/forgot", "", map[string]string{}); c != 429 {
		t.Fatalf("quá 3 lần/giờ/IP: %d", c)
	}
}

func TestPersistedPasswordSurvivesRestartAndEmergencyEnv(t *testing.T) {
	f := newPW(t)
	if err := f.owner.Set("mat-khau-luu-2026", "test"); err != nil {
		t.Fatal(err)
	}
	// "khởi động lại": dựng lại đối tượng trên cùng kho dữ liệu
	again := repository.NewAdminOwner(f.store)
	if !again.Verify("mat-khau-luu-2026") || again.Verify("owner-password") || again.UsesEnv() {
		t.Fatal("mật khẩu đã đổi phải còn sau khi khởi động lại và thay hẳn ADMIN_PASSWORD")
	}
	t.Setenv("ADMIN_PASSWORD_FORCE_ENV", "1")
	if !again.Verify("owner-password") || again.Verify("mat-khau-luu-2026") || !again.UsesEnv() {
		t.Fatal("lệnh khẩn cấp phải quay về ADMIN_PASSWORD")
	}
	if again.Valid(time.Now().Add(-time.Hour)) {
		t.Fatal("phiên cũ vẫn bị thu hồi kể cả ở chế độ khẩn cấp")
	}
}

func TestPasswordPolicy(t *testing.T) {
	for pw, ok := range map[string]bool{"mat-khau-moi-2026": true, "Abcdefghi1": true, "ngan1": false, "khongcoso-chu-thoi": false, "1234567890123": false, "admin123": false, "Admin@123": false, strings.Repeat("a1", 40): false} {
		if err := repository.ValidateAdminPassword(pw, "cu-cu-cu-cu1", "admin"); (err == nil) != ok {
			t.Errorf("%q: muốn ok=%v, lỗi=%v", pw, ok, err)
		}
	}
	if repository.ValidateAdminPassword("cu-cu-cu-cu1", "cu-cu-cu-cu1", "admin") == nil {
		t.Error("không được trùng mật khẩu hiện tại")
	}
	if repository.ValidateAdminPassword("xx-admin-12345", "", "admin") == nil {
		t.Error("không được chứa tên đăng nhập")
	}
}

func toJSON(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}

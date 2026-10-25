package http

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"project-tuan3/internal/auth"
	"project-tuan3/internal/humancheck"
	"project-tuan3/internal/mailer"
	"project-tuan3/internal/repository"
)

// AdminPasswordHandler: đổi/đặt lại mật khẩu của tài khoản chủ và giám khảo.
//
// Đổi mật khẩu cần ba yếu tố: (1) đang đăng nhập, (2) mật khẩu hiện tại (kiểm ở cả hai bước),
// (3) mã 6 số gửi tới email đã đăng ký. Đổi xong mọi phiên cũ bị thu hồi và email cảnh báo được gửi.
type AdminPasswordHandler struct {
	Owner      *repository.AdminOwner
	Judges     *repository.Judges
	OTP        *OTPService
	Mailer     mailer.Sender
	Human      *humancheck.Guard
	Sessions   *auth.Manager
	Audit      func(actor, action string, details map[string]interface{})
	Locked     func(ip string) time.Duration // khóa đăng nhập sai chung với đăng nhập ban tổ chức
	Result     func(ip string, ok bool)
	AdminEmail func() string // email nhận mã của tài khoản chủ

	mu         sync.Mutex
	forgotSeen map[string][]time.Time
}

const (
	purposeChange = "change"
	purposeReset  = "reset"
	forgotPerHour = 3
)

// AdminEmailFromEnv: email nhận mã của tài khoản chủ: ADMIN_EMAIL, mặc định hộp thư gửi đi (SMTP_USER).
func AdminEmailFromEnv() string {
	if v := strings.TrimSpace(os.Getenv("ADMIN_EMAIL")); v != "" {
		return v
	}
	return strings.TrimSpace(os.Getenv("SMTP_USER"))
}

func (h *AdminPasswordHandler) lockedReply(c *gin.Context) bool {
	if wait := h.Locked(c.ClientIP()); wait > 0 {
		c.Header("Retry-After", strconv.Itoa(int(wait.Seconds())+1))
		c.JSON(http.StatusTooManyRequests, gin.H{"detail": fmt.Sprintf("Sai mật khẩu quá %d lần. Thử lại sau %d phút.", adminMaxFailures, int(wait.Minutes())+1), "code": "LOCKED"})
		return true
	}
	return false
}

type adminWho struct {
	Identity string // "owner" hoặc "judge:<tên>"
	Username string
	Email    string
	Owner    bool
}

func (h *AdminPasswordHandler) who(s auth.Session) (adminWho, error) {
	if s.IsOwner() {
		return adminWho{Identity: "owner", Username: "admin", Email: strings.TrimSpace(h.AdminEmail()), Owner: true}, nil
	}
	email, err := h.Judges.Email(s.Judge)
	if err != nil {
		return adminWho{}, err
	}
	return adminWho{Identity: "judge:" + s.Judge, Username: s.Judge, Email: email}, nil
}

func (h *AdminPasswordHandler) verifyCurrent(w adminWho, password string) bool {
	if w.Owner {
		return h.Owner.Verify(password)
	}
	return h.Judges.CheckPassword(w.Username, password)
}

func (h *AdminPasswordHandler) mailReady(c *gin.Context) bool {
	if h.Mailer == nil || !h.Mailer.Configured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Hệ thống chưa cấu hình gửi email nên chưa đổi được mật khẩu qua web. Liên hệ người quản trị máy chủ.", "code": "MAIL_UNCONFIGURED"})
		return false
	}
	return true
}

func vnTime(t time.Time) string {
	return t.In(time.FixedZone("ICT", 7*3600)).Format("15:04 02/01/2006")
}

func (h *AdminPasswordHandler) otpFailure(c *gin.Context, remaining int, err error) {
	switch {
	case errors.Is(err, ErrOTPInvalid):
		c.JSON(http.StatusBadRequest, gin.H{"detail": fmt.Sprintf("Mã xác thực không đúng. Còn %d lần thử.", remaining), "code": "OTP_INVALID", "remaining": remaining})
	case errors.Is(err, ErrOTPLocked):
		c.JSON(http.StatusTooManyRequests, gin.H{"detail": err.Error(), "code": "OTP_LOCKED"})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error(), "code": "OTP_EXPIRED"})
	}
}

func (h *AdminPasswordHandler) issueAndSend(c *gin.Context, w adminWho, purpose, subject string, lines []string) bool {
	code, err := h.OTP.Issue(w.Identity, purpose)
	if err != nil {
		var soon OTPTooSoon
		switch {
		case errors.As(err, &soon):
			c.Header("Retry-After", strconv.Itoa(soon.Wait))
			c.JSON(http.StatusTooManyRequests, gin.H{"detail": soon.Error(), "code": "OTP_TOO_SOON", "retry_after": soon.Wait})
		case errors.Is(err, ErrOTPTooMany):
			c.Header("Retry-After", "3600")
			c.JSON(http.StatusTooManyRequests, gin.H{"detail": err.Error(), "code": "OTP_TOO_MANY"})
		default:
			c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Chưa tạo được mã xác thực, hãy thử lại."})
		}
		return false
	}
	body := strings.Join(append(lines, "", "    "+code, "", "Mã có hiệu lực 10 phút và chỉ dùng được một lần. TUYỆT ĐỐI không chia sẻ mã này cho bất kỳ ai, kể cả người tự xưng là ban tổ chức.", "Nếu bạn không yêu cầu, hãy bỏ qua email này; mật khẩu của bạn vẫn an toàn.", "", "BOT K69 ARENA"), "\n")
	if err := h.Mailer.Send(w.Email, subject, body); err != nil {
		h.OTP.Cancel(w.Identity, purpose)
		log.Printf("[AdminPassword] gửi mã thất bại: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"detail": "Không gửi được email chứa mã. Hãy thử lại sau ít phút.", "code": "MAIL_FAILED"})
		return false
	}
	return true
}

// Request: POST /api/admin/password/request — bước 1 đổi mật khẩu: kiểm mật khẩu hiện tại rồi gửi mã tới email.
func (h *AdminPasswordHandler) Request(c *gin.Context) {
	s := requestSession(c)
	if s.Role != "ADMIN" {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Chỉ ban tổ chức đổi được mật khẩu ở đây."})
		return
	}
	if h.lockedReply(c) {
		return
	}
	var req struct {
		Current string `json:"current_password"`
	}
	if c.ShouldBindJSON(&req) != nil || req.Current == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Hãy nhập mật khẩu hiện tại."})
		return
	}
	w, err := h.who(s)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Không tìm thấy tài khoản giám khảo."})
		return
	}
	if !h.verifyCurrent(w, req.Current) {
		h.Result(c.ClientIP(), false)
		// 403 (không phải 401): 401 làm giao diện hiểu là phiên hết hạn và đăng xuất người dùng
		c.JSON(http.StatusForbidden, gin.H{"detail": "Mật khẩu hiện tại không đúng.", "code": "BAD_CURRENT"})
		return
	}
	if w.Email == "" {
		detail := "Tài khoản chủ chưa có email nhận mã (đặt ADMIN_EMAIL hoặc cấu hình SMTP trên máy chủ)."
		if !w.Owner {
			detail = "Tài khoản giám khảo của bạn chưa có email nhận mã. Hãy nhờ tài khoản chủ đặt email cho bạn ở Admin → Giám khảo."
		}
		c.JSON(http.StatusConflict, gin.H{"detail": detail, "code": "NO_EMAIL"})
		return
	}
	if !h.mailReady(c) {
		return
	}
	if !h.issueAndSend(c, w, purposeChange, "Mã xác thực đổi mật khẩu BOT K69 ARENA", []string{
		"Xin chào " + w.Username + ",", "",
		"Có yêu cầu đổi mật khẩu ban tổ chức từ IP " + c.ClientIP() + " lúc " + vnTime(time.Now()) + " (giờ Việt Nam).",
		"Mã xác thực của bạn là:",
	}) {
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "sent_to": repository.MaskEmail(w.Email), "expires_in": int(otpTTL.Seconds()), "resend_after": int(otpMinGap.Seconds())})
}

// Change: POST /api/admin/password/change — bước 2: mật khẩu hiện tại + mã email + mật khẩu mới.
func (h *AdminPasswordHandler) Change(c *gin.Context) {
	s := requestSession(c)
	if s.Role != "ADMIN" {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Chỉ ban tổ chức đổi được mật khẩu ở đây."})
		return
	}
	if h.lockedReply(c) {
		return
	}
	var req struct {
		Current string `json:"current_password"`
		Code    string `json:"code"`
		New     string `json:"new_password"`
	}
	if c.ShouldBindJSON(&req) != nil || req.Current == "" || strings.TrimSpace(req.Code) == "" || req.New == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Cần nhập mật khẩu hiện tại, mã email và mật khẩu mới."})
		return
	}
	w, err := h.who(s)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Không tìm thấy tài khoản giám khảo."})
		return
	}
	if !h.verifyCurrent(w, req.Current) {
		h.Result(c.ClientIP(), false)
		// 403 (không phải 401): 401 làm giao diện hiểu là phiên hết hạn và đăng xuất người dùng
		c.JSON(http.StatusForbidden, gin.H{"detail": "Mật khẩu hiện tại không đúng.", "code": "BAD_CURRENT"})
		return
	}
	// Kiểm chính sách TRƯỚC khi dùng mã để mật khẩu yếu không làm mất mã.
	if err := repository.ValidateAdminPassword(req.New, req.Current, w.Username); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error(), "code": "WEAK_PASSWORD"})
		return
	}
	if remaining, err := h.OTP.Verify(w.Identity, purposeChange, strings.TrimSpace(req.Code)); err != nil {
		h.otpFailure(c, remaining, err)
		return
	}
	if w.Owner {
		err = h.Owner.Set(req.New, s.Actor())
	} else {
		err = h.Judges.SetOwnPassword(w.Username, req.New)
	}
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Chưa lưu được mật khẩu mới, hãy thử lại."})
		return
	}
	h.Result(c.ClientIP(), true)
	// Phiên mới phải được cấp SAU thời điểm đổi để không bị chính lần đổi này thu hồi.
	time.Sleep(3 * time.Millisecond)
	token, err := h.Sessions.Create(auth.Session{Role: "ADMIN", Judge: s.Judge, DisplayName: s.DisplayName})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "Đã đổi mật khẩu nhưng chưa tạo được phiên mới, hãy đăng nhập lại."})
		return
	}
	h.finish("ADMIN_PASSWORD_CHANGED", s.Actor(), w, c)
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "message": "Đã đổi mật khẩu. Mọi thiết bị khác đã bị đăng xuất.", "session_token": token})
}

// finish ghi nhật ký và gửi email cảnh báo (không chặn phản hồi).
func (h *AdminPasswordHandler) finish(action, actor string, w adminWho, c *gin.Context) {
	ip, agent := c.ClientIP(), c.Request.UserAgent()
	if h.Audit != nil {
		h.Audit(actor, action, map[string]interface{}{"identity": w.Identity, "ip": ip})
	}
	if w.Email == "" || h.Mailer == nil || !h.Mailer.Configured() {
		return
	}
	title := "Mật khẩu ban tổ chức BOT K69 ARENA vừa được đổi"
	body := strings.Join([]string{
		"Xin chào " + w.Username + ",", "",
		"Mật khẩu tài khoản ban tổ chức vừa được " + map[bool]string{true: "đặt lại", false: "đổi"}[action == "ADMIN_PASSWORD_RESET"] + " lúc " + vnTime(time.Now()) + " (giờ Việt Nam).",
		"IP: " + ip, "Trình duyệt: " + truncate(agent, 120), "",
		"Mọi thiết bị đang đăng nhập đã bị đăng xuất.",
		"Nếu KHÔNG phải bạn: dùng ngay \"Quên mật khẩu ban tổ chức\" ở màn hình đăng nhập, hoặc báo người quản trị máy chủ.", "",
		"BOT K69 ARENA",
	}, "\n")
	go func() {
		if err := h.Mailer.Send(w.Email, title, body); err != nil {
			log.Printf("[AdminPassword] gửi email cảnh báo thất bại: %v", err)
		}
	}()
}

// Forgot: POST /api/admin/password/forgot — chủ quên mật khẩu: gửi mã tới email ban tổ chức (có chống robot, 3 lần/giờ).
func (h *AdminPasswordHandler) Forgot(c *gin.Context) {
	if h.lockedReply(c) {
		return
	}
	var req struct {
		Challenge string `json:"human_challenge"`
		Solution  string `json:"human_solution"`
	}
	_ = c.ShouldBindJSON(&req)
	if err := h.Human.Check(req.Challenge, req.Solution); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error(), "human_check": true})
		return
	}
	ip := c.ClientIP()
	h.mu.Lock()
	if h.forgotSeen == nil {
		h.forgotSeen = map[string][]time.Time{}
	}
	recent := h.forgotSeen[ip][:0:0]
	for _, at := range h.forgotSeen[ip] {
		if time.Since(at) < time.Hour {
			recent = append(recent, at)
		}
	}
	if len(recent) >= forgotPerHour {
		h.forgotSeen[ip] = recent
		h.mu.Unlock()
		c.Header("Retry-After", "3600")
		c.JSON(http.StatusTooManyRequests, gin.H{"detail": "Đã yêu cầu quá nhiều lần. Thử lại sau 1 giờ."})
		return
	}
	h.forgotSeen[ip] = append(recent, time.Now())
	h.mu.Unlock()
	if !h.mailReady(c) {
		return
	}
	email := strings.TrimSpace(h.AdminEmail())
	if email == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Chưa cấu hình email ban tổ chức (ADMIN_EMAIL) nên không gửi được mã. Dùng lệnh khẩn cấp trên máy chủ.", "code": "NO_EMAIL"})
		return
	}
	w := adminWho{Identity: "owner", Username: "admin", Email: email, Owner: true}
	if !h.issueAndSend(c, w, purposeReset, "Mã đặt lại mật khẩu ban tổ chức BOT K69 ARENA", []string{
		"Có yêu cầu ĐẶT LẠI mật khẩu ban tổ chức từ IP " + ip + " lúc " + vnTime(time.Now()) + " (giờ Việt Nam).",
		"Mã xác thực của bạn là:",
	}) {
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "message": "Mã đặt lại đã được gửi tới email ban tổ chức (hiệu lực 10 phút). Hãy kiểm tra cả thư mục Spam.", "expires_in": int(otpTTL.Seconds())})
}

// Reset: POST /api/admin/password/reset — nhập mã email và mật khẩu mới.
func (h *AdminPasswordHandler) Reset(c *gin.Context) {
	if h.lockedReply(c) {
		return
	}
	var req struct {
		Code string `json:"code"`
		New  string `json:"new_password"`
	}
	if c.ShouldBindJSON(&req) != nil || strings.TrimSpace(req.Code) == "" || req.New == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Cần nhập mã email và mật khẩu mới."})
		return
	}
	if err := repository.ValidateAdminPassword(req.New, "", "admin"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error(), "code": "WEAK_PASSWORD"})
		return
	}
	if remaining, err := h.OTP.Verify("owner", purposeReset, strings.TrimSpace(req.Code)); err != nil {
		h.otpFailure(c, remaining, err)
		return
	}
	if err := h.Owner.Set(req.New, "reset-by-email"); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Chưa lưu được mật khẩu mới, hãy thử lại."})
		return
	}
	h.Result(c.ClientIP(), true)
	h.finish("ADMIN_PASSWORD_RESET", "owner", adminWho{Identity: "owner", Username: "admin", Email: strings.TrimSpace(h.AdminEmail()), Owner: true}, c)
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "message": "Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới."})
}

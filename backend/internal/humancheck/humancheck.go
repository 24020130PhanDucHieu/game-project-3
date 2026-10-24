// Package humancheck là ô "Tôi không phải robot" tự host, không cần dịch vụ ngoài.
// Server phát một thử thách có chữ ký HMAC và hạn dùng ngắn; trình duyệt phải tìm số
// sao cho SHA-256(thử thách + ":" + số) có đủ số bit 0 ở đầu (proof-of-work). Người dùng
// thật mất dưới một giây; bot đăng nhập/đăng ký hàng loạt phải trả giá tính toán cho mỗi lần.
// Mỗi lời giải chỉ dùng được một lần.
package humancheck

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math/bits"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	ErrMissing = errors.New("Hãy tích ô “Tôi không phải robot” trước khi tiếp tục.")
	ErrInvalid = errors.New("Xác minh “Tôi không phải robot” không hợp lệ hoặc đã hết hạn. Hãy tích lại ô xác minh.")
)

type Guard struct {
	secret     []byte
	difficulty int
	ttl        time.Duration
	required   bool
	now        func() time.Time

	mu   sync.Mutex
	used map[string]time.Time
}

// FromEnv: HUMAN_CHECK=1 bắt buộc xác minh; HUMAN_CHECK_BITS chỉnh độ khó (mặc định 16 bit ≈ 65 nghìn phép băm).
func FromEnv() *Guard {
	secret := os.Getenv("SESSION_SECRET")
	if secret == "" {
		secret = os.Getenv("ADMIN_PASSWORD")
	}
	key := []byte("arena-human-v1:" + secret)
	if secret == "" {
		key = make([]byte, 32)
		_, _ = rand.Read(key)
	}
	difficulty := 16
	if v, err := strconv.Atoi(os.Getenv("HUMAN_CHECK_BITS")); err == nil && v >= 8 && v <= 24 {
		difficulty = v
	}
	on := strings.TrimSpace(os.Getenv("HUMAN_CHECK"))
	return New(key, difficulty, on == "1" || strings.EqualFold(on, "true"))
}

func New(secret []byte, difficulty int, required bool) *Guard {
	return &Guard{secret: secret, difficulty: difficulty, ttl: 3 * time.Minute, required: required, now: time.Now, used: map[string]time.Time{}}
}

func (g *Guard) Required() bool  { return g != nil && g.required }
func (g *Guard) Difficulty() int { return g.difficulty }

func (g *Guard) sign(payload string) string {
	mac := hmac.New(sha256.New, g.secret)
	mac.Write([]byte(payload))
	return hex.EncodeToString(mac.Sum(nil))[:32]
}

// Issue tạo thử thách dạng v1.<nonce>.<hết hạn>.<độ khó>.<chữ ký>.
func (g *Guard) Issue() string {
	nonce := make([]byte, 12)
	_, _ = rand.Read(nonce)
	payload := fmt.Sprintf("v1.%x.%d.%d", nonce, g.now().Add(g.ttl).Unix(), g.difficulty)
	return payload + "." + g.sign(payload)
}

func leadingZeroBits(sum [32]byte) int {
	n := 0
	for _, b := range sum {
		if b == 0 {
			n += 8
			continue
		}
		return n + bits.LeadingZeros8(b)
	}
	return n
}

// Check bỏ qua khi không bắt buộc; nếu bắt buộc thì kiểm tra lời giải.
func (g *Guard) Check(challenge, solution string) error {
	if !g.Required() {
		return nil
	}
	return g.Verify(challenge, solution)
}

func (g *Guard) Verify(challenge, solution string) error {
	challenge, solution = strings.TrimSpace(challenge), strings.TrimSpace(solution)
	if challenge == "" || solution == "" {
		return ErrMissing
	}
	parts := strings.Split(challenge, ".")
	if len(parts) != 5 || parts[0] != "v1" || len(solution) > 20 {
		return ErrInvalid
	}
	payload := strings.Join(parts[:4], ".")
	if !hmac.Equal([]byte(parts[4]), []byte(g.sign(payload))) {
		return ErrInvalid
	}
	expires, err1 := strconv.ParseInt(parts[2], 10, 64)
	need, err2 := strconv.Atoi(parts[3])
	if err1 != nil || err2 != nil || g.now().Unix() > expires || need < g.difficulty {
		return ErrInvalid
	}
	if leadingZeroBits(sha256.Sum256([]byte(challenge+":"+solution))) < need {
		return ErrInvalid
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	now := g.now()
	for k, exp := range g.used {
		if now.After(exp) {
			delete(g.used, k)
		}
	}
	if _, seen := g.used[parts[1]]; seen {
		return ErrInvalid
	}
	g.used[parts[1]] = time.Unix(expires, 0)
	return nil
}

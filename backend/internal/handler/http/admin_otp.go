package http

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"sync"
	"time"
)

// Mã xác thực một lần (6 chữ số) gửi qua email khi đổi/đặt lại mật khẩu quản trị.
// Mã không bao giờ được lưu thô: chỉ lưu HMAC gắn với danh tính + mục đích, nên mã của người này
// hay mã dành cho mục đích "đổi" không dùng được cho người khác hay cho "đặt lại".
const (
	otpTTL         = 10 * time.Minute
	otpMaxAttempts = 5
	otpMinGap      = 60 * time.Second
	otpMaxPerHour  = 5
)

type otpStore interface {
	Get(key string, target interface{}) error
	Batch(values map[string]interface{}) error
}

type otpRecord struct {
	Hash      string `json:"hash"`
	ExpiresAt int64  `json:"expires_at"`
	Attempts  int    `json:"attempts"`
}

type otpMeta struct {
	Sent []int64 `json:"sent"`
}

var (
	ErrOTPInvalid = errors.New("Mã xác thực không đúng.")
	ErrOTPExpired = errors.New("Mã xác thực đã hết hạn hoặc chưa được gửi. Hãy yêu cầu mã mới.")
	ErrOTPLocked  = errors.New("Nhập sai mã quá nhiều lần. Mã đã bị hủy, hãy yêu cầu mã mới.")
	ErrOTPTooMany = errors.New("Đã yêu cầu mã quá nhiều lần. Thử lại sau 1 giờ.")
)

// OTPTooSoon: yêu cầu mã mới quá sớm; Wait là số giây phải chờ.
type OTPTooSoon struct{ Wait int }

func (e OTPTooSoon) Error() string {
	return fmt.Sprintf("Vừa gửi mã xong, vui lòng chờ %d giây rồi gửi lại.", e.Wait)
}

type OTPService struct {
	Store otpStore
	Key   []byte
	Now   func() time.Time
	mu    sync.Mutex
}

func (o *OTPService) now() time.Time {
	if o.Now != nil {
		return o.Now()
	}
	return time.Now()
}

func otpKey(purpose, identity string) string { return "adminotp:" + purpose + ":" + identity }
func otpMetaKey(identity string) string      { return "adminotpmeta:" + identity }

func (o *OTPService) hash(purpose, identity, code string) string {
	mac := hmac.New(sha256.New, o.Key)
	mac.Write([]byte(purpose + "|" + identity + "|" + code))
	return hex.EncodeToString(mac.Sum(nil))
}

func (o *OTPService) loadMeta(identity string) otpMeta {
	var m otpMeta
	if err := o.Store.Get(otpMetaKey(identity), &m); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return otpMeta{}
	}
	return m
}

// Issue tạo mã mới (thay mã cũ cùng mục đích). Giới hạn: cách nhau 60 giây, tối đa 5 mã mỗi giờ cho mỗi danh tính.
func (o *OTPService) Issue(identity, purpose string) (string, error) {
	o.mu.Lock()
	defer o.mu.Unlock()
	now := o.now()
	meta := o.loadMeta(identity)
	recent := meta.Sent[:0:0]
	for _, at := range meta.Sent {
		if now.Unix()-at < 3600 {
			recent = append(recent, at)
		}
	}
	if n := len(recent); n > 0 {
		if gap := now.Unix() - recent[n-1]; gap < int64(otpMinGap.Seconds()) {
			return "", OTPTooSoon{Wait: int(otpMinGap.Seconds()) - int(gap)}
		}
	}
	if len(recent) >= otpMaxPerHour {
		return "", ErrOTPTooMany
	}
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	code := fmt.Sprintf("%06d", n.Int64())
	rec := otpRecord{Hash: o.hash(purpose, identity, code), ExpiresAt: now.Add(otpTTL).Unix()}
	meta.Sent = append(recent, now.Unix())
	if err := o.Store.Batch(map[string]interface{}{otpKey(purpose, identity): rec, otpMetaKey(identity): meta}); err != nil {
		return "", err
	}
	return code, nil
}

// Cancel hủy mã vừa phát (gửi email thất bại) và không tính vào hạn mức yêu cầu.
func (o *OTPService) Cancel(identity, purpose string) {
	o.mu.Lock()
	defer o.mu.Unlock()
	meta := o.loadMeta(identity)
	if n := len(meta.Sent); n > 0 {
		meta.Sent = meta.Sent[:n-1]
	}
	_ = o.Store.Batch(map[string]interface{}{otpKey(purpose, identity): otpRecord{}, otpMetaKey(identity): meta})
}

// Verify kiểm mã: dùng một lần, hết hạn sau 10 phút, sai quá 5 lần thì hủy. remaining là số lần thử còn lại khi sai.
func (o *OTPService) Verify(identity, purpose, code string) (remaining int, err error) {
	o.mu.Lock()
	defer o.mu.Unlock()
	var rec otpRecord
	if e := o.Store.Get(otpKey(purpose, identity), &rec); e != nil || rec.Hash == "" || o.now().Unix() > rec.ExpiresAt {
		return 0, ErrOTPExpired
	}
	if hmac.Equal([]byte(rec.Hash), []byte(o.hash(purpose, identity, code))) {
		_ = o.Store.Batch(map[string]interface{}{otpKey(purpose, identity): otpRecord{}}) // dùng một lần
		return 0, nil
	}
	rec.Attempts++
	if rec.Attempts >= otpMaxAttempts {
		_ = o.Store.Batch(map[string]interface{}{otpKey(purpose, identity): otpRecord{}})
		return 0, ErrOTPLocked
	}
	_ = o.Store.Batch(map[string]interface{}{otpKey(purpose, identity): rec})
	return otpMaxAttempts - rec.Attempts, ErrOTPInvalid
}

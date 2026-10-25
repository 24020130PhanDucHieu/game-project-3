package middleware

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// ClientIP trả IP thật của người dùng. Gateway đứng sau Caddy trên cùng máy, nên mọi kết nối
// đều đến từ 127.0.0.1; khi đó (và chỉ khi đó) dùng địa chỉ Caddy ghi vào cuối X-Forwarded-For.
// Kết nối từ ngoài vào thẳng không được tin header này để tránh giả IP.
func ClientIP(c *gin.Context) string {
	remote := c.RemoteIP()
	if ip := net.ParseIP(remote); ip != nil && ip.IsLoopback() {
		if forwarded := c.GetHeader("X-Forwarded-For"); forwarded != "" {
			parts := strings.Split(forwarded, ",")
			if last := strings.TrimSpace(parts[len(parts)-1]); net.ParseIP(last) != nil {
				return last
			}
		}
	}
	return remote
}

// IsLocalRequest: request do chính máy gateway gửi (watchdog, script vận hành), không đi qua Caddy.
func IsLocalRequest(c *gin.Context) bool {
	ip := net.ParseIP(c.RemoteIP())
	return ip != nil && ip.IsLoopback() && c.GetHeader("X-Forwarded-For") == ""
}

// allow tăng bộ đếm của khóa trong cửa sổ 1 phút; trả false khi vượt giới hạn.
func allow(key string, limit int, now time.Time) (ok bool, full bool) {
	rateState.Lock()
	defer rateState.Unlock()
	entry, known := rateState.clients[key]
	if !known && len(rateState.clients) >= 50000 {
		for client, old := range rateState.clients {
			if now.Sub(old.window) > 2*time.Minute {
				delete(rateState.clients, client)
			}
		}
		if len(rateState.clients) >= 50000 {
			return false, true
		}
	}
	if now.Sub(entry.window) >= time.Minute {
		entry = rateEntry{window: now}
	}
	entry.count++
	rateState.clients[key] = entry
	return entry.count <= limit, false
}

type rateEntry struct {
	window time.Time
	count  int
}

var rateState = struct {
	sync.Mutex
	clients map[string]rateEntry
}{clients: make(map[string]rateEntry)}

func isHeavyPath(path string) bool {
	for _, suffix := range []string{"/bots/validate", "/bots/practice", "/practice-match", "/scrimmages", "/attempt", "/submissions", "/submit", "/code", "/ai/ask"} {
		if strings.HasSuffix(path, suffix) {
			return true
		}
	}
	return false
}

func RateLimitMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.Next()
			return
		}
		ip := ClientIP(c)
		key := ip
		// Middleware chạy trước khi phiên được đọc: phân biệt người dùng theo token để mỗi đội có hạn mức riêng
		// (nhiều đội có thể chung một IP trường). Token giả không lách được vì còn trần tổng theo IP bên dưới.
		if bearer := c.GetHeader("Authorization"); bearer != "" {
			sum := sha256.Sum256([]byte(bearer))
			key += ":" + hex.EncodeToString(sum[:8])
		}
		limit, ipLimit := 600, 3000
		bucket := "read"
		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
			limit, ipLimit = 120, 600
			bucket = "write"
		}
		if strings.HasSuffix(c.Request.URL.Path, "/login") || strings.HasSuffix(c.Request.URL.Path, "/auth") || strings.HasSuffix(c.Request.URL.Path, "/reset-password") || strings.HasSuffix(c.Request.URL.Path, "/forgot-password") {
			limit = 10
			bucket = "auth"
			if c.Request.Body != nil {
				body, _ := io.ReadAll(io.LimitReader(c.Request.Body, 4096))
				c.Request.Body = io.NopCloser(bytes.NewReader(body))
				var login struct {
					Username  string `json:"username"`
					StudentID string `json:"student_id"`
				}
				if json.Unmarshal(body, &login) == nil {
					username := login.Username
					if username == "" {
						username = login.StudentID
					}
					key += ":" + strings.ToLower(strings.TrimSpace(username))
				}
			}
		}
		// Thao tác chạy bot trên máy chấm (kiểm tra mã, đấu thử, giao hữu, thử thách, nộp bài): hạn mức riêng, chặt hơn.
		if c.Request.Method == http.MethodPost && isHeavyPath(c.Request.URL.Path) {
			limit, ipLimit = 12, 300
			bucket = "heavy"
		}
		if strings.HasSuffix(c.Request.URL.Path, "/draft-code") {
			limit, ipLimit = 240, 1200
			bucket = "draft"
		}
		now := time.Now()
		allowed, full := allow(key+":"+bucket, limit, now)
		if allowed && bucket != "auth" {
			allowed, full = allow("ip:"+ip+":"+bucket, ipLimit, now)
		}
		if full {
			c.Header("Retry-After", "60")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"detail": "Hệ thống đang bận. Vui lòng thử lại sau 60 giây."})
			return
		}
		if !allowed {
			c.Header("Retry-After", "60")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"detail": "Bạn thao tác quá nhanh. Vui lòng thử lại sau 60 giây."})
			return
		}
		c.Next()
	}
}

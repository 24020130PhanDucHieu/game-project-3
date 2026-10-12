package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/auth"
)

type rateEntry struct {
	window time.Time
	count  int
}

var rateState = struct {
	sync.Mutex
	clients map[string]rateEntry
}{clients: make(map[string]rateEntry)}

func RateLimitMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.Next()
			return
		}
		// Honor only the socket peer until trusted proxies are explicitly configured.
		key := c.RemoteIP()
		if value, exists := c.Get("session"); exists {
			if session, ok := value.(auth.Session); ok {
				key += ":" + session.Role + ":" + session.StudentID
			}
		}
		limit := 600
		bucket := "read"
		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
			limit = 120
			bucket = "write"
		}
		if strings.HasSuffix(c.Request.URL.Path, "/login") || strings.HasSuffix(c.Request.URL.Path, "/auth") {
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
		if strings.HasSuffix(c.Request.URL.Path, "/draft-code") {
			limit = 240
			bucket = "draft"
		}
		key += ":" + bucket
		now := time.Now()
		rateState.Lock()
		entry, known := rateState.clients[key]
		if !known && len(rateState.clients) >= 10000 {
			for client, old := range rateState.clients {
				if now.Sub(old.window) > 2*time.Minute {
					delete(rateState.clients, client)
				}
			}
			if len(rateState.clients) >= 10000 {
				rateState.Unlock()
				c.Header("Retry-After", "60")
				c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"detail": "Rate limit capacity reached. Retry in 60 seconds."})
				return
			}
		}
		entry = rateState.clients[key]
		if now.Sub(entry.window) >= time.Minute {
			entry = rateEntry{window: now}
		}
		entry.count++
		rateState.clients[key] = entry
		allowed := entry.count <= limit
		rateState.Unlock()
		if !allowed {
			c.Header("Retry-After", "60")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"detail": "Rate limit exceeded. Retry in 60 seconds."})
			return
		}
		c.Next()
	}
}

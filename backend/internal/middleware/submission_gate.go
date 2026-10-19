package middleware

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/auth"
	"project-tuan3/internal/repository"
)

type submissionReceipt struct {
	Digest string          `json:"digest"`
	Status int             `json:"status"`
	Body   json.RawMessage `json:"body"`
}
type receiptWriter struct {
	gin.ResponseWriter
	body bytes.Buffer
}

func (w *receiptWriter) Write(b []byte) (int, error) {
	w.body.Write(b)
	return w.ResponseWriter.Write(b)
}
func (w *receiptWriter) WriteString(s string) (int, error) { return w.Write([]byte(s)) }

// Bound expensive synchronous checks; clients retain their durable outbox on 429.
// Receipts survive restarts. Auth/deadline enforcement remains in the handlers.
func SubmissionGate(store *repository.QualifierRecords, concurrency int) gin.HandlerFunc {
	if concurrency < 1 {
		concurrency = 1
	}
	slots := make(chan struct{}, concurrency)
	var locks [256]sync.Mutex
	return func(c *gin.Context) {
		if c.Request.Method != http.MethodPost {
			c.Next()
			return
		}
		path := c.Request.URL.Path
		submission := strings.HasSuffix(path, "/submissions") || (strings.Contains(path, "/matches/") && strings.HasSuffix(path, "/code"))
		heavy := submission || path == "/api/bots/validate" || path == "/api/bots/practice" || strings.HasSuffix(path, "/practice-match")
		if !heavy {
			c.Next()
			return
		}
		select {
		case slots <- struct{}{}:
			defer func() { <-slots }()
		default:
			c.Header("Retry-After", "20")
			c.AbortWithStatusJSON(429, gin.H{"detail": "Máy chấm đang bận. Bài trên thiết bị sẽ tự gửi lại."})
			return
		}
		id := c.GetHeader("X-Submission-Id")
		sessionValue, ok := c.Get("session")
		session, valid := sessionValue.(auth.Session)
		if !submission || id == "" || !ok || !valid || session.Role != "TEAM" {
			c.Next()
			return
		}
		if len(id) > 80 {
			c.AbortWithStatusJSON(400, gin.H{"detail": "Invalid submission ID"})
			return
		}
		raw, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, 100000))
		if err != nil {
			c.AbortWithStatusJSON(413, gin.H{"detail": "Mã nguồn tối đa 64 KB."})
			return
		}
		c.Request.Body = io.NopCloser(bytes.NewReader(raw))
		hash := sha256.Sum256([]byte(session.StudentID + ":" + id))
		key := "receipt:" + hex.EncodeToString(hash[:])
		digest := sha256.Sum256(append([]byte(path+":"), raw...))
		digestText := hex.EncodeToString(digest[:])
		locks[hash[0]].Lock()
		defer locks[hash[0]].Unlock()
		var prior submissionReceipt
		if err = store.Get(key, &prior); err == nil {
			if prior.Digest != digestText {
				c.AbortWithStatusJSON(409, gin.H{"detail": "Submission ID belongs to another payload"})
				return
			}
			c.Data(prior.Status, "application/json", prior.Body)
			c.Abort()
			return
		}
		if !errors.Is(err, sql.ErrNoRows) {
			c.AbortWithStatusJSON(503, gin.H{"detail": "Chưa đọc được biên nhận. Bài sẽ tự gửi lại."})
			return
		}
		writer := &receiptWriter{ResponseWriter: c.Writer}
		c.Writer = writer
		c.Next()
		if writer.Status() >= 200 && writer.Status() < 300 {
			// Preserve the validation receipt, not the full mutable tournament snapshot.
			var result map[string]json.RawMessage
			if json.Unmarshal(writer.body.Bytes(), &result) == nil {
				small := map[string]json.RawMessage{}
				for _, name := range []string{"id", "valid", "error", "is_valid", "validation", "status", "at", "language"} {
					if v, ok := result[name]; ok {
						small[name] = v
					}
				}
				body, _ := json.Marshal(small)
				_ = store.Batch(map[string]interface{}{key: submissionReceipt{digestText, writer.Status(), body}})
			}
		}
	}
}

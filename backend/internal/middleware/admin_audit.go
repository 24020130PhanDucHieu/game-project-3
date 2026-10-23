package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"time"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/auth"
	"project-tuan3/internal/repository"
)

// Never record body, query string, cookies or authorization headers.
func AdminAudit(store *repository.QualifierRecords) gin.HandlerFunc {
	return func(c *gin.Context) {
		session, _ := c.Get("session")
		actor, _ := session.(auth.Session)
		if actor.Role != "ADMIN" || c.Request.Method == "GET" || c.Request.Method == "OPTIONS" || c.Request.Method == "HEAD" {
			c.Next()
			return
		}
		var id [16]byte
		if _, err := rand.Read(id[:]); err != nil {
			c.AbortWithStatus(503)
			return
		}
		key := "audit:" + time.Now().UTC().Format("20060102T150405.000000000") + ":" + hex.EncodeToString(id[:])
		record := map[string]interface{}{"at": time.Now().UTC(), "method": c.Request.Method, "path": c.Request.URL.Path, "actor": actor.Actor(), "status": "STARTED"}
		// Fail closed before a mutation if the audit trail cannot be written.
		if err := store.Batch(map[string]interface{}{key: record}); err != nil {
			c.AbortWithStatusJSON(503, gin.H{"detail": "Chưa ghi được nhật ký quản trị. Hãy thử lại."})
			return
		}
		c.Next()
		record["status"], record["http_status"] = "FINISHED", c.Writer.Status()
		if err := store.Batch(map[string]interface{}{key: record}); err != nil {
			log.Printf("[Audit] Could not finalize action %s; STARTED record retained", key)
		}
	}
}

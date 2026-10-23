package middleware

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"strings"
)

func RequestBounds() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Referrer-Policy", "same-origin")
		c.Header("Access-Control-Expose-Headers", "Date, Retry-After")
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.Header("Cache-Control", "no-store")
			if c.Request.ContentLength > 262144 {
				c.AbortWithStatusJSON(413, gin.H{"detail": "Dữ liệu gửi lên quá lớn. Mã nguồn tối đa 64 KB."})
				return
			}
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 262144)
		}
		c.Next()
	}
}

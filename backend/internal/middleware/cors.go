package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func CORSMiddleware(allowedOrigin string) gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		if origin != "" {
			allowed := false
			for _, candidate := range strings.Split(allowedOrigin, ",") {
				candidate = strings.TrimSpace(candidate)
				if candidate == "*" || candidate == origin {
					allowed = true
					break
				}
			}
			if !allowed {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"detail": "Origin is not allowed"})
				return
			}
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Vary", "Origin")
			c.Header("Access-Control-Allow-Credentials", "true")
		}
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, Authorization, X-Requested-With, CF-Connecting-IP, CF-Ray")
		c.Header("Access-Control-Expose-Headers", "Content-Length, X-Request-Id")
		c.Header("Access-Control-Max-Age", "43200")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

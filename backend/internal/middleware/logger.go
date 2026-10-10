package middleware

import (
	"log"
	"time"

	"github.com/gin-gonic/gin"
)

func LoggerMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		raw := c.Request.URL.RawQuery

		c.Next()

		latency := time.Since(start)
		clientIP := c.ClientIP()
		cfRay := c.GetHeader("CF-Ray")
		method := c.Request.Method
		statusCode := c.Writer.Status()

		if raw != "" {
			path = path + "?" + raw
		}

		if cfRay != "" {
			log.Printf("[HTTP] %3d | %12v | %s | %-7s %s | CF-Ray: %s\n",
				statusCode, latency, clientIP, method, path, cfRay)
		} else {
			log.Printf("[HTTP] %3d | %12v | %s | %-7s %s\n",
				statusCode, latency, clientIP, method, path)
		}
	}
}

func RecoveryMiddleware() gin.HandlerFunc {
	return gin.Recovery()
}

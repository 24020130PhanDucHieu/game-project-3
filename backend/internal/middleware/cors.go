package middleware

import (
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func CORSMiddleware(allowedOrigin string) gin.HandlerFunc {
	config := cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With", "CF-Connecting-IP", "CF-Ray"},
		ExposeHeaders:    []string{"Content-Length", "X-Request-Id"},
		AllowCredentials: false,
		MaxAge:           12 * time.Hour,
	}

	if allowedOrigin != "" && allowedOrigin != "*" {
		config.AllowOrigins = []string{allowedOrigin}
		config.AllowCredentials = true
	}

	return cors.New(config)
}

package http

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

// RegisterFrontendRoutes serves the verified Next.js static export when present.
func RegisterFrontendRoutes(router *gin.Engine) bool {
	for _, candidate := range []string{"frontend/dist", "../frontend/dist", "../../frontend/dist"} {
		if info, err := os.Stat(filepath.Join(candidate, "index.html")); err == nil && !info.IsDir() {
			registerStaticPortal(router, candidate)
			return true
		}
	}
	return false
}

func registerStaticPortal(router *gin.Engine, root string) {
	entries, err := os.ReadDir(root)
	if err != nil {
		log.Printf("Could not read Next export: %v", err)
		return
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		file := entry.Name()
		router.GET("/"+file, func(c *gin.Context) {
			c.Header("Cache-Control", "no-cache")
			c.File(filepath.Join(root, file))
		})
	}
	router.GET("/", func(c *gin.Context) {
		c.Header("Cache-Control", "no-cache")
		c.File(filepath.Join(root, "index.html"))
	})
	if info, err := os.Stat(filepath.Join(root, "_next")); err == nil && info.IsDir() {
		// File trong _next/static có mã băm trong tên: cho trình duyệt và CDN giữ 1 năm, đỡ tải cho máy chủ.
		next := http.StripPrefix("/_next", http.FileServer(http.FS(os.DirFS(filepath.Join(root, "_next")))))
		router.GET("/_next/*path", func(c *gin.Context) {
			if strings.HasPrefix(c.Param("path"), "/static/") {
				c.Header("Cache-Control", "public, max-age=31536000, immutable")
			}
			next.ServeHTTP(c.Writer, c.Request)
		})
	}
	// Máy chấm offline (worker + engine Python): luôn kiểm tra bản mới để engine khớp với server.
	if info, err := os.Stat(filepath.Join(root, "offline")); err == nil && info.IsDir() {
		offline := http.FileServer(http.FS(os.DirFS(filepath.Join(root, "offline"))))
		router.GET("/offline/*path", func(c *gin.Context) {
			c.Header("Cache-Control", "no-cache")
			http.StripPrefix("/offline", offline).ServeHTTP(c.Writer, c.Request)
		})
	}
}

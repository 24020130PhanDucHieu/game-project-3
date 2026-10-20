package observability

import (
	"net/http"
	"runtime"
	"time"

	"github.com/gin-gonic/gin"
)

var startTime = time.Now()

type SystemHealth struct {
	Status    string    `json:"status"`
	Uptime    string    `json:"uptime"`
	Timestamp time.Time `json:"timestamp"`
	Platform  string    `json:"platform"`
	NumCPU    int       `json:"num_cpu"`
	Goroutine int       `json:"goroutines"`
	MemoryMB  float64   `json:"memory_alloc_mb"`
}

func HealthHandler(c *gin.Context) {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	health := SystemHealth{
		Status:    "HEALTHY",
		Uptime:    time.Since(startTime).String(),
		Timestamp: time.Now(),
		Platform:  runtime.GOOS,
		NumCPU:    runtime.NumCPU(),
		Goroutine: runtime.NumGoroutine(),
		MemoryMB:  float64(m.Alloc) / 1024 / 1024,
	}

	c.JSON(http.StatusOK, health)
}

func MetricsHandler(c *gin.Context) {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	metrics := gin.H{
		"uptime_seconds":     time.Since(startTime).Seconds(),
		"goroutines":         runtime.NumGoroutine(),
		"memory_alloc_bytes": m.Alloc,
		"memory_sys_bytes":   m.Sys,
		"gc_cycles":          m.NumGC,
	}

	c.JSON(http.StatusOK, metrics)
}

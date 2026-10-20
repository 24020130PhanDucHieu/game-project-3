package observability

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type ReadinessCheck func(context.Context) error

// Cache briefly to keep public probes from exhausting database/worker pools.
// Liveness stays at /health; /ready reports dependencies and returns 503.
func ReadinessHandler(checks map[string]ReadinessCheck) gin.HandlerFunc {
	var mu sync.Mutex
	var expires time.Time
	var body gin.H
	code := 503
	return func(c *gin.Context) {
		mu.Lock()
		defer mu.Unlock()
		if time.Now().After(expires) {
			ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
			defer cancel()
			results := make(chan struct {
				name string
				err  error
			}, len(checks))
			for name, check := range checks {
				go func(name string, check ReadinessCheck) {
					results <- struct {
						name string
						err  error
					}{name, check(ctx)}
				}(name, check)
			}
			states := map[string]string{}
			code = http.StatusOK
			for range checks {
				select {
				case r := <-results:
					states[r.name] = "ready"
					if r.err != nil {
						states[r.name] = "unavailable"
						code = 503
					}
				case <-ctx.Done():
					code = 503
				}
			}
			status := "READY"
			if code != 200 {
				status = "NOT_READY"
			}
			body = gin.H{"status": status, "checks": states}
			expires = time.Now().Add(5 * time.Second)
		}
		c.Header("Cache-Control", "no-store")
		c.JSON(code, body)
	}
}

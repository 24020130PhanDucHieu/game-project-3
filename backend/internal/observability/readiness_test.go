package observability

import (
	"context"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestReadinessFailsWhenDependencyFails(t *testing.T) {
	for _, failed := range []bool{false, true} {
		gin.SetMode(gin.TestMode)
		r := gin.New()
		r.GET("/ready", ReadinessHandler(map[string]ReadinessCheck{"database": func(context.Context) error {
			if failed {
				return errors.New("password must not appear in response")
			}
			return nil
		}}))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest("GET", "/ready", nil))
		expected := 200
		if failed {
			expected = 503
		}
		if w.Code != expected {
			t.Fatal(w.Code, w.Body.String())
		}
		if strings.Contains(w.Body.String(), "password") {
			t.Fatal("secret leaked")
		}
	}
}

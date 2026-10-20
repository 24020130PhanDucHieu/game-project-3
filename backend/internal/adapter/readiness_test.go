package adapter

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWorkerReadinessRejectsBadPayloadAndSupportsExistingWorkerStatus(t *testing.T) {
	for _, body := range []string{`{"status":"HEALTHY"}`, `{"status":"healthy"}`, `{}`, `not-json`} {
		t.Run(body, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/health" {
					t.Error("incorrect health endpoint", r.URL.Path)
				}
				fmt.Fprint(w, body)
			}))
			defer server.Close()
			err := NewHTTPBotRunnerAdapter(server.URL + "/mutate-tournament").Ready(context.Background())
			expectReady := body == `{"status":"HEALTHY"}` || body == `{"status":"healthy"}`
			if (err == nil) != expectReady {
				t.Fatal("incorrect readiness", err)
			}
		})
	}
}

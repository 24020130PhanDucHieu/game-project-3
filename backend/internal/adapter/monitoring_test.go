package adapter

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestMonitorReportsActualWorkersAndRelease(t *testing.T) {
	t.Setenv("WORKER_RELEASE", "release-test")
	good := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Arena-Release", "release-test")
		w.Write([]byte(`{"status":"HEALTHY"}`))
	}))
	defer good.Close()
	bad := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(`{"status":"HEALTHY"}`)) }))
	defer bad.Close()
	a := NewHTTPBotRunnerAdapter(good.URL + "/mutate-tournament," + bad.URL + "/mutate-tournament")
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	got := a.Monitor(ctx)
	if got["ready"] != 1 || got["total"] != 2 || got["status"] != "DEGRADED" {
		t.Fatalf("unexpected snapshot: %v", got)
	}
	nodes := got["nodes"].([]map[string]interface{})
	if nodes[1]["status"] != "RELEASE_MISMATCH" {
		t.Fatal(nodes)
	}
}

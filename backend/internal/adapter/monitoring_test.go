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

func TestMonitoringCountsFailedAttemptsAndLearnsCapacity(t *testing.T) {
	t.Setenv("WORKER_CONCURRENCY", "2")
	t.Setenv("WORKER_RELEASE", "")
	bad := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) }))
	defer bad.Close()
	good := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Worker-Capacity", "1")
		if r.URL.Path == "/health" {
			w.Write([]byte(`{"status":"HEALTHY"}`))
			return
		}
		w.Write([]byte(`{"winner_side":"team_a"}`))
	}))
	defer good.Close()
	a := NewHTTPBotRunnerAdapter(bad.URL + "," + good.URL)
	if _, err := a.Mutate(nil, "qualifier-game", nil); err != nil {
		t.Fatal(err)
	}
	got := a.Monitor(context.Background())
	nodes := got["nodes"].([]map[string]interface{})
	if nodes[0]["finished"] != uint64(1) || nodes[0]["failed"] != uint64(1) || nodes[0]["success_rate"] != "0.0%" {
		t.Fatal(nodes[0])
	}
	if nodes[1]["capacity"] != 1 || nodes[1]["qualifier_games"] != uint64(1) || nodes[1]["success_rate"] != "100.0%" {
		t.Fatal(nodes[1])
	}
	if len(a.recentLogs) != 2 || a.recentLogs[0].Success {
		t.Fatal("failed attempt not logged")
	}
}

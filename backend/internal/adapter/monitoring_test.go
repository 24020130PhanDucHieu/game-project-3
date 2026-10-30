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
	t.Setenv("WORKER_PUBLIC_HOSTS", "203.0.113.10,203.0.113.11")
	good := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Arena-Release", "release-test")
		w.Write([]byte(`{"status":"HEALTHY","provider":"AWS EC2"}`))
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
	if nodes[0]["provider"] != "AWS EC2" || nodes[0]["with_gateway"] != true || nodes[0]["public_ip"] != "203.0.113.10" || nodes[0]["checked_at"] == nil {
		t.Fatal(nodes[0])
	}
	if _, exists := nodes[1]["provider"]; exists {
		t.Fatal("must not invent provider for old workers")
	}
	if nodes[1]["status"] != "RELEASE_MISMATCH" {
		t.Fatal(nodes)
	}
}

func TestMonitorThreeCloudWorkersWithTunnelAndMixedCapacity(t *testing.T) {
	t.Setenv("WORKER_RELEASE", "")
	t.Setenv("WORKER_CONCURRENCY", "2")
	t.Setenv("JUDGE_CONCURRENCY", "5")
	t.Setenv("WORKER_TRANSPORTS", "local,private,ssh-tunnel")
	t.Setenv("WORKER_PUBLIC_HOSTS", "203.0.113.10,203.0.113.11,203.0.113.12")
	aws := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Worker-Capacity", "2")
		w.Write([]byte(`{"status":"HEALTHY","provider":"AWS EC2"}`))
	}))
	defer aws.Close()
	aws2 := httptest.NewServer(aws.Config.Handler)
	defer aws2.Close()
	oracle := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Worker-Capacity", "1")
		w.Write([]byte(`{"status":"HEALTHY","provider":"Oracle Cloud"}`))
	}))
	defer oracle.Close()
	a := NewHTTPBotRunnerAdapter(aws.URL + "/mutate-tournament," + aws2.URL + "/mutate-tournament," + oracle.URL + "/mutate-tournament")
	got := a.Monitor(context.Background())
	nodes := got["nodes"].([]map[string]interface{})
	if got["ready"] != 3 || got["total"] != 3 || got["capacity"] != 5 {
		t.Fatal(got)
	}
	if nodes[2]["provider"] != "Oracle Cloud" || nodes[2]["with_gateway"] != false || nodes[2]["transport"] != "ssh-tunnel" || nodes[2]["capacity"] != 1 {
		t.Fatal(nodes[2])
	}
	if nodes[0]["capacity"] != 2 || nodes[1]["capacity"] != 2 {
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

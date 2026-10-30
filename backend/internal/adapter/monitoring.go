package adapter

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

// Monitor probes each configured worker concurrently without submitting a bot.
// Only sanitized identifiers are returned, never credentials or request bodies.
func (a *HTTPBotRunnerAdapter) Monitor(ctx context.Context) map[string]interface{} {
	nodes := make([]map[string]interface{}, len(a.workers))
	var wg sync.WaitGroup
	// IP công khai của từng máy chấm (cùng thứ tự WORKER_URLS); gateway vẫn gọi qua địa chỉ nội bộ cho nhanh và an toàn.
	publicHosts := strings.Split(os.Getenv("WORKER_PUBLIC_HOSTS"), ",")
	transports := strings.Split(os.Getenv("WORKER_TRANSPORTS"), ",")
	for i, address := range a.workers {
		wg.Add(1)
		go func(i int, address string) {
			defer wg.Done()
			started := time.Now()
			node := map[string]interface{}{"name": fmt.Sprintf("Máy chấm %d", i+1), "status": "UNREACHABLE"}
			a.poolMu.Lock()
			node["active"], node["capacity"] = a.active[i], a.workerCapacity(i)
			node["configured_capacity"], node["reported_capacity"] = a.perWorker, a.reportedCapacity[i]
			node["dispatched"], node["finished"], node["failed"], node["qualifier_games"] = a.dispatched[i], a.finished[i], a.failed[i], a.qualifierGames[i]
			var avgMs int64 = 0
			finished := a.finished[i]
			if finished > 0 && len(a.totalDurationMs) > i && a.totalDurationMs[i] > 0 {
				avgMs = a.totalDurationMs[i] / int64(finished)
			}
			successRate := 0.0
			totalAttempts := finished
			if totalAttempts > 0 {
				successRate = float64(finished-a.failed[i]) * 100.0 / float64(totalAttempts)
			}
			node["avg_duration_ms"] = avgMs
			node["success_rate"] = nil
			if finished > 0 {
				node["success_rate"] = fmt.Sprintf("%.1f%%", successRate)
			}
			a.poolMu.Unlock()
			u, err := url.Parse(address)
			if err == nil {
				node["host"] = u.Host
				ip := net.ParseIP(u.Hostname())
				node["with_gateway"] = strings.EqualFold(u.Hostname(), "localhost") || (ip != nil && ip.IsLoopback())
				if i < len(transports) && strings.TrimSpace(transports[i]) == "ssh-tunnel" {
					node["transport"] = "ssh-tunnel"
					node["with_gateway"] = false
				}
				if i < len(publicHosts) && strings.TrimSpace(publicHosts[i]) != "" {
					node["public_ip"] = strings.TrimSpace(publicHosts[i])
				}
				u.Path, u.RawQuery, u.Fragment, u.User = "/health", "", "", nil
				req, reqErr := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
				if reqErr == nil {
					if a.token != "" {
						req.Header.Set("X-Worker-Token", a.token)
					}
					res, callErr := a.client.Do(req)
					if callErr == nil {
						var body struct {
							Status   string `json:"status"`
							Provider string `json:"provider"`
						}
						decodeErr := json.NewDecoder(io.LimitReader(res.Body, 8192)).Decode(&body)
						res.Body.Close()
						node["status"] = "UNHEALTHY"
						if decodeErr == nil && res.StatusCode == 200 && strings.EqualFold(body.Status, "HEALTHY") {
							node["status"] = "READY"
							if body.Provider == "AWS EC2" || body.Provider == "Oracle Cloud" {
								node["provider"] = body.Provider
								node["name"] = fmt.Sprintf("%s · Máy chấm %d", body.Provider, i+1)
							}
							a.observeCapacity(i, res.Header.Get("X-Worker-Capacity"))
							a.poolMu.Lock()
							node["capacity"], node["reported_capacity"] = a.workerCapacity(i), a.reportedCapacity[i]
							a.poolMu.Unlock()
						}
						if a.expectedRelease != "" && res.Header.Get("X-Arena-Release") != a.expectedRelease {
							node["status"] = "RELEASE_MISMATCH"
						}
					}
				}
			}
			node["checked_at"] = time.Now().UTC().Format(time.RFC3339)
			node["latency_ms"] = time.Since(started).Milliseconds()
			nodes[i] = node
		}(i, address)
	}
	wg.Wait()
	ready := 0
	for _, node := range nodes {
		if node["status"] == "READY" {
			ready++
		}
	}
	status := "DEGRADED"
	if ready == len(nodes) {
		status = "READY"
	}
	if ready == 0 {
		status = "UNAVAILABLE"
	}

	a.poolMu.Lock()
	logsCopy := make([]WorkerEventLog, len(a.recentLogs))
	copy(logsCopy, a.recentLogs)
	a.poolMu.Unlock()
	for i, j := 0, len(logsCopy)-1; i < j; i, j = i+1, j-1 {
		logsCopy[i], logsCopy[j] = logsCopy[j], logsCopy[i]
	}

	return map[string]interface{}{
		"status":      status,
		"nodes":       nodes,
		"ready":       ready,
		"total":       len(nodes),
		"in_flight":   len(a.slots),
		"capacity":    cap(a.slots),
		"recent_logs": logsCopy,
	}
}

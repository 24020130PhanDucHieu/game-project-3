package adapter

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Monitor probes each configured worker concurrently without submitting a bot.
// Only sanitized identifiers are returned, never credentials or request bodies.
func (a *HTTPBotRunnerAdapter) Monitor(ctx context.Context) map[string]interface{} {
	nodes := make([]map[string]interface{}, len(a.workers))
	var wg sync.WaitGroup
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
			a.poolMu.Unlock()
			u, err := url.Parse(address)
			if err == nil {
				node["host"] = u.Host
				u.Path, u.RawQuery, u.Fragment, u.User = "/health", "", "", nil
				req, reqErr := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
				if reqErr == nil {
					if a.token != "" {
						req.Header.Set("X-Worker-Token", a.token)
					}
					res, callErr := a.client.Do(req)
					if callErr == nil {
						var body struct {
							Status string `json:"status"`
						}
						decodeErr := json.NewDecoder(io.LimitReader(res.Body, 8192)).Decode(&body)
						res.Body.Close()
						node["status"] = "UNHEALTHY"
						if decodeErr == nil && res.StatusCode == 200 && strings.EqualFold(body.Status, "HEALTHY") {
							node["status"] = "READY"
							a.observeCapacity(i,res.Header.Get("X-Worker-Capacity"))
						}
						if a.expectedRelease != "" && res.Header.Get("X-Arena-Release") != a.expectedRelease {
							node["status"] = "RELEASE_MISMATCH"
						}
					}
				}
			}
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
	return map[string]interface{}{"status": status, "nodes": nodes, "ready": ready, "total": len(nodes), "in_flight": len(a.slots), "capacity": cap(a.slots)}
}

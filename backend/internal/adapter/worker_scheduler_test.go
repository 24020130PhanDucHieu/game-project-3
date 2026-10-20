package adapter

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestPoolBoundsEachWorkerUnderBurst(t *testing.T) {
	t.Setenv("WORKER_CONCURRENCY", "1")
	t.Setenv("JUDGE_CONCURRENCY", "8")
	t.Setenv("WORKER_TOKEN", "fixture-secret")
	var exceeded, unauthorized atomic.Bool
	var total atomic.Int32
	urls := []string{}
	for i := 0; i < 4; i++ {
		var active atomic.Int32
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("X-Worker-Token") != "fixture-secret" {
				unauthorized.Store(true)
			}
			if active.Add(1) > 1 {
				exceeded.Store(true)
			}
			defer active.Add(-1)
			time.Sleep(time.Millisecond)
			total.Add(1)
			fmt.Fprint(w, `{"is_valid":true}`)
		}))
		defer server.Close()
		urls = append(urls, server.URL)
	}
	pool := NewHTTPBotRunnerAdapter(strings.Join(urls, ","))
	var wg sync.WaitGroup
	for i := 0; i < 400; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := pool.Mutate(nil, "validate-code", nil); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if exceeded.Load() || unauthorized.Load() || total.Load() != 400 {
		t.Fatal("capacity, authentication or lost result", total.Load())
	}
}

func TestSlowWorkerTimesOutAndFailsOver(t *testing.T) {
	first := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(200 * time.Millisecond):
		}
	}))
	defer first.Close()
	second := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, `{"is_valid":true}`) }))
	defer second.Close()
	pool := NewHTTPBotRunnerAdapter(first.URL + "," + second.URL)
	pool.attemptTimeout = 50 * time.Millisecond
	start := time.Now()
	if _, err := pool.Mutate(nil, "validate-code", nil); err != nil {
		t.Fatal(err)
	}
	if time.Since(start) > time.Second {
		t.Fatal("hung worker blocked fallback")
	}
	pool.poolMu.Lock()
	defer pool.poolMu.Unlock()
	for _, n := range pool.active {
		if n != 0 {
			t.Fatal("leaked worker slot")
		}
	}
}

func TestRejectMixedWorkerReleases(t *testing.T) {
	t.Setenv("WORKER_RELEASE", "expected")
	wrong := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Arena-Release", "old")
		fmt.Fprint(w, `{"is_valid":false}`)
	}))
	defer wrong.Close()
	good := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Arena-Release", "expected")
		fmt.Fprint(w, `{"is_valid":true}`)
	}))
	defer good.Close()
	result, err := NewHTTPBotRunnerAdapter(wrong.URL+","+good.URL).Mutate(nil, "validate-code", nil)
	if err != nil || result["is_valid"] != true {
		t.Fatal("accepted mismatched version", result, err)
	}
	if _, err = NewHTTPBotRunnerAdapter(wrong.URL).Mutate(nil, "validate-code", nil); err == nil {
		t.Fatal("mixed version accepted")
	}
}

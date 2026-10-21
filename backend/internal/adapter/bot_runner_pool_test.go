package adapter

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func TestWorkerPoolBalancesAndFallsBack(t *testing.T) {
	var a, b atomic.Int32
	first := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { a.Add(1); fmt.Fprint(w, `{"worker":"a"}`) }))
	defer first.Close()
	second := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { b.Add(1); fmt.Fprint(w, `{"worker":"b"}`) }))
	defer second.Close()
	pool := NewHTTPBotRunnerAdapter(first.URL + ", " + second.URL)
	for i := 0; i < 4; i++ {
		if _, err := pool.Mutate(nil, "validate-code", nil); err != nil {
			t.Fatal(err)
		}
	}
	if a.Load() != 2 || b.Load() != 2 {
		t.Fatal("not balanced")
	}
	first.Close()
	if _, err := pool.Mutate(nil, "validate-code", nil); err != nil {
		t.Fatal("no fallback", err)
	}
}

func TestWorkerPoolRetriesOverloadButNotInvalidCode(t *testing.T) {
	for _, status := range []int{429, 503, 400} {
		t.Run(fmt.Sprint(status), func(t *testing.T) {
			var fallback atomic.Int32
			first := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(status)
				fmt.Fprint(w, `{"detail":"rejected"}`)
			}))
			defer first.Close()
			second := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fallback.Add(1); fmt.Fprint(w, `{"is_valid":true}`) }))
			defer second.Close()
			_, err := NewHTTPBotRunnerAdapter(first.URL+","+second.URL).Mutate(nil, "validate-code", nil)
			if status == 400 {
				if err == nil || fallback.Load() != 0 {
					t.Fatal("retried semantic error")
				}
			} else if err != nil || fallback.Load() != 1 {
				t.Fatal("missing overload fallback", err)
			}
		})
	}
}

func TestWorkerPoolRetriesIncompleteAndMalformedResults(t *testing.T) {
	for _, broken := range []string{"truncated", "invalid-json"} {
		t.Run(broken, func(t *testing.T) {
			first := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if broken == "truncated" {
					w.Header().Set("Content-Length", "1000")
				}
				fmt.Fprint(w, `{"unfinished":`)
			}))
			defer first.Close()
			second := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, `{"worker":"healthy"}`) }))
			defer second.Close()
			pool := NewHTTPBotRunnerAdapter(first.URL + "," + second.URL)
			got, err := pool.Mutate(nil, "validate-code", nil)
			if err != nil || got["worker"] != "healthy" {
				t.Fatalf("fallback failed: %v %v", got, err)
			}
			pool.poolMu.Lock()
			defer pool.poolMu.Unlock()
			if pool.active[0] != 0 || pool.active[1] != 0 || len(pool.slots) != 0 {
				t.Fatal("capacity leaked")
			}
		})
	}
}

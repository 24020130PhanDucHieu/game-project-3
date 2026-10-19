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

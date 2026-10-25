package main

import "testing"

func TestGlobalScope(t *testing.T) {
	cases := map[string]string{
		"/api/qualifiers/q1/start":            "q",
		"/api/ai-cup/q1/tasks/lock":           "q",
		"/api/ai-main/t1/tasks/roll":          "t:",
		"/api/ai-bank":                        "ai:",
		"/api/clarifications":                 "clar:",
		"/api/admin/notifications":            "nt:",
		"/api/tournaments/create":             "tl",
		"/api/tournaments/t1/matches/m1/play": "",
		"/api/ranking":                        "",
	}
	for path, want := range cases {
		if got := globalScope(path); got != want {
			t.Errorf("%s: got %q want %q", path, got, want)
		}
	}
}

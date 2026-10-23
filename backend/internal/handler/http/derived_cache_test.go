package http

import "testing"

func TestDerivedCacheInvalidatesOnWriteAndIgnoresStaleCompute(t *testing.T) {
	InvalidateDerived()
	v := derivedVersion()
	derivedSet("k", v, 1)
	if got, ok := derivedGet("k"); !ok || got != 1 {
		t.Fatalf("expected cached value, got %v %v", got, ok)
	}
	InvalidateDerived()
	if _, ok := derivedGet("k"); ok {
		t.Fatal("write must invalidate cached aggregate")
	}
	// A computation that started before a write must not repopulate the cache with stale data.
	derivedSet("k", v, 2)
	if _, ok := derivedGet("k"); ok {
		t.Fatal("stale computation was cached")
	}
}

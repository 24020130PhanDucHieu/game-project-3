package http

import (
	"fmt"
	"testing"
	"time"
)

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

func TestDerivedCacheReleasesMemoryAndBoundsKeys(t *testing.T) {
	InvalidateDerived()
	v := derivedVersion()
	for i := 0; i < 2*derivedMaxEntries; i++ {
		derivedSet(fmt.Sprint(i), v, i)
	}
	derived.Lock()
	if len(derived.items) > derivedMaxEntries {
		t.Error("derived cache grew beyond limit")
	}
	derived.items["expired"] = derivedEntry{value: "large result", expires: time.Now().Add(-time.Second), version: v}
	derived.Unlock()
	if _, ok := derivedGet("expired"); ok {
		t.Error("expired entry returned")
	}
	derived.Lock()
	_, retained := derived.items["expired"]
	derived.Unlock()
	if retained {
		t.Error("expired entry retained in memory")
	}
	InvalidateDerived()
	derived.Lock()
	defer derived.Unlock()
	if len(derived.items) != 0 {
		t.Error("invalidated values retained in memory")
	}
}

package repository

import (
	"context"
	"testing"
	"time"
)

func TestDatabaseMonitorCacheAndFailure(t *testing.T) {
	d := &readDriver{failures: 10}
	repo := testReadRepository(t, d)
	s := &QualifierRecords{db: repo.db, monitorAt: time.Now(), monitorData: map[string]interface{}{"db_bytes": int64(42)}}
	got, err := s.DatabaseStats(context.Background())
	if err != nil || got["db_bytes"] != int64(42) || d.calls != 0 {
		t.Fatalf("cached sample: %v %v calls=%d", got, err, d.calls)
	}
	got["status"] = "READY"
	if _, ok := s.monitorData["status"]; ok {
		t.Fatal("caller mutated cached map")
	}
	s.monitorAt = time.Now().Add(-2 * time.Minute)
	got, err = s.DatabaseStats(context.Background())
	if err == nil || got != nil {
		t.Fatal("expired sample must not hide database failure")
	}
}

func TestDatabaseMonitorCanceledContext(t *testing.T) {
	d := &readDriver{}
	repo := testReadRepository(t, d)
	s := &QualifierRecords{db: repo.db, monitorAt: time.Now(), monitorData: map[string]interface{}{"db_bytes": 42}}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if got, err := s.DatabaseStats(ctx); err == nil || got != nil || d.calls != 0 {
		t.Fatal("canceled request should not query or return cached data")
	}
}

func TestQueueCountsExcludesSourcesAndCompleted(t *testing.T) {
	store, err := NewQualifierRecords(nil, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	err = store.Batch(map[string]interface{}{
		"validation:a": map[string]interface{}{"status": "QUEUED"},
		"validation:b": map[string]interface{}{"status": "DONE"},
		"job:a":        map[string]interface{}{"status": "RUNNING"},
		"job:b":        map[string]interface{}{"status": "ERROR"},
		"job:c":        map[string]interface{}{"status": "PENDING"},
		"submission:a": map[string]interface{}{"status": "QUEUED", "code": "private source"},
	})
	if err != nil {
		t.Fatal(err)
	}
	got, err := store.QueueCounts(context.Background())
	if err != nil || got["validation_QUEUED"] != 1 || got["job_RUNNING"] != 1 || got["job_FAILED"] != 1 || got["job_QUEUED"] != 1 || len(got) != 6 {
		t.Fatalf("%v %v", got, err)
	}
}

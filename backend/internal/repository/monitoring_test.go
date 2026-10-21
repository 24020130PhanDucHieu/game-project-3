package repository

import (
	"context"
	"testing"
)

func TestQueueCountsExcludesSourcesAndCompleted(t *testing.T) {
	store, err := NewQualifierRecords(nil, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	err = store.Batch(map[string]interface{}{
		"validation:a": map[string]interface{}{"status": "QUEUED"},
		"validation:b": map[string]interface{}{"status": "DONE"},
		"job:a":        map[string]interface{}{"status": "RUNNING"},
		"job:b":        map[string]interface{}{"status": "FAILED"},
		"submission:a": map[string]interface{}{"status": "QUEUED", "code": "private source"},
	})
	if err != nil {
		t.Fatal(err)
	}
	got, err := store.QueueCounts(context.Background())
	if err != nil || got["validation_QUEUED"] != 1 || got["job_RUNNING"] != 1 || got["job_FAILED"] != 1 || got["job_QUEUED"] != 0 || len(got) != 6 {
		t.Fatalf("%v %v", got, err)
	}
}

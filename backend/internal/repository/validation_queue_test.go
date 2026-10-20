package repository

import (
	"fmt"
	"testing"
)

func TestReadyValidationsBoundedFIFOAndRetry(t *testing.T) {
	store, err := NewQualifierRecords(nil, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	rows := map[string]interface{}{}
	for i := 0; i < 300; i++ {
		rows[fmt.Sprintf("validation:%04d", i)] = map[string]interface{}{"status": "QUEUED", "at": i, "retry_at": 0}
	}
	rows["validation:0000"] = map[string]interface{}{"status": "QUEUED", "at": 0, "retry_at": 100}
	rows["validation:0001"] = map[string]interface{}{"status": "DONE", "at": 1}
	rows["submission:secret"] = map[string]interface{}{"status": "QUEUED", "at": -1, "code": "secret"}
	if err = store.Batch(rows); err != nil {
		t.Fatal(err)
	}
	ready, err := store.ReadyValidations(50, 4)
	if err != nil || len(ready) != 4 {
		t.Fatal(len(ready), err)
	}
	for i := 2; i < 6; i++ {
		if _, ok := ready[fmt.Sprintf("validation:%04d", i)]; !ok {
			t.Fatal("FIFO/retry filter failed", ready)
		}
	}
	ready, err = store.ReadyValidations(150, 10000)
	if err != nil || len(ready) != 128 {
		t.Fatal("page not bounded", len(ready), err)
	}
	if _, ok := ready["validation:0000"]; !ok {
		t.Fatal("retry not recovered")
	}
}

func TestMetadataBatchPreservesSourceButClearsUnlockedFields(t *testing.T) {
	store, err := NewQualifierRecords(nil, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err = store.Batch(map[string]interface{}{"participant:event:student": map[string]interface{}{"code": "source", "locked_id": "old", "elo": 1200}}); err != nil {
		t.Fatal(err)
	}
	if err = store.BatchPreservingParticipantCode(map[string]interface{}{"participant:event:student": map[string]interface{}{"elo": 1216}}); err != nil {
		t.Fatal(err)
	}
	var row map[string]interface{}
	if err = store.Get("participant:event:student", &row); err != nil {
		t.Fatal(err)
	}
	if row["code"] != "source" || row["elo"] != float64(1216) || row["locked_id"] != nil {
		t.Fatal("lost source or stale metadata", row)
	}
}

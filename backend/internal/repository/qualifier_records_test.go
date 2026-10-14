package repository

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestQualifierJournalRecovery(t *testing.T) {
	dir := t.TempDir()
	repo := NewJSONTournamentRepository(filepath.Join(dir, "tournaments.json"))
	store, err := NewQualifierRecords(repo, filepath.Join(dir, "qualifiers"))
	if err != nil {
		t.Fatal(err)
	}
	if err = store.Batch(map[string]interface{}{"job:1": map[string]interface{}{"status": "PENDING"}}); err != nil {
		t.Fatal(err)
	}
	journal := map[string]interface{}{"job:1": map[string]interface{}{"status": "DONE"}, "event:1": map[string]interface{}{"applied": 1}}
	raw, _ := json.Marshal(journal)
	if err = os.WriteFile(filepath.Join(dir, "qualifiers", "journal.json"), raw, 0600); err != nil {
		t.Fatal(err)
	}
	recovered, err := NewQualifierRecords(repo, filepath.Join(dir, "qualifiers"))
	if err != nil {
		t.Fatal(err)
	}
	var job map[string]interface{}
	if err = recovered.Get("job:1", &job); err != nil || job["status"] != "DONE" {
		t.Fatal(job, err)
	}
	var event map[string]interface{}
	if err = recovered.Get("event:1", &event); err != nil || event["applied"] != float64(1) {
		t.Fatal(event, err)
	}
	if _, err = os.Stat(filepath.Join(dir, "qualifiers", "journal.json")); !os.IsNotExist(err) {
		t.Fatal("journal not cleared")
	}
}

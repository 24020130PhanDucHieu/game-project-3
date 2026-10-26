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

func TestDeleteQualifierAlsoRemovesValidationAndPrefixesWork(t *testing.T) {
	dir := t.TempDir()
	repo := NewJSONTournamentRepository(filepath.Join(dir, "tournaments.json"))
	store, err := NewQualifierRecords(repo, filepath.Join(dir, "qualifiers"))
	if err != nil {
		t.Fatal(err)
	}
	rows := map[string]interface{}{
		"event:q1": map[string]interface{}{"id": "q1"}, "validation:q1:s1": map[string]interface{}{"status": "QUEUED"}, "aitasks:q1": map[string]interface{}{},
		"event:q2": map[string]interface{}{"id": "q2"}, "validation:q2:s1": map[string]interface{}{"status": "QUEUED"},
		"aireport:t1:a": map[string]interface{}{}, "aireport:t10:a": map[string]interface{}{}, "aireportcfg:t1": map[string]interface{}{}, "certcfg:t1": map[string]interface{}{},
	}
	if err = store.Batch(rows); err != nil {
		t.Fatal(err)
	}
	if err = store.DeleteQualifier("q1"); err != nil {
		t.Fatal(err)
	}
	var v map[string]interface{}
	if store.Get("validation:q1:s1", &v) == nil || store.Get("event:q1", &v) == nil || store.Get("aitasks:q1", &v) == nil {
		t.Fatal("dữ liệu của vòng loại đã xóa vẫn còn")
	}
	if store.Get("validation:q2:s1", &v) != nil || store.Get("event:q2", &v) != nil {
		t.Fatal("không được xóa nhầm vòng loại khác")
	}
	if err = store.DeletePrefixes("aireport:t1:", "aireportcfg:t1", "certcfg:t1"); err != nil {
		t.Fatal(err)
	}
	if store.Get("aireport:t1:a", &v) == nil || store.Get("aireportcfg:t1", &v) == nil || store.Get("certcfg:t1", &v) == nil {
		t.Fatal("tiền tố chưa được dọn")
	}
	if store.Get("aireport:t10:a", &v) != nil {
		t.Fatal("giải t10 không được bị xóa khi dọn giải t1")
	}
}

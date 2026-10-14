package repository

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func TestQualifierMetadata2000AndInvalidation(t *testing.T) {
	s := &QualifierRecords{dir: t.TempDir(), items: map[string]json.RawMessage{}}
	for i := 0; i < 2000; i++ {
		raw, _ := json.Marshal(map[string]interface{}{"student_id": fmt.Sprint(i), "code": strings.Repeat("x", 64000), "elo": 1200})
		s.items[fmt.Sprintf("participant:cup:%d", i)] = raw
	}
	rows, err := s.ListMetadata("participant:cup:", "")
	if err != nil || len(rows) != 2000 {
		t.Fatalf("metadata: %d %v", len(rows), err)
	}
	total := 0
	for _, raw := range rows {
		total += len(raw)
		if strings.Contains(string(raw), `"code"`) {
			t.Fatal("source in metadata")
		}
	}
	if total > 200000 {
		t.Fatalf("metadata too large: %d", total)
	}
	delete(rows, "participant:cup:0")
	cached, _ := s.ListMetadata("participant:cup:", "")
	if len(cached) != 2000 {
		t.Fatal("caller modified cached map")
	}
	if err := s.Batch(map[string]interface{}{"participant:cup:0": map[string]interface{}{"student_id": "0", "code": "new", "elo": 1400}}); err != nil {
		t.Fatal(err)
	}
	updated, _ := s.ListMetadata("participant:cup:", "")
	if !strings.Contains(string(updated["participant:cup:0"]), "1400") {
		t.Fatal("stale cache after write")
	}
	var original map[string]interface{}
	if err := s.Get("participant:cup:0", &original); err != nil || original["code"] != "new" {
		t.Fatal("projection changed stored code")
	}
}

func TestQualifierJobMetadataIsScoped(t *testing.T) {
	s := &QualifierRecords{items: map[string]json.RawMessage{
		"job:cup:1": json.RawMessage(`{"a":"alice","b":"bob"}`),
		"job:cup:2": json.RawMessage(`{"a":"carol","b":"dan"}`),
	}}
	for _, sid := range []string{"alice", "bob", "carol", "dan"} {
		rows, err := s.ListMetadata("job:cup:", sid)
		if err != nil || len(rows) != 1 {
			t.Fatalf("scope %s: %v %v", sid, rows, err)
		}
	}
}

func TestListFailureIsNotEmptySuccess(t *testing.T) {
	repo := testReadRepository(t, &readDriver{failures: 1})
	if _, err := repo.GetListChecked(); err == nil {
		t.Fatal("database failure returned successful list")
	}
}

func TestSupabaseTransactionPoolerRejected(t *testing.T) {
	if _, err := NewPostgresTournamentRepository("postgresql://user:placeholder@aws-0-test.pooler.supabase.com:6543/postgres"); err == nil {
		t.Fatal("transaction pooler accepted")
	}
}

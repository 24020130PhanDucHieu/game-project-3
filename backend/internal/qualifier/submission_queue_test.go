package qualifier

import (
	"encoding/json"
	"path/filepath"
	"project-tuan3/internal/repository"
	"sync"
	"testing"
)

func submissionFixture(t *testing.T) (*Service, Event) {
	t.Helper()
	s, e := fixture(t, 0)
	accounts, err := repositoryAccounts(t)
	if err != nil {
		t.Fatal(err)
	}
	s.Accounts = accounts
	if err = accounts.Create("12345678", "Queue team", "password123"); err != nil {
		t.Fatal(err)
	}
	e.Status, e.Deadline = "OPEN", now()+60
	if err = s.Store.Batch(map[string]interface{}{metaKey(e.ID): e, participantKey(e.ID, "12345678"): Participant{SID: "12345678", Elo: 1200}}); err != nil {
		t.Fatal(err)
	}
	return s, e
}

func TestDurableSubmissionReceiptAndDeadline(t *testing.T) {
	s, e := submissionFixture(t)
	sub, err := s.EnqueueSubmission(e.ID, "12345678", "code", "PYTHON", "request")
	if err != nil || sub.Status != "QUEUED" {
		t.Fatal(sub, err)
	}
	// Simulate another service process taking over the persistent store.
	restarted := New(s.Store, s.Accounts, nil, &testEngine{})
	e.Deadline = now() - 1
	if err = s.Store.Batch(map[string]interface{}{metaKey(e.ID): e}); err != nil {
		t.Fatal(err)
	}
	again, err := restarted.EnqueueSubmission(e.ID, "12345678", "code", "PYTHON", "request")
	if err != nil || again.ID != sub.ID {
		t.Fatal(again, err)
	}
	if _, err = restarted.EnqueueSubmission(e.ID, "12345678", "changed", "PYTHON", "request"); err == nil {
		t.Fatal("payload collision accepted")
	}
	if _, err = restarted.EnqueueSubmission(e.ID, "12345678", "code", "PYTHON", "late"); err == nil {
		t.Fatal("late submission accepted")
	}
	if err = restarted.Freeze(e.ID); err != nil {
		t.Fatal(err)
	}
	closing, _ := restarted.Event(e.ID)
	if closing.Status != "CLOSING" {
		t.Fatal(closing)
	}
	if err = restarted.processSubmission("validation:" + e.ID + ":" + sub.ID); err != nil {
		t.Fatal(err)
	}
	if err = restarted.Freeze(e.ID); err != nil {
		t.Fatal(err)
	}
	people, _ := restarted.Participants(e.ID)
	if people["12345678"].LockedID != sub.ID || people["12345678"].Pending != 0 {
		t.Fatal(people)
	}
	history, _ := restarted.Store.List("submission:" + e.ID + ":")
	if len(history) != 1 {
		t.Fatal("duplicate submission", len(history))
	}
	var saved Submission
	for _, raw := range history {
		json.Unmarshal(raw, &saved)
	}
	if !saved.Valid || saved.At != sub.At {
		t.Fatal(saved)
	}
}

func TestQueuedValidationFailureRetriesAndOlderResultCannotOverwrite(t *testing.T) {
	s, e := submissionFixture(t)
	old, err := s.EnqueueSubmission(e.ID, "12345678", "old", "CPP", "old")
	if err != nil {
		t.Fatal(err)
	}
	newer, err := s.EnqueueSubmission(e.ID, "12345678", "new", "PYTHON", "new")
	if err != nil {
		t.Fatal(err)
	}
	s.Engine = &testEngine{fail: true}
	oldKey := "validation:" + e.ID + ":" + old.ID
	if err = s.processSubmission(oldKey); err != nil {
		t.Fatal(err)
	}
	var pending validationTask
	s.Store.Get(oldKey, &pending)
	if pending.Status != "QUEUED" || pending.RetryAt <= now() {
		t.Fatal(pending)
	}
	pending.RetryAt = 0
	s.Store.Batch(map[string]interface{}{oldKey: pending})
	s.Engine = &testEngine{}
	if err = s.processSubmission("validation:" + e.ID + ":" + newer.ID); err != nil {
		t.Fatal(err)
	}
	if err = s.processSubmission(oldKey); err != nil {
		t.Fatal(err)
	}
	if err = s.processSubmission(oldKey); err != nil {
		t.Fatal(err)
	}
	people, _ := s.Participants(e.ID)
	if people["12345678"].ValidID != newer.ID || people["12345678"].Pending != 0 {
		t.Fatal(people)
	}
}

func TestConcurrentSameSubmissionID(t *testing.T) {
	s, e := submissionFixture(t)
	var wg sync.WaitGroup
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := s.EnqueueSubmission(e.ID, "12345678", "code", "PYTHON", "same"); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	pending, err := s.Store.Pending("validation:")
	if err != nil || len(pending) != 1 {
		t.Fatal(len(pending), err)
	}
}

// Keep account files separate from the tournament fixture.
func repositoryAccounts(t *testing.T) (*repository.Accounts, error) {
	return repository.NewAccounts(repository.NewJSONTournamentRepository(filepath.Join(t.TempDir(), "t.json")), filepath.Join(t.TempDir(), "accounts.json"))
}

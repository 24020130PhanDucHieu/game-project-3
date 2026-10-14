package qualifier

import (
	"errors"
	"math"
	"path/filepath"
	"project-tuan3/internal/repository"
	"testing"
	"time"
)

type testEngine struct {
	fail    bool
	invalid bool
}

func (e *testEngine) Mutate(_ interface{}, action string, _ map[string]interface{}) (map[string]interface{}, error) {
	if e.fail {
		return nil, errors.New("worker unavailable")
	}
	if action == "validate-code" {
		return map[string]interface{}{"is_valid": !e.invalid, "error_message": "fixture validation error"}, nil
	}
	return map[string]interface{}{"winner_side": "team_a", "win_reason": "fixture"}, nil
}
func fixture(t *testing.T, n int) (*Service, Event) {
	t.Helper()
	dir := t.TempDir()
	repo := repository.NewJSONTournamentRepository(filepath.Join(dir, "tournaments.json"))
	store, err := repository.NewQualifierRecords(repo, filepath.Join(dir, "qualifiers"))
	if err != nil {
		t.Fatal(err)
	}
	s := New(store, nil, nil, &testEngine{})
	e := Event{ID: "fixture", Status: "RUNNING", Rounds: 3, TopK: 8, Eligible: n, Seed: "fixed"}
	rows := map[string]interface{}{metaKey(e.ID): e}
	for i := 0; i < n; i++ {
		sid := string(rune('A' + i))
		rows[participantKey(e.ID, sid)] = Participant{SID: sid, Name: sid, LockedID: sid, Code: "code", Elo: 1200}
	}
	if err = store.Batch(rows); err != nil {
		t.Fatal(err)
	}
	return s, e
}
func TestRoundsApplyOnceAndOddByeBalanced(t *testing.T) {
	s, e := fixture(t, 9)
	if err := s.run(e.ID); err != nil {
		t.Fatal(err)
	}
	done, err := s.Event(e.ID)
	if err != nil || done.Status != "FINISHED" || done.AppliedRound != 3 || done.Completed != 15 {
		t.Fatal(done, err)
	}
	people, _ := s.Participants(e.ID)
	sum := 0.0
	byes := 0
	for _, p := range people {
		sum += p.Elo
		byes += p.Byes
		if p.Played+p.Byes != 3 {
			t.Fatal(p)
		}
		if p.Byes > 1 {
			t.Fatal("repeated bye before others", p)
		}
	}
	if byes != 3 || math.Abs(sum-10800) > 0.001 {
		t.Fatal(sum, byes)
	}
	if err = s.run(e.ID); err != nil {
		t.Fatal(err)
	}
	again, _ := s.Participants(e.ID)
	for id, p := range people {
		if again[id].Elo != p.Elo {
			t.Fatal("double-rated")
		}
	}
}
func TestFailedWorkerCanResumeStoredJobs(t *testing.T) {
	s, e := fixture(t, 8)
	s.Engine = &testEngine{fail: true}
	if s.run(e.ID) == nil {
		t.Fatal("missing worker failure")
	}
	people, _ := s.Participants(e.ID)
	for _, p := range people {
		if p.Elo != 1200 {
			t.Fatal("partially rated")
		}
	}
	s.Engine = &testEngine{}
	if err := s.run(e.ID); err != nil {
		t.Fatal(err)
	}
	done, _ := s.Event(e.ID)
	if done.Status != "FINISHED" {
		t.Fatal(done)
	}
}
func TestConfigureAndFrozenRules(t *testing.T) {
	s, _ := fixture(t, 8)
	if _, err := s.Configure("", Event{Name: "bad", Deadline: now() + 100, Rounds: 2, TopK: 12}); err == nil {
		t.Fatal("bad top")
	}
	e, err := s.Configure("", Event{Name: "valid", Deadline: now() + 60, Rounds: 2, TopK: 16})
	if err != nil {
		t.Fatal(err)
	}
	e.Status = "LOCKED"
	s.Store.Batch(map[string]interface{}{metaKey(e.ID): e})
	if _, err = s.Configure(e.ID, Event{Name: "changed", Deadline: float64(time.Now().Unix() + 100), Rounds: 2, TopK: 8}); err == nil {
		t.Fatal("changed locked")
	}
}

func TestLastValidSubmissionDeadlineAndFreeze(t *testing.T) {
	t.Setenv("ACCOUNT_ENCRYPTION_KEY", "test-key")
	dir := t.TempDir()
	repo := repository.NewJSONTournamentRepository(filepath.Join(dir, "tournaments.json"))
	accounts, err := repository.NewAccounts(repo, filepath.Join(dir, "accounts.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err = accounts.Create("12340001", "Test Team", "password"); err != nil {
		t.Fatal(err)
	}
	store, err := repository.NewQualifierRecords(repo, filepath.Join(dir, "qualifiers"))
	if err != nil {
		t.Fatal(err)
	}
	s := New(store, accounts, nil, &testEngine{})
	e, err := s.Configure("", Event{Name: "Submission Cup", Deadline: now() + 100, Rounds: 2, TopK: 8})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Submit(e.ID, "12340001", "valid code", "PYTHON"); err == nil {
		t.Fatal("unregistered submission accepted")
	}
	if err := s.Register(e.ID, "12340001"); err != nil {
		t.Fatal(err)
	}
	if err := s.Register(e.ID, "12340001"); err != nil {
		t.Fatal(err)
	}
	registered, _ := s.Participants(e.ID)
	if len(registered) != 1 || registered["12340001"].ValidID != "" {
		t.Fatal("registration unexpectedly submitted code")
	}
	good, err := s.Submit(e.ID, "12340001", "valid code", "PYTHON")
	if err != nil {
		t.Fatal(err)
	}
	s.Engine = &testEngine{invalid: true}
	bad, err := s.Submit(e.ID, "12340001", "bad code", "PYTHON")
	if err != nil || bad.Valid {
		t.Fatal(bad, err)
	}
	people, _ := s.Participants(e.ID)
	if people["12340001"].ValidID != good.ID || people["12340001"].Code != "valid code" {
		t.Fatal("invalid submission replaced valid one")
	}
	e.Deadline = now() - 1
	s.Store.Batch(map[string]interface{}{metaKey(e.ID): e})
	if _, err = s.Submit(e.ID, "12340001", "late", "PYTHON"); err == nil {
		t.Fatal("accepted after deadline")
	}
	if err = s.Freeze(e.ID); err != nil {
		t.Fatal(err)
	}
	people, _ = s.Participants(e.ID)
	if people["12340001"].LockedID != good.ID {
		t.Fatal("wrong snapshot frozen")
	}
	if err := s.Freeze(e.ID); err != nil {
		t.Fatal(err)
	}
	locked, _ := s.Event(e.ID)
	if locked.Eligible != 1 {
		t.Fatal("duplicate frozen count", locked.Eligible)
	}
	if s.Start(e.ID) == nil {
		t.Fatal("started with fewer than K entrants")
	}
}

func TestExplicitTestBotsAndCapacity(t *testing.T) {
	s, _ := fixture(t, 8)
	e, err := s.Configure("", Event{Name: "Test only", Deadline: now() + 100, Rounds: 1, TopK: 8})
	if err != nil {
		t.Fatal(err)
	}
	people, _ := s.Participants(e.ID)
	if len(people) != 0 {
		t.Fatal("new qualifier not empty")
	}
	if err := s.GenerateTestBots(e.ID, 2000); err != nil {
		t.Fatal(err)
	}
	people, _ = s.Participants(e.ID)
	if len(people) != 2000 {
		t.Fatal(len(people))
	}
	for _, p := range people {
		if !p.TestBot || p.ValidID == "" || p.Code == "" {
			t.Fatal(p)
		}
	}
	if s.GenerateTestBots(e.ID, 1) == nil {
		t.Fatal("capacity exceeded")
	}
	// Reproduce the reported persisted state: 2,000 valid test bots but
	// metadata says LOCKED with zero eligible and no jobs ever scheduled.
	e.Status = "LOCKED"
	e.Eligible = 0
	e.Error = "Chỉ có 0 bot hợp lệ"
	if err := s.Store.Batch(map[string]interface{}{metaKey(e.ID): e}); err != nil {
		t.Fatal(err)
	}
	if err := s.Freeze(e.ID); err != nil {
		t.Fatal(err)
	}
	if s.GenerateTestBots(e.ID, 1) == nil {
		t.Fatal("generated after freeze")
	}
	e, _ = s.Event(e.ID)
	if e.Eligible != 2000 {
		t.Fatal(e.Eligible)
	}
	if e.Error != "" {
		t.Fatal(e.Error)
	}
	people, _ = s.Participants(e.ID)
	for _, p := range people {
		if p.LockedID != p.ValidID || p.LockedID == "" {
			t.Fatal("bot not frozen", p.SID)
		}
	}
	if err := s.Freeze(e.ID); err != nil {
		t.Fatal(err)
	}
	e, _ = s.Event(e.ID)
	if e.Eligible != 2000 {
		t.Fatal("double counted", e.Eligible)
	}
	// Existing pairing records prohibit any replacement of snapshots.
	if err := s.Store.Batch(map[string]interface{}{jobPrefix(e.ID, 1) + "0001": Job{ID: "existing", Status: "PENDING"}}); err != nil {
		t.Fatal(err)
	}
	if s.Freeze(e.ID) == nil {
		t.Fatal("re-froze already paired event")
	}
}

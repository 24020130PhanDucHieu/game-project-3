package qualifier

import (
	"sync"
	"testing"
)

type pauseEngine struct {
	pause func()
	once  sync.Once
}

func (e *pauseEngine) Mutate(_ interface{}, _ string, _ map[string]interface{}) (map[string]interface{}, error) {
	e.once.Do(e.pause)
	return map[string]interface{}{"winner_side": "team_a", "win_reason": "fixture"}, nil
}

func TestPauseFinishesCurrentPairingRoundBeforeStopping(t *testing.T) {
	s, e := fixture(t, 8)
	s.Engine = &pauseEngine{pause: func() {
		if err := s.Pause(e.ID); err != nil {
			t.Error(err)
		}
	}}
	if err := s.run(e.ID); err != nil {
		t.Fatal(err)
	}
	paused, err := s.Event(e.ID)
	if err != nil || paused.Status != "PAUSED" || paused.AppliedRound != 1 {
		t.Fatal(paused, err)
	}
	people, err := s.Participants(e.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range people {
		if p.Played != 1 {
			t.Fatal("partial rating round", p)
		}
	}
	paused.Status = "RUNNING"
	paused.PauseRequested = false
	if err := s.Store.Batch(map[string]interface{}{metaKey(e.ID): paused}); err != nil {
		t.Fatal(err)
	}
	s.Engine = &testEngine{}
	if err := s.run(e.ID); err != nil {
		t.Fatal(err)
	}
	people, _ = s.Participants(e.ID)
	for _, p := range people {
		if p.Played != 3 {
			t.Fatal("resume lost or duplicated a round", p)
		}
	}
}

func TestReopenPreservesValidBotsAndRefusesCompetitiveProgress(t *testing.T) {
	s, e := submissionFixture(t)
	sub, err := s.Submit(e.ID, "12345678", "code", "PYTHON")
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Freeze(e.ID); err != nil {
		t.Fatal(err)
	}
	if err = s.Reopen(e.ID, e.Deadline+3600, "Network outage"); err != nil {
		t.Fatal(err)
	}
	opened, _ := s.Event(e.ID)
	people, _ := s.Participants(e.ID)
	p := people["12345678"]
	if opened.Status != "OPEN" || p.ValidID != sub.ID || p.LockedID != "" || p.Code != "code" {
		t.Fatal(opened, p)
	}
	audit, _ := s.Store.List("audit:qualifier-reopen:")
	if len(audit) != 1 {
		t.Fatal("missing atomic deadline audit")
	}
	if err = s.Reopen(e.ID, opened.Deadline-1, "shorten"); err == nil {
		t.Fatal("deadline shortened")
	}
	if err = s.Store.Batch(map[string]interface{}{jobPrefix(e.ID, 1) + "0001": Job{Status: "DONE"}}); err != nil {
		t.Fatal(err)
	}
	if err = s.Reopen(e.ID, opened.Deadline+3600, "too late"); err == nil {
		t.Fatal("reopened after pairing")
	}
}

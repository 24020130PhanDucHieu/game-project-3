package service

import (
	"path/filepath"
	"project-tuan3/internal/repository"
	"sync"
	"testing"
	"time"
)

func incidentFixture(t *testing.T) (*TournamentService, *repository.JSONTournamentRepository) {
	t.Helper()
	repo := repository.NewJSONTournamentRepository(filepath.Join(t.TempDir(), "t.json"))
	state := readyTournament("AWAITING_SUBMISSIONS")
	matches := state["matches"].(map[string]interface{})
	match := matches["m1"].(map[string]interface{})
	match["next_match_id"], match["next_slot"], match["round_level"] = "final", "team_a", 1
	match["team_a"].(map[string]interface{})["team_name"] = "Đội đỏ"
	match["team_b"].(map[string]interface{})["team_name"] = "Đội xanh"
	matches["final"] = map[string]interface{}{"status": "WAITING", "round_level": 2}
	if err := repo.Save("cup", state); err != nil {
		t.Fatal(err)
	}
	return NewTournamentService(repo, nil), repo
}

func TestCorrectionAdvancesAndRollbackRestoresExactSnapshot(t *testing.T) {
	s, _ := incidentFixture(t)
	before, _ := s.GetTournamentByID("cup")
	token := CorrectionToken(before)
	result, err := s.CorrectMatch("cup", "m1", MatchCorrection{Token: token, Reason: "Trọng tài xác minh", Action: "result", ScoreA: 3, ScoreB: 1})
	if err != nil {
		t.Fatal(err)
	}
	after, _ := s.GetTournamentByID("cup")
	final := after["matches"].(map[string]interface{})["final"].(map[string]interface{})
	if final["team_a"].(map[string]interface{})["team_name"] != "Đội đỏ" {
		t.Fatal(final)
	}
	if _, err = s.CorrectMatch("cup", "m1", MatchCorrection{Token: token, Reason: "Trọng tài xác minh", Action: "result", ScoreA: 0, ScoreB: 3}); err == nil {
		t.Fatal("stale correction accepted")
	}
	_, err = s.CorrectMatch("cup", "m1", MatchCorrection{Token: result["correction_token"].(string), Reason: "Hoàn tác quyết định", Action: "rollback"})
	if err != nil {
		t.Fatal(err)
	}
	restored, _ := s.GetTournamentByID("cup")
	if CorrectionToken(restored) != token {
		t.Fatal("rollback changed original data")
	}
}

func TestCorrectionDoesNotOverwriteDownstreamOrConcurrentDecision(t *testing.T) {
	s, repo := incidentFixture(t)
	state, _ := s.GetTournamentByID("cup")
	state["matches"].(map[string]interface{})["final"].(map[string]interface{})["submissions_history"] = []interface{}{map[string]interface{}{"id": "submitted"}}
	repo.Save("cup", state)
	if _, err := s.CorrectMatch("cup", "m1", MatchCorrection{Token: CorrectionToken(state), Reason: "Đổi đội thắng", Action: "result", ScoreA: 3}); err == nil {
		t.Fatal("accepted downstream overwrite")
	}
	s, _ = incidentFixture(t)
	state, _ = s.GetTournamentByID("cup")
	req := MatchCorrection{Token: CorrectionToken(state), Reason: "Đổi đội thắng", Action: "result", ScoreA: 3}
	errors := make(chan error, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, err := s.CorrectMatch("cup", "m1", req); errors <- err }()
	}
	wg.Wait()
	close(errors)
	success := 0
	for err := range errors {
		if err == nil {
			success++
		}
	}
	if success != 1 {
		t.Fatal("concurrent corrections committed", success)
	}
}

func TestSubmissionRespectsServerWindowAndDisqualification(t *testing.T) {
	for _, scenario := range []string{"future", "closed", "disqualified", "running"} {
		t.Run(scenario, func(t *testing.T) {
			s, repo := incidentFixture(t)
			state, _ := s.GetTournamentByID("cup")
			match := state["matches"].(map[string]interface{})["m1"].(map[string]interface{})
			now := float64(time.Now().Unix())
			if scenario == "future" {
				state["stage_schedule"] = map[string]interface{}{"1": map[string]interface{}{"starts_at": now + 60, "ends_at": now + 120}}
			}
			if scenario == "closed" {
				state["stage_schedule"] = map[string]interface{}{"1": map[string]interface{}{"starts_at": now - 120, "ends_at": now - 1}}
			}
			if scenario == "disqualified" {
				match["team_a"].(map[string]interface{})["disqualified"] = true
			}
			if scenario == "running" {
				match["battle_running"] = true
			}
			repo.Save("cup", state)
			// No engine is supplied: invalid submissions must never reach it.
			if _, err := s.MutateTournament("cup", "submit-code", map[string]interface{}{"match_id": "m1", "side": "team_a"}); err == nil {
				t.Fatal("invalid submission accepted")
			}
		})
	}
}

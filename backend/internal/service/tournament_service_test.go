package service

import (
	"errors"
	"path/filepath"
	"project-tuan3/internal/repository"
	"testing"
)

type failingEngine struct {
	entered chan struct{}
	release chan struct{}
}

func (e *failingEngine) Mutate(interface{}, string, map[string]interface{}) (map[string]interface{}, error) {
	close(e.entered)
	<-e.release
	return nil, errors.New("worker disconnected")
}
func readyTournament(status string) map[string]interface{} {
	return map[string]interface{}{"tournament_id": "cup", "matches": map[string]interface{}{"m1": map[string]interface{}{
		"status": "READY", "round_status": status, "battle_running": status == "BATTLE_RUNNING", "current_round_idx": 2,
		"team_a": map[string]interface{}{"code_valid": true, "rounds_won": 1}, "team_b": map[string]interface{}{"code_valid": true, "rounds_won": 0},
	}}}
}
func TestRestartRecoversRunningRoundWithoutLosingScore(t *testing.T) {
	repo := repository.NewJSONTournamentRepository(filepath.Join(t.TempDir(), "tournaments.json"))
	repo.Save("cup", readyTournament("BATTLE_RUNNING"))
	service := NewTournamentService(repo, nil)
	if err := service.RecoverInterruptedRounds(); err != nil {
		t.Fatal(err)
	}
	data, _ := service.GetTournamentByID("cup")
	match := data["matches"].(map[string]interface{})["m1"].(map[string]interface{})
	if match["battle_running"] != false || match["round_status"] != "READY_FOR_BATTLE" || match["current_round_idx"] != float64(2) || match["team_a"].(map[string]interface{})["rounds_won"] != float64(1) {
		t.Fatal("round data lost during recovery")
	}
}
func TestWorkerFailureRestoresDurableReadiness(t *testing.T) {
	repo := repository.NewJSONTournamentRepository(filepath.Join(t.TempDir(), "tournaments.json"))
	repo.Save("cup", readyTournament("READY_FOR_BATTLE"))
	engine := &failingEngine{entered: make(chan struct{}), release: make(chan struct{})}
	service := NewTournamentService(repo, engine)
	done := make(chan error, 1)
	go func() {
		_, err := service.MutateTournament("cup", "play-round", map[string]interface{}{"match_id": "m1"})
		done <- err
	}()
	<-engine.entered
	data, _ := service.GetTournamentByID("cup")
	if data["matches"].(map[string]interface{})["m1"].(map[string]interface{})["battle_running"] != true {
		t.Fatal("running state was not persisted")
	}
	close(engine.release)
	if err := <-done; err == nil {
		t.Fatal("worker failure ignored")
	}
	data, _ = service.GetTournamentByID("cup")
	match := data["matches"].(map[string]interface{})["m1"].(map[string]interface{})
	if match["battle_running"] != false || match["round_status"] != "READY_FOR_BATTLE" {
		t.Fatal("failed execution stranded the match")
	}
}

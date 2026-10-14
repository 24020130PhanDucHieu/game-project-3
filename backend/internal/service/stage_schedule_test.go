package service

import (
	"path/filepath"
	"project-tuan3/internal/repository"
	"testing"
	"time"
)

func TestStageScheduleValidatesPersistsAndGuards(t *testing.T) {
	path := filepath.Join(t.TempDir(), "tournaments.json")
	repo := repository.NewJSONTournamentRepository(path)
	repo.Save("cup", map[string]interface{}{"matches": map[string]interface{}{
		"quarter": map[string]interface{}{"round_level": 1, "status": "READY"},
		"semi":    map[string]interface{}{"round_level": 2, "status": "READY"},
	}})
	svc := NewTournamentService(repo, nil)
	now := float64(time.Now().Unix())
	windows := []StageWindow{{1, now + 100, now + 200}, {2, now + 250, now + 350}}
	if _, err := svc.SetStageSchedule("cup", windows); err != nil {
		t.Fatal(err)
	}
	restarted := NewTournamentService(repository.NewJSONTournamentRepository(path), nil)
	data, err := restarted.GetTournamentByID("cup")
	if err != nil {
		t.Fatal(err)
	}
	matches := data["matches"].(map[string]interface{})
	quarter := matches["quarter"].(map[string]interface{})
	semi := matches["semi"].(map[string]interface{})
	if CanStartStage(data, quarter, time.Unix(int64(now+99), 0)) == nil {
		t.Fatal("started before opening")
	}
	if err := CanStartStage(data, quarter, time.Unix(int64(now+100), 0)); err != nil {
		t.Fatal(err)
	}
	if CanStartStage(data, quarter, time.Unix(int64(now+200), 0)) == nil {
		t.Fatal("started at closing")
	}
	if CanStartStage(data, semi, time.Unix(int64(now+260), 0)) == nil {
		t.Fatal("ignored unfinished previous stage")
	}
	quarter["status"] = "COMPLETED"
	if err := CanStartStage(data, semi, time.Unix(int64(now+260), 0)); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetStageSchedule("cup", []StageWindow{{1, now + 100, now + 300}, {2, now + 250, now + 350}}); err == nil {
		t.Fatal("accepted overlapping windows")
	}
	if _, err := svc.SetStageSchedule("cup", []StageWindow{{3, now + 100, now + 200}}); err == nil {
		t.Fatal("accepted nonexistent level")
	}
	if _, err := svc.SetStageSchedule("cup", []StageWindow{{1, now + 200, now + 100}}); err == nil {
		t.Fatal("accepted invalid end")
	}
}

func TestAddMissingScheduleToPlayedRoundOf32(t *testing.T) {
	repo := repository.NewJSONTournamentRepository(filepath.Join(t.TempDir(), "tournaments.json"))
	repo.Save("cup32", map[string]interface{}{"matches": map[string]interface{}{
		"round32": map[string]interface{}{"round_level": 1, "round_name": "Vòng 1/16", "rounds_history": []interface{}{map[string]interface{}{"winner": "team_a"}}},
	}})
	svc := NewTournamentService(repo, nil)
	now := float64(time.Now().Unix())
	if _, err := svc.SetStageSchedule("cup32", []StageWindow{{1, now + 10, now + 100}}); err == nil {
		t.Fatal("future start on played stage")
	}
	if _, err := svc.SetStageSchedule("cup32", []StageWindow{{1, now - 100, now + 100}}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetStageSchedule("cup32", []StageWindow{{1, now - 50, now + 200}}); err == nil {
		t.Fatal("changed established start")
	}
	if _, err := svc.SetStageSchedule("cup32", []StageWindow{{1, now - 100, now + 200}}); err != nil {
		t.Fatal(err)
	}
}

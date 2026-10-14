package service

import (
	"path/filepath"
	"project-tuan3/internal/repository"
	"testing"
	"time"
)

func TestStageRulesPersistLockAndInvalidateOldSubmissions(t *testing.T) {
	path := filepath.Join(t.TempDir(), "tournaments.json")
	repo := repository.NewJSONTournamentRepository(path)
	repo.Save("cup", map[string]interface{}{"stage_rule": "STAGE_1_STANDARD", "matches": map[string]interface{}{
		"q": map[string]interface{}{"round_level": 1, "team_a": map[string]interface{}{"code_valid": true, "current_code": "saved"}},
		"s": map[string]interface{}{"round_level": 2, "rounds_history": []interface{}{map[string]interface{}{"winner": "team_a"}}},
	}})
	svc := NewTournamentService(repo, nil)
	future := float64(time.Now().Unix() + 600)
	if _, err := svc.SetStageRules("cup", []StageRule{{1, "RULE_FOG", future}}); err != nil {
		t.Fatal(err)
	}
	data, _ := svc.GetTournamentByID("cup")
	match := data["matches"].(map[string]interface{})["q"].(map[string]interface{})
	team := match["team_a"].(map[string]interface{})
	if team["code_valid"] != false || team["current_code"] != "saved" {
		t.Fatal("old code lost or remained valid")
	}
	if CheckStageRulePublished(data, match, time.Now()) == nil {
		t.Fatal("unpublished rule allowed")
	}
	if err := CheckStageRulePublished(data, match, time.Unix(int64(future), 0)); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetStageRules("cup", []StageRule{{2, "RULE_FOG", future}}); err == nil {
		t.Fatal("changed played stage")
	}
	if _, err := svc.SetStageRules("cup", []StageRule{{3, "RULE_FOG", future}}); err == nil {
		t.Fatal("accepted missing stage")
	}
	if _, err := svc.SetStageRules("cup", []StageRule{{1, "invalid", future}}); err == nil {
		t.Fatal("accepted unknown rule")
	}
	if _, err := svc.SetStageRules("cup", []StageRule{{1, "RULE_REVERSE", 0}}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetStageRules("cup", []StageRule{{1, "RULE_FOG", future}}); err == nil {
		t.Fatal("changed published stage")
	}
	restarted := NewTournamentService(repository.NewJSONTournamentRepository(path), nil)
	data, _ = restarted.GetTournamentByID("cup")
	if StageRuleFor(data, match)["rule_id"] != "RULE_REVERSE" {
		t.Fatal("rule not persisted")
	}
	if _, err := svc.MutateTournament("cup", "set-rule", map[string]interface{}{"stage_name": "STAGE_1_STANDARD"}); err == nil {
		t.Fatal("legacy endpoint bypassed lock")
	}
}

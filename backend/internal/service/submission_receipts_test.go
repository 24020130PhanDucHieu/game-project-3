package service

import (
	"path/filepath"
	"project-tuan3/internal/repository"
	"testing"
)

type receiptEngine struct{ calls int }

func (e *receiptEngine) Mutate(current interface{}, action string, params map[string]interface{}) (map[string]interface{}, error) {
	e.calls++
	return map[string]interface{}{"tournament": current, "is_valid": true, "status": "SUCCESS"}, nil
}
func TestBracketReceiptSurvivesRestartWithoutWorkerReplay(t *testing.T) {
	path := filepath.Join(t.TempDir(), "t.json")
	repo := repository.NewJSONTournamentRepository(path)
	if err := repo.Save("cup", readyTournament("READY_FOR_BATTLE")); err != nil {
		t.Fatal(err)
	}
	engine := &receiptEngine{}
	s := NewTournamentService(repo, engine)
	params := func(code string) map[string]interface{} {
		return map[string]interface{}{"match_id": "m1", "_receipt_key": "same", "code_content": code}
	}
	if _, err := s.MutateTournament("cup", "submit-code", params("code")); err != nil {
		t.Fatal(err)
	}
	restarted := NewTournamentService(repository.NewJSONTournamentRepository(path), engine)
	result, err := restarted.MutateTournament("cup", "submit-code", params("code"))
	if err != nil || result["is_valid"] != true || engine.calls != 1 {
		t.Fatal(result, err, engine.calls)
	}
	if _, err = restarted.MutateTournament("cup", "submit-code", params("other")); err == nil {
		t.Fatal("payload collision")
	}
}

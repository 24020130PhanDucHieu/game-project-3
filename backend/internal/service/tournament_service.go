package service

import (
	"errors"
	"fmt"

	"project-tuan3/internal/adapter"
	"project-tuan3/internal/model"
	"project-tuan3/internal/repository"
)

type TournamentService struct {
	repo    repository.TournamentRepository
	adapter adapter.BotRunnerAdapter
}

func NewTournamentService(repo repository.TournamentRepository, adapter adapter.BotRunnerAdapter) *TournamentService {
	return &TournamentService{
		repo:    repo,
		adapter: adapter,
	}
}

func (s *TournamentService) GetAllTournaments() map[string]interface{} {
	return s.repo.GetAll()
}

func (s *TournamentService) GetTournamentList() []model.TournamentSummary {
	return s.repo.GetList()
}

func (s *TournamentService) GetTournamentByID(id string) (map[string]interface{}, error) {
	t, found := s.repo.GetByID(id)
	if !found {
		return nil, errors.New("không tìm thấy giải đấu")
	}
	return t, nil
}

func (s *TournamentService) CreateTournament(name string, numTeams int) (map[string]interface{}, error) {
	if numTeams <= 0 {
		numTeams = 8
	}

	params := map[string]interface{}{
		"name":      name,
		"num_teams": numTeams,
	}

	res, err := s.adapter.Mutate(nil, "create-tournament", params)
	if err != nil {
		return nil, err
	}

	newTournament, ok := res["tournament"].(map[string]interface{})
	if !ok {
		return nil, errors.New("định dạng giải đấu mới không hợp lệ")
	}

	tID, ok := newTournament["tournament_id"].(string)
	if !ok || tID == "" {
		return nil, errors.New("giải đấu thiếu tournament_id")
	}

	s.repo.Save(tID, newTournament)
	_ = s.repo.SaveToDisk()

	return res, nil
}

func (s *TournamentService) MutateTournament(tournamentID, action string, params map[string]interface{}) (map[string]interface{}, error) {
	current, found := s.repo.GetByID(tournamentID)
	if !found {
		return nil, fmt.Errorf("không tìm thấy giải đấu có ID: %s", tournamentID)
	}

	res, err := s.adapter.Mutate(current, action, params)
	if err != nil {
		return nil, err
	}

	if mutated, ok := res["tournament"].(map[string]interface{}); ok {
		s.repo.Save(tournamentID, mutated)
		_ = s.repo.SaveToDisk()
	}

	return res, nil
}

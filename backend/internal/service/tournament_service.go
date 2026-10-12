package service

import (
	"errors"
	"fmt"
	"sync"

	"project-tuan3/internal/adapter"
	"project-tuan3/internal/model"
	"project-tuan3/internal/repository"
)

type TournamentService struct {
	repo    repository.TournamentRepository
	adapter adapter.BotRunnerAdapter
	locksMu sync.Mutex
	locks   map[string]*sync.Mutex
}

func NewTournamentService(repo repository.TournamentRepository, adapter adapter.BotRunnerAdapter) *TournamentService {
	return &TournamentService{
		repo:    repo,
		adapter: adapter,
		locks:   make(map[string]*sync.Mutex),
	}
}

func (s *TournamentService) lockTournament(id string) func() {
	s.locksMu.Lock()
	lock := s.locks[id]
	if lock == nil {
		lock = &sync.Mutex{}
		s.locks[id] = lock
	}
	s.locksMu.Unlock()
	lock.Lock()
	return lock.Unlock
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

func (s *TournamentService) DeleteTournament(id string) error {
	unlock := s.lockTournament(id)
	defer unlock()
	if _, found := s.repo.GetByID(id); !found {
		return fmt.Errorf("không tìm thấy giải đấu có ID: %s", id)
	}
	if err := s.repo.Delete(id); err != nil {
		return err
	}
	return s.repo.SaveToDisk()
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

	if err := s.repo.Save(tID, newTournament); err != nil {
		return nil, err
	}
	if err := s.repo.SaveToDisk(); err != nil {
		return nil, err
	}

	return res, nil
}

func (s *TournamentService) MutateTournament(tournamentID, action string, params map[string]interface{}) (map[string]interface{}, error) {
	unlock := s.lockTournament(tournamentID)
	defer unlock()
	current, found := s.repo.GetByID(tournamentID)
	if !found {
		return nil, fmt.Errorf("không tìm thấy giải đấu có ID: %s", tournamentID)
	}

	res, err := s.adapter.Mutate(current, action, params)
	if err != nil {
		return nil, err
	}

	if mutated, ok := res["tournament"].(map[string]interface{}); ok {
		if err := s.repo.Save(tournamentID, mutated); err != nil {
			return nil, err
		}
		if err := s.repo.SaveToDisk(); err != nil {
			return nil, err
		}
	}

	return res, nil
}

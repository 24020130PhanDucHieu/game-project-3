package service

import (
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"project-tuan3/internal/adapter"
	"project-tuan3/internal/model"
	"project-tuan3/internal/repository"
)

type TournamentService struct {
	repo         repository.TournamentRepository
	adapter      adapter.BotRunnerAdapter
	locksMu      sync.Mutex
	locks        map[string]*sync.Mutex
	OnRoundEvent func(string, string, string)
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

func (s *TournamentService) GetTournamentListChecked() ([]model.TournamentSummary, error) {
	if pg, ok := s.repo.(*repository.PostgresTournamentRepository); ok {
		return pg.GetListChecked()
	}
	return s.repo.GetList(), nil
}

func (s *TournamentService) ValidateCode(params map[string]interface{}) (map[string]interface{}, error) {
	return s.adapter.Mutate(nil, "validate-code", params)
}

func (s *TournamentService) RecoverInterruptedRounds() error {
	for tournamentID, raw := range s.repo.GetAll() {
		tournament, _ := raw.(map[string]interface{})
		matches, _ := tournament["matches"].(map[string]interface{})
		changed := false
		legacy := false
		for _, rawMatch := range matches {
			match, _ := rawMatch.(map[string]interface{})
			if match["status"] != "COMPLETED" && match["max_rounds"] != nil && match["max_rounds"] != float64(5) {
				legacy = true
			}
			if match["round_status"] != "BATTLE_RUNNING" {
				continue
			}
			match["battle_running"] = false
			teamA, _ := match["team_a"].(map[string]interface{})
			teamB, _ := match["team_b"].(map[string]interface{})
			ready := teamA["code_valid"] == true && teamB["code_valid"] == true
			match["all_teams_ready"] = ready
			match["round_status"] = "AWAITING_SUBMISSIONS"
			if ready {
				match["round_status"] = "READY_FOR_BATTLE"
			}
			changed = true
		}
		if legacy {
			result, err := s.adapter.Mutate(tournament, "upgrade-rules", map[string]interface{}{})
			if err != nil {
				return fmt.Errorf("migrate match rules: %w", err)
			}
			tournament, _ = result["tournament"].(map[string]interface{})
			if tournament == nil {
				return errors.New("worker returned no tournament during rules migration")
			}
			changed = true
		}
		if changed {
			if err := s.repo.Save(tournamentID, tournament); err != nil {
				return err
			}
			if err := s.repo.SaveToDisk(); err != nil {
				return err
			}
		}
	}
	return nil
}

// Reconcile the stored deadline independently of any admin browser. Restarting
// the server or reloading a page cannot strand a match between two rounds.
func (s *TournamentService) StartRoundTransitions(onUpdated func(string, string)) {
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for range ticker.C {
			for tournamentID, raw := range s.repo.GetAll() {
				tournament, _ := raw.(map[string]interface{})
				matches, _ := tournament["matches"].(map[string]interface{})
				for matchID, rawMatch := range matches {
					match, _ := rawMatch.(map[string]interface{})
					deadline, _ := match["intermission_ends_at"].(float64)
					if match["round_status"] != "ROUND_FINISHED" || deadline <= 0 || float64(time.Now().UnixMilli())/1000 < deadline {
						continue
					}
					result, err := s.MutateTournament(tournamentID, "next-round", map[string]interface{}{"match_id": matchID})
					if err != nil {
						log.Printf("Round transition failed for %s/%s: %v", tournamentID, matchID, err)
						continue
					}
					if result["status"] == "SUCCESS" && onUpdated != nil {
						onUpdated(tournamentID, matchID)
					}
				}
			}
		}
	}()
}

func (s *TournamentService) GetTournamentByID(id string) (map[string]interface{}, error) {
	t, found, err := s.repo.GetByID(id)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, repository.ErrTournamentNotFound
	}
	return t, nil
}

func (s *TournamentService) DeleteTournament(id string) error {
	unlock := s.lockTournament(id)
	defer unlock()
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
	current, found, err := s.repo.GetByID(tournamentID)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, fmt.Errorf("%w có ID: %s", repository.ErrTournamentNotFound, tournamentID)
	}
	var runningMatch map[string]interface{}
	var previousRoundStatus interface{}
	if action == "play-round" {
		matches, _ := current["matches"].(map[string]interface{})
		matchID, _ := params["match_id"].(string)
		runningMatch, _ = matches[matchID].(map[string]interface{})
		if runningMatch == nil {
			return nil, errors.New("không tìm thấy trận đấu")
		}
		if err := CanStartStage(current, runningMatch, time.Now()); err != nil {
			return nil, err
		}
		if runningMatch["status"] == "COMPLETED" || runningMatch["round_status"] == "ROUND_FINISHED" || runningMatch["battle_running"] == true {
			return nil, errors.New("hiệp đã kết thúc hoặc đang chạy; hãy chờ trạng thái mới")
		}
		teamA, _ := runningMatch["team_a"].(map[string]interface{})
		teamB, _ := runningMatch["team_b"].(map[string]interface{})
		if teamA["code_valid"] != true || teamB["code_valid"] != true {
			return nil, errors.New("cả hai đội phải nộp mã hợp lệ trước khi bắt đầu")
		}
		previousRoundStatus = runningMatch["round_status"]
		runningMatch["round_status"] = "BATTLE_RUNNING"
		runningMatch["battle_running"] = true
		if err := s.repo.Save(tournamentID, current); err != nil {
			return nil, err
		}
		if err := s.repo.SaveToDisk(); err != nil {
			return nil, err
		}
		if s.OnRoundEvent != nil {
			s.OnRoundEvent(tournamentID, matchID, "ROUND_RUNNING")
		}
		// The worker owns its local execution lock; the durable snapshot above
		// already records the running state for every browser.
		runningMatch["battle_running"] = false
	}

	res, err := s.adapter.Mutate(current, action, params)
	if err != nil {
		if runningMatch != nil {
			runningMatch["round_status"] = previousRoundStatus
			runningMatch["battle_running"] = false
			if saveErr := s.repo.Save(tournamentID, current); saveErr != nil {
				return nil, saveErr
			}
			if saveErr := s.repo.SaveToDisk(); saveErr != nil {
				return nil, saveErr
			}
			if s.OnRoundEvent != nil {
				matchID, _ := params["match_id"].(string)
				s.OnRoundEvent(tournamentID, matchID, "TOURNAMENT_UPDATED")
			}
		}
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

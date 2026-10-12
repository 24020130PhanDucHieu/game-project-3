package repository

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"sync"

	"project-tuan3/internal/model"
)

type TournamentRepository interface {
	GetAll() map[string]interface{}
	GetList() []model.TournamentSummary
	GetByID(id string) (map[string]interface{}, bool)
	Save(id string, tournament map[string]interface{}) error
	Delete(id string) error
	SaveToDisk() error
}

type JSONTournamentRepository struct {
	mu        sync.RWMutex
	persistMu sync.Mutex
	dbPath    string
	store     map[string]interface{}
}

func NewJSONTournamentRepository(dbPath string) *JSONTournamentRepository {
	repo := &JSONTournamentRepository{
		dbPath: dbPath,
		store:  make(map[string]interface{}),
	}
	repo.store["tournaments"] = make(map[string]interface{})
	repo.loadFromDisk()

	return repo
}

func (r *JSONTournamentRepository) loadFromDisk() {
	if _, err := os.Stat(r.dbPath); err == nil {
		data, err := os.ReadFile(r.dbPath)
		if err == nil {
			var loaded map[string]interface{}
			if err := json.Unmarshal(data, &loaded); err == nil {
				if t, ok := loaded["tournaments"].(map[string]interface{}); ok {
					r.store["tournaments"] = t
				}
			}
		}
	}
}

func (r *JSONTournamentRepository) SaveToDisk() error {
	r.persistMu.Lock()
	defer r.persistMu.Unlock()
	r.mu.RLock()
	data, err := json.MarshalIndent(r.store, "", "  ")
	r.mu.RUnlock()
	if err != nil {
		return err
	}
	dir := filepath.Dir(r.dbPath)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return err
		}
	}
	tmp, err := os.CreateTemp(dir, ".tournaments-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if _, err = tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err = tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err = tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, r.dbPath)
}

func (r *JSONTournamentRepository) GetAll() map[string]interface{} {
	r.mu.RLock()
	defer r.mu.RUnlock()
	tournaments, ok := r.store["tournaments"].(map[string]interface{})
	if !ok {
		return make(map[string]interface{})
	}
	// Deep copies prevent callers from mutating repository state after a read.
	copyMap := make(map[string]interface{}, len(tournaments))
	for k, v := range tournaments {
		if tMap, ok := v.(map[string]interface{}); ok {
			copyMap[k] = cloneTournament(tMap)
		} else {
			copyMap[k] = v
		}
	}
	return copyMap
}

func (r *JSONTournamentRepository) GetList() []model.TournamentSummary {
	r.mu.RLock()
	defer r.mu.RUnlock()
	tournaments, ok := r.store["tournaments"].(map[string]interface{})
	if !ok {
		return []model.TournamentSummary{}
	}

	var list []model.TournamentSummary
	for _, v := range tournaments {
		if t, ok := v.(map[string]interface{}); ok {
			id, _ := t["tournament_id"].(string)
			name, _ := t["name"].(string)
			numTeams := 0
			if nt, ok := t["num_teams"].(float64); ok {
				numTeams = int(nt)
			}
			createdAt, _ := t["created_at"].(float64)
			status, _ := t["status"].(string)
			champion, _ := t["champion"].(string)
			list = append(list, model.TournamentSummary{
				TournamentID: id,
				Name:         name,
				NumTeams:     numTeams,
				CreatedAt:    createdAt,
				Status:       status,
				Champion:     champion,
			})
		}
	}
	sort.SliceStable(list, func(i, j int) bool { return list[i].CreatedAt > list[j].CreatedAt })
	return list
}

func (r *JSONTournamentRepository) GetByID(id string) (map[string]interface{}, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	tournaments, ok := r.store["tournaments"].(map[string]interface{})
	if !ok {
		return nil, false
	}
	val, exists := tournaments[id]
	if !exists || val == nil {
		return nil, false
	}
	if tMap, ok := val.(map[string]interface{}); ok {
		return cloneTournament(tMap), true
	}
	return nil, false
}

func (r *JSONTournamentRepository) Save(id string, tournament map[string]interface{}) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	tournaments, ok := r.store["tournaments"].(map[string]interface{})
	if !ok {
		tournaments = make(map[string]interface{})
		r.store["tournaments"] = tournaments
	}
	tournaments[id] = cloneTournament(tournament)
	return nil
}

func cloneTournament(tournament map[string]interface{}) map[string]interface{} {
	data, err := json.Marshal(tournament)
	if err != nil {
		return tournament
	}
	var cloned map[string]interface{}
	if err := json.Unmarshal(data, &cloned); err != nil {
		return tournament
	}
	return cloned
}

func (r *JSONTournamentRepository) Delete(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	tournaments, ok := r.store["tournaments"].(map[string]interface{})
	if ok {
		delete(tournaments, id)
	}
	return nil
}

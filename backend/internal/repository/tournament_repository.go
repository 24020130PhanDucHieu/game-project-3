package repository

import (
	"encoding/json"
	"io/ioutil"
	"os"
	"sync"
	"time"

	"project-tuan3/internal/model"
)

type TournamentRepository interface {
	GetAll() map[string]interface{}
	GetList() []model.TournamentSummary
	GetByID(id string) (map[string]interface{}, bool)
	Save(id string, tournament map[string]interface{})
	Delete(id string)
	SaveToDisk() error
}

type JSONTournamentRepository struct {
	mu     sync.RWMutex
	dbPath string
	store  map[string]interface{}
}

func NewJSONTournamentRepository(dbPath string) *JSONTournamentRepository {
	repo := &JSONTournamentRepository{
		dbPath: dbPath,
		store:  make(map[string]interface{}),
	}
	repo.store["tournaments"] = make(map[string]interface{})
	repo.loadFromDisk()

	// Periodic disk flush every 5 seconds
	go repo.periodicFlush()

	return repo
}

func (r *JSONTournamentRepository) loadFromDisk() {
	if _, err := os.Stat(r.dbPath); err == nil {
		data, err := ioutil.ReadFile(r.dbPath)
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

func (r *JSONTournamentRepository) periodicFlush() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		_ = r.SaveToDisk()
	}
}

func (r *JSONTournamentRepository) SaveToDisk() error {
	r.mu.RLock()
	data, err := json.MarshalIndent(r.store, "", "  ")
	r.mu.RUnlock()
	if err != nil {
		return err
	}
	return ioutil.WriteFile(r.dbPath, data, 0644)
}

func (r *JSONTournamentRepository) GetAll() map[string]interface{} {
	r.mu.RLock()
	defer r.mu.RUnlock()
	tournaments, ok := r.store["tournaments"].(map[string]interface{})
	if !ok {
		return make(map[string]interface{})
	}
	// Shallow copy to prevent race conditions
	copyMap := make(map[string]interface{}, len(tournaments))
	for k, v := range tournaments {
		copyMap[k] = v
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
			list = append(list, model.TournamentSummary{
				TournamentID: id,
				Name:         name,
				NumTeams:     numTeams,
			})
		}
	}
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
		return tMap, true
	}
	return nil, false
}

func (r *JSONTournamentRepository) Save(id string, tournament map[string]interface{}) {
	r.mu.Lock()
	defer r.mu.Unlock()
	tournaments, ok := r.store["tournaments"].(map[string]interface{})
	if !ok {
		tournaments = make(map[string]interface{})
		r.store["tournaments"] = tournaments
	}
	tournaments[id] = tournament
}

func (r *JSONTournamentRepository) Delete(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	tournaments, ok := r.store["tournaments"].(map[string]interface{})
	if ok {
		delete(tournaments, id)
	}
}

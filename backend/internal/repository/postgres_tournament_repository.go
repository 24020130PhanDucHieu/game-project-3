package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	_ "github.com/lib/pq"
	"project-tuan3/internal/model"
)

type PostgresTournamentRepository struct {
	db              *sql.DB
	mu              sync.RWMutex
	cache           map[string]map[string]interface{}
	readMu          sync.Mutex
	versions        map[string]string
	cacheGeneration uint64
}

func NewPostgresTournamentRepository(databaseURL string) (*PostgresTournamentRepository, error) {
	parsed, parseErr := url.Parse(databaseURL)
	if parseErr == nil && strings.HasSuffix(parsed.Hostname(), ".pooler.supabase.com") && parsed.Port() == "6543" {
		return nil, fmt.Errorf("Supabase requires the Session pooler on port 5432: qualifier coordination uses session advisory locks")
	}
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("lỗi kết nối postgres: %w", err)
	}

	// Cấu hình Connection Pool cho PostgreSQL / Supabase
	db.SetMaxOpenConns(8)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("lỗi ping cơ sở dữ liệu PostgreSQL: %w", err)
	}

	repo := &PostgresTournamentRepository{
		db:    db,
		cache: make(map[string]map[string]interface{}),
	}

	if err := repo.migrateSchema(); err != nil {
		db.Close()
		return nil, fmt.Errorf("lỗi khởi tạo bảng postgres: %w", err)
	}

	if err := repo.warmupCache(); err != nil {
		log.Printf("[Postgres Warning] Lỗi nạp cache ban đầu: %v", err)
	}

	return repo, nil
}

func (r *PostgresTournamentRepository) migrateSchema() error {
	query := `
	CREATE TABLE IF NOT EXISTS tournaments (
		id VARCHAR(128) PRIMARY KEY,
		name VARCHAR(255) NOT NULL,
		num_teams INT NOT NULL DEFAULT 8,
		status VARCHAR(64) DEFAULT 'CONFIGURING',
		champion VARCHAR(255),
		data JSONB NOT NULL,
		updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_tournaments_updated_at ON tournaments(updated_at DESC);
	ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
	`
	_, err := r.db.Exec(query)
	return err
}

func (r *PostgresTournamentRepository) warmupCache() error {
	_, err := r.readAllVersioned()
	return err
}

func (r *PostgresTournamentRepository) GetAll() map[string]interface{} {
	result, err := r.readAllVersioned()
	if err != nil {
		return r.cachedSnapshot()
	}
	return result
}

func (r *PostgresTournamentRepository) cachedSnapshot() map[string]interface{} {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make(map[string]interface{}, len(r.cache))
	for id, tournament := range r.cache {
		result[id] = cloneTournament(tournament)
	}
	return result
}

func (r *PostgresTournamentRepository) GetList() []model.TournamentSummary {
	if list, err := r.GetListChecked(); err == nil {
		return list
	}
	tournaments := r.cachedSnapshot()
	list := []model.TournamentSummary{}
	for id, raw := range tournaments {
		t, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		name, _ := t["name"].(string)
		numTeams := 0
		if nt, ok := t["num_teams"].(float64); ok {
			numTeams = int(nt)
		} else if nt, ok := t["num_teams"].(int); ok {
			numTeams = nt
		}
		createdAt, _ := t["created_at"].(float64)
		status, _ := t["status"].(string)
		champion, _ := t["champion"].(string)
		track, _ := t["track"].(string)
		list = append(list, model.TournamentSummary{
			Track:        track,
			TournamentID: id,
			Name:         name,
			NumTeams:     numTeams,
			CreatedAt:    createdAt,
			Status:       status,
			Champion:     champion,
		})
	}
	sort.SliceStable(list, func(i, j int) bool { return list[i].CreatedAt > list[j].CreatedAt })
	return list
}

func (r *PostgresTournamentRepository) Save(id string, tournament map[string]interface{}) error {
	name, _ := tournament["name"].(string)
	status, _ := tournament["status"].(string)
	champion, _ := tournament["champion"].(string)
	numTeams := 8
	if nt, ok := tournament["num_teams"].(float64); ok {
		numTeams = int(nt)
	} else if nt, ok := tournament["num_teams"].(int); ok {
		numTeams = nt
	}
	raw, err := json.Marshal(tournament)
	if err != nil {
		return fmt.Errorf("marshal tournament %s: %w", id, err)
	}
	query := `INSERT INTO tournaments (id, name, num_teams, status, champion, data, updated_at)
	VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
	ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, num_teams=EXCLUDED.num_teams,
	status=EXCLUDED.status, champion=EXCLUDED.champion, data=EXCLUDED.data, updated_at=CURRENT_TIMESTAMP;`
	if _, err := r.db.Exec(query, id, name, numTeams, status, champion, raw); err != nil {
		return fmt.Errorf("save tournament %s: %w", id, err)
	}
	r.mu.Lock()
	r.cache[id] = cloneTournament(tournament)
	delete(r.versions, id)
	r.cacheGeneration++
	r.mu.Unlock()
	return nil
}

func (r *PostgresTournamentRepository) Delete(id string) error {
	result, err := r.db.Exec("DELETE FROM tournaments WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("delete tournament %s: %w", id, err)
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return ErrTournamentNotFound
	}
	r.mu.Lock()
	delete(r.cache, id)
	delete(r.versions, id)
	r.cacheGeneration++
	r.mu.Unlock()
	return nil
}
func (r *PostgresTournamentRepository) SaveToDisk() error {
	// Không cần thiết với Postgres
	return nil
}

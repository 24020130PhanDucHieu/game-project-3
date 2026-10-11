package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	_ "github.com/lib/pq"
	"project-tuan3/internal/model"
)

type PostgresTournamentRepository struct {
	db    *sql.DB
	mu    sync.RWMutex
	cache map[string]map[string]interface{}
}

func NewPostgresTournamentRepository(databaseURL string) (*PostgresTournamentRepository, error) {
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("lỗi kết nối postgres: %w", err)
	}

	// Cấu hình Connection Pool cho Neon Serverless
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("lỗi ping cơ sở dữ liệu Neon Postgres: %w", err)
	}

	repo := &PostgresTournamentRepository{
		db:    db,
		cache: make(map[string]map[string]interface{}),
	}

	if err := repo.migrateSchema(); err != nil {
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
	`
	_, err := r.db.Exec(query)
	return err
}

func (r *PostgresTournamentRepository) warmupCache() error {
	rows, err := r.db.Query("SELECT id, data FROM tournaments")
	if err != nil {
		return err
	}
	defer rows.Close()

	r.mu.Lock()
	defer r.mu.Unlock()

	for rows.Next() {
		var id string
		var rawData []byte
		if err := rows.Scan(&id, &rawData); err == nil {
			var t map[string]interface{}
			if err := json.Unmarshal(rawData, &t); err == nil {
				r.cache[id] = t
			}
		}
	}
	return nil
}

func (r *PostgresTournamentRepository) GetAll() map[string]interface{} {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make(map[string]interface{}, len(r.cache))
	for k, v := range r.cache {
		result[k] = v
	}
	return result
}

func (r *PostgresTournamentRepository) GetList() []model.TournamentSummary {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var list []model.TournamentSummary
	for _, t := range r.cache {
		id, _ := t["tournament_id"].(string)
		name, _ := t["name"].(string)
		numTeams := 0
		if nt, ok := t["num_teams"].(float64); ok {
			numTeams = int(nt)
		} else if nt, ok := t["num_teams"].(int); ok {
			numTeams = nt
		}
		list = append(list, model.TournamentSummary{
			TournamentID: id,
			Name:         name,
			NumTeams:     numTeams,
		})
	}
	return list
}

func (r *PostgresTournamentRepository) GetByID(id string) (map[string]interface{}, bool) {
	r.mu.RLock()
	cached, ok := r.cache[id]
	r.mu.RUnlock()
	if ok && cached != nil {
		return cached, true
	}

	// Fallback đọc trực tiếp từ DB nếu cache miss
	var rawData []byte
	err := r.db.QueryRow("SELECT data FROM tournaments WHERE id = $1", id).Scan(&rawData)
	if err != nil {
		return nil, false
	}

	var t map[string]interface{}
	if err := json.Unmarshal(rawData, &t); err != nil {
		return nil, false
	}

	r.mu.Lock()
	r.cache[id] = t
	r.mu.Unlock()

	return t, true
}

func (r *PostgresTournamentRepository) Save(id string, tournament map[string]interface{}) {
	r.mu.Lock()
	r.cache[id] = tournament
	r.mu.Unlock()

	// Async lưu vào Postgres để tăng tốc độ phản hồi API cho người dùng
	go func(tid string, tData map[string]interface{}) {
		name, _ := tData["name"].(string)
		status, _ := tData["status"].(string)
		champion, _ := tData["champion"].(string)
		numTeams := 8
		if nt, ok := tData["num_teams"].(float64); ok {
			numTeams = int(nt)
		} else if nt, ok := tData["num_teams"].(int); ok {
			numTeams = nt
		}

		raw, err := json.Marshal(tData)
		if err != nil {
			log.Printf("[Postgres Error] Marshal tournament %s thất bại: %v", tid, err)
			return
		}

		query := `
		INSERT INTO tournaments (id, name, num_teams, status, champion, data, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			num_teams = EXCLUDED.num_teams,
			status = EXCLUDED.status,
			champion = EXCLUDED.champion,
			data = EXCLUDED.data,
			updated_at = CURRENT_TIMESTAMP;
		`
		if _, err := r.db.Exec(query, tid, name, numTeams, status, champion, raw); err != nil {
			log.Printf("[Postgres Error] Ghi tournament %s vào DB thất bại: %v", tid, err)
		}
	}(id, tournament)
}

func (r *PostgresTournamentRepository) Delete(id string) {
	r.mu.Lock()
	delete(r.cache, id)
	r.mu.Unlock()

	go func(tid string) {
		_, _ = r.db.Exec("DELETE FROM tournaments WHERE id = $1", tid)
	}(id)
}

func (r *PostgresTournamentRepository) SaveToDisk() error {
	// Không cần thiết với Postgres
	return nil
}

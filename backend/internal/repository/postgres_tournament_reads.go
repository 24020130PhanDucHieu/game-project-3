package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// Always validate against PostgreSQL. Only unchanged JSON bodies are reused;
// no TTL can make authorization or a read-modify-write use stale state.
// xmin also catches updates from another writer which did not set updated_at.
const tournamentVersion = `t.xmin::text || ':' || COALESCE(t.updated_at::text, '')`

func (r *PostgresTournamentRepository) readAllVersioned() (map[string]interface{}, error) {
	r.readMu.Lock()
	defer r.readMu.Unlock()
	r.mu.RLock()
	generation := r.cacheGeneration
	known := make(map[string]string, len(r.versions))
	cached := make(map[string]map[string]interface{}, len(r.cache))
	for id, data := range r.cache {
		cached[id] = data
		if version := r.versions[id]; version != "" {
			known[id] = version
		}
	}
	r.mu.RUnlock()
	encoded, err := json.Marshal(known)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	rows, err := r.db.QueryContext(ctx, `SELECT t.id, `+tournamentVersion+`,
	CASE WHEN known.value = (`+tournamentVersion+`) THEN NULL ELSE t.data END
	FROM tournaments t LEFT JOIN jsonb_each_text($1::jsonb) AS known ON known.key=t.id`, string(encoded))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	next := make(map[string]map[string]interface{})
	versions := make(map[string]string)
	for rows.Next() {
		var id, version string
		var raw []byte
		if err := rows.Scan(&id, &version, &raw); err != nil {
			return nil, err
		}
		var data map[string]interface{}
		if raw != nil {
			if err := json.Unmarshal(raw, &data); err != nil {
				return nil, err
			}
		} else if cached[id] == nil || known[id] != version {
			return nil, fmt.Errorf("missing cached tournament %s", id)
		} else {
			data = cached[id]
		}
		if data == nil {
			return nil, fmt.Errorf("invalid tournament %s", id)
		}
		next[id], versions[id] = data, version
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	r.mu.Lock()
	// A concurrent Save/Delete must not be overwritten by an older read.
	if r.cacheGeneration == generation {
		r.cache, r.versions = next, versions
	}
	r.mu.Unlock()
	result := make(map[string]interface{}, len(next))
	for id, data := range next {
		result[id] = cloneTournament(data)
	}
	return result, nil
}

func (r *PostgresTournamentRepository) GetByID(id string) (map[string]interface{}, bool, error) {
	r.readMu.Lock()
	defer r.readMu.Unlock()
	r.mu.RLock()
	generation, cached, known := r.cacheGeneration, r.cache[id], r.versions[id]
	r.mu.RUnlock()
	if cached == nil {
		known = ""
	}
	var raw []byte
	var version string
	var err error
	for attempt := 0; attempt < 2; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		err = r.db.QueryRowContext(ctx, `SELECT `+tournamentVersion+`,
		CASE WHEN (`+tournamentVersion+`) = $2 THEN NULL ELSE t.data END
		FROM tournaments t WHERE t.id = $1`, id, known).Scan(&version, &raw)
		cancel()
		if err == nil || err == sql.ErrNoRows {
			break
		}
	}
	if err == sql.ErrNoRows {
		r.mu.Lock()
		if r.cacheGeneration == generation {
			delete(r.cache, id)
			delete(r.versions, id)
		}
		r.mu.Unlock()
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("cannot read tournament: %w", err)
	}
	var data map[string]interface{}
	if raw != nil {
		if err := json.Unmarshal(raw, &data); err != nil {
			return nil, false, fmt.Errorf("invalid tournament: %w", err)
		}
	} else if cached != nil && known == version {
		data = cloneTournament(cached)
	}
	if data == nil {
		return nil, false, fmt.Errorf("missing tournament payload %s", id)
	}
	data["tournament_id"] = id
	r.mu.Lock()
	if r.cacheGeneration == generation {
		if r.versions == nil {
			r.versions = make(map[string]string)
		}
		r.cache[id], r.versions[id] = data, version
	}
	r.mu.Unlock()
	return cloneTournament(data), true, nil
}

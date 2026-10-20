package repository

import (
	"context"
	"encoding/json"
	"sort"
	"strings"
	"time"
)

// ReadyValidations returns a bounded FIFO page, never source code or completed
// history. Deferred retries cannot block newly received submissions.
func (s *QualifierRecords) ReadyValidations(at float64, limit int) (map[string]json.RawMessage, error) {
	if limit < 1 {
		limit = 1
	}
	if limit > 128 {
		limit = 128
	}
	if s.db != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		rows, err := s.db.QueryContext(ctx, `SELECT key,data FROM arena_qualifier_records
			WHERE key LIKE 'validation:%' AND data->>'status'='QUEUED'
			AND COALESCE((data->>'retry_at')::double precision,0) <= $1
			ORDER BY (data->>'at')::double precision,key LIMIT $2`, at, limit)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		result := map[string]json.RawMessage{}
		for rows.Next() {
			var key string
			var raw json.RawMessage
			if err := rows.Scan(&key, &raw); err != nil {
				return nil, err
			}
			result[key] = raw
		}
		return result, rows.Err()
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.failed != nil {
		return nil, s.failed
	}
	type entry struct {
		key string
		at  float64
	}
	ready := []entry{}
	for key, raw := range s.items {
		if !strings.HasPrefix(key, "validation:") {
			continue
		}
		var task struct {
			Status  string  `json:"status"`
			At      float64 `json:"at"`
			RetryAt float64 `json:"retry_at"`
		}
		if err := json.Unmarshal(raw, &task); err != nil {
			return nil, err
		}
		if task.Status == "QUEUED" && task.RetryAt <= at {
			ready = append(ready, entry{key, task.At})
		}
	}
	sort.Slice(ready, func(i, j int) bool {
		if ready[i].at == ready[j].at {
			return ready[i].key < ready[j].key
		}
		return ready[i].at < ready[j].at
	})
	result := map[string]json.RawMessage{}
	for _, item := range ready[:min(limit, len(ready))] {
		result[item.key] = append(json.RawMessage(nil), s.items[item.key]...)
	}
	return result, nil
}

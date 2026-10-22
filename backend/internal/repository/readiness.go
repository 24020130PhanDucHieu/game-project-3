package repository

import (
	"context"
	"encoding/json"
	"os"
)

// Pending avoids loading completed submissions and source code on every poll.
func (s *QualifierRecords) Pending(prefix string) (map[string]json.RawMessage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := map[string]json.RawMessage{}
	if s.failed != nil {
		return nil, s.failed
	}
	if s.db != nil {
		rows, err := s.db.Query(`SELECT key,data FROM arena_qualifier_records WHERE key LIKE $1 AND data->>'status' = 'QUEUED'`, prefix+"%")
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		for rows.Next() {
			var key string
			var raw json.RawMessage
			if err = rows.Scan(&key, &raw); err != nil {
				return nil, err
			}
			out[key] = raw
		}
		return out, rows.Err()
	}
	for key, raw := range s.items {
		if len(key) < len(prefix) || key[:len(prefix)] != prefix {
			continue
		}
		var status struct {
			Status string `json:"status"`
		}
		if err := json.Unmarshal(raw, &status); err != nil {
			return nil, err
		}
		if status.Status == "QUEUED" {
			out[key] = append(json.RawMessage(nil), raw...)
		}
	}
	return out, nil
}

func (s *QualifierRecords) Ready(ctx context.Context) error {
	// PostgreSQL pool is immutable after construction; do not wait on storage
	// mutex before the bounded network probe.
	if s.db != nil {
		return s.db.PingContext(ctx)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.failed != nil {
		if _, statErr := os.Stat(s.dir); statErr == nil {
			s.failed = nil
		} else {
			return s.failed
		}
	}
	_, err := os.Stat(s.dir)
	return err
}

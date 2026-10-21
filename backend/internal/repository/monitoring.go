package repository

import (
	"context"
	"encoding/json"
	"strings"
)

// QueueCounts returns only aggregate metadata, never student source code.
func (s *QualifierRecords) QueueCounts(ctx context.Context) (map[string]int, error) {
	counts := map[string]int{"validation_QUEUED": 0, "validation_RUNNING": 0, "validation_FAILED": 0, "job_QUEUED": 0, "job_RUNNING": 0, "job_FAILED": 0}
	if s.db != nil {
		rows, err := s.db.QueryContext(ctx, `SELECT split_part(key,':',1),data->>'status',count(*) FROM arena_qualifier_records WHERE (key LIKE 'validation:%' OR key LIKE 'job:%') AND data->>'status' IN ('QUEUED','PENDING','RUNNING','FAILED','ERROR') GROUP BY 1,2`)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		for rows.Next() {
			var kind, status string
			var n int
			if err = rows.Scan(&kind, &status, &n); err != nil {
				return nil, err
			}
			if status == "PENDING" {status = "QUEUED"}; if status == "ERROR" {status = "FAILED"}
			counts[kind+"_"+status] += n
		}
		return counts, rows.Err()
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.failed != nil {
		return nil, s.failed
	}
	for key, raw := range s.items {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		kind, _, _ := strings.Cut(key, ":")
		if kind != "validation" && kind != "job" {
			continue
		}
		var item struct {
			Status string `json:"status"`
		}
		if err := json.Unmarshal(raw, &item); err != nil {
			return nil, err
		}
		if item.Status == "PENDING" {item.Status = "QUEUED"}; if item.Status == "ERROR" {item.Status = "FAILED"}
		if item.Status == "QUEUED" || item.Status == "RUNNING" || item.Status == "FAILED" {
			counts[kind+"_"+item.Status]++
		}
	}
	return counts, nil
}

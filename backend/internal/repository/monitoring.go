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
			if status == "PENDING" {
				status = "QUEUED"
			}
			if status == "ERROR" {
				status = "FAILED"
			}
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
		if item.Status == "PENDING" {
			item.Status = "QUEUED"
		}
		if item.Status == "ERROR" {
			item.Status = "FAILED"
		}
		if item.Status == "QUEUED" || item.Status == "RUNNING" || item.Status == "FAILED" {
			counts[kind+"_"+item.Status]++
		}
	}
	return counts, nil
}

// DatabaseStats reports measured values. Query failures must never become sample data.
func (s *QualifierRecords) DatabaseStats(ctx context.Context) (map[string]interface{}, error) {
	if s.db == nil {
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.failed != nil {
			return nil, s.failed
		}
		return map[string]interface{}{"provider": "Local File Storage", "record_count": len(s.items)}, nil
	}
	var size, tables string
	var bytes int64
	var records, connections int
	err := s.db.QueryRowContext(ctx, `SELECT pg_size_pretty(pg_database_size(current_database())), pg_database_size(current_database()),
 (SELECT pg_size_pretty(COALESCE(sum(pg_total_relation_size(c.oid)),0)::bigint) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relname IN ('arena_qualifier_records','tournaments','arena_accounts')),
 (SELECT count(*) FROM arena_qualifier_records),
 (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND state='active')`).Scan(&size, &bytes, &tables, &records, &connections)
	if err != nil {
		return nil, err
	}
	pool := s.db.Stats()
	return map[string]interface{}{"provider": "PostgreSQL", "db_size": size, "db_bytes": bytes, "tables_size": tables, "record_count": records, "active_connections": connections, "pool_open": pool.OpenConnections, "pool_in_use": pool.InUse, "pool_idle": pool.Idle, "pool_max_open": pool.MaxOpenConnections}, nil
}

// ANALYZE refreshes planner statistics; it does not reclaim disk or rebuild indexes.
func (s *QualifierRecords) OptimizeDatabase(ctx context.Context) (string, error) {
	if s.db == nil {
		return "Kho lưu trữ tệp không cần ANALYZE.", nil
	}
	if _, err := s.db.ExecContext(ctx, `ANALYZE arena_qualifier_records`); err != nil {
		return "", err
	}
	return "Đã cập nhật thống kê truy vấn. Thao tác này không thu hồi dung lượng ổ đĩa.", nil
}

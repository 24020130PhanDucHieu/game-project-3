package repository

import (
	"context"
	"encoding/json"
	"strings"
	"time"
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
	s.monitorMu.Lock()
	defer s.monitorMu.Unlock()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if s.monitorData != nil && time.Since(s.monitorAt) < time.Minute {
		return copyMonitorStats(s.monitorData), nil
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
	data := map[string]interface{}{"provider": "PostgreSQL", "db_size": size, "db_bytes": bytes, "tables_size": tables, "record_count": records, "active_connections": connections, "pool_open": pool.OpenConnections, "pool_in_use": pool.InUse, "pool_idle": pool.Idle, "pool_max_open": pool.MaxOpenConnections}
	var tableJSON []byte
	err = s.db.QueryRowContext(ctx, databaseTableStatsSQL).Scan(&tableJSON)
	if err != nil {
		return nil, err
	}
	var details []map[string]interface{}
	if err = json.Unmarshal(tableJSON, &details); err != nil {
		return nil, err
	}
	data["tables"] = details
	data["source"] = "PostgreSQL system catalogs"
	data["sampled_at"] = time.Now().UTC().Format(time.RFC3339)
	data["refresh_seconds"] = 60
	// PostgreSQL counters do not measure the provider's billable network usage.
	data["billing_usage_status"] = "UNAVAILABLE"
	s.monitorData, s.monitorAt = data, time.Now()
	return copyMonitorStats(data), nil
}

func copyMonitorStats(data map[string]interface{}) map[string]interface{} {
	result := make(map[string]interface{}, len(data))
	for key, value := range data {
		result[key] = value
	}
	return result
}

// Catalog metadata only: never fetch JSON documents, bot code or account records.
const databaseTableStatsSQL = `SELECT COALESCE(json_agg(t ORDER BY t.total_bytes DESC), '[]'::json) FROM (
 SELECT s.relname AS name, pg_total_relation_size(s.relid) AS total_bytes,
 pg_indexes_size(s.relid) AS index_bytes, s.n_live_tup AS estimated_rows,
 s.n_dead_tup AS estimated_dead_rows, s.seq_scan, s.idx_scan,
 GREATEST(s.last_analyze,s.last_autoanalyze) AS last_analyzed,
 GREATEST(s.last_vacuum,s.last_autovacuum) AS last_vacuumed,
 c.relrowsecurity AS rls_enabled,
 (SELECT count(*) FROM pg_index i WHERE i.indrelid=s.relid AND i.indisvalid) AS index_count
 FROM pg_stat_user_tables s JOIN pg_class c ON c.oid=s.relid
 WHERE s.schemaname='public' AND (s.relname='tournaments' OR left(s.relname,6)='arena_')
) t`

// ANALYZE refreshes planner statistics; it does not reclaim disk or rebuild indexes.
func (s *QualifierRecords) OptimizeDatabase(ctx context.Context) (string, error) {
	if s.db == nil {
		return "Kho lưu trữ tệp không cần ANALYZE.", nil
	}
	if _, err := s.db.ExecContext(ctx, `ANALYZE public.arena_accounts, public.arena_admin_audit_logs, public.arena_gateway_lease, public.arena_notification_reads, public.arena_notifications, public.arena_password_audit_logs, public.arena_password_resets, public.arena_qualifier_records, public.arena_team_profiles, public.tournaments`); err != nil {
		return "", err
	}
	s.monitorMu.Lock()
	s.monitorData = nil
	s.monitorMu.Unlock()
	return "Đã cập nhật thống kê cho 10 bảng ứng dụng. Thao tác này không thu hồi dung lượng ổ đĩa.", nil
}

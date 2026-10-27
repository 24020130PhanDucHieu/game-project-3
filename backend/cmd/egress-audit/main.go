// Read-only egress diagnostics: aggregate sizes and query counts, never row data or credentials.
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	_ "github.com/lib/pq"
)

func main() {
	pid := flag.Int("pid", 0, "read the Linux gateway process environment")
	flag.Parse()
	values := os.Environ()
	if *pid > 0 {
		raw, err := os.ReadFile("/proc/" + strconv.Itoa(*pid) + "/environ")
		if err != nil {
			fail("cannot read gateway environment")
		}
		values = strings.Split(string(raw), "\x00")
	}
	env := map[string]string{}
	for _, entry := range values {
		if k, v, ok := strings.Cut(entry, "="); ok {
			env[k] = v
		}
	}
	dsn := env["DATABASE_URL"]
	if dsn == "" {
		dsn = env["POSTGRES_URL"]
	}
	if dsn == "" {
		dsn = env["NEON_DATABASE_URL"]
	}
	if dsn == "" {
		fail("no PostgreSQL configuration")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		fail("cannot configure database connection")
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	tx, err := db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		fail("cannot connect to database")
	}
	defer tx.Rollback()
	var count, bytes int64
	if tx.QueryRowContext(ctx, `SELECT count(*), COALESCE(sum(octet_length(data::text)),0) FROM tournaments`).Scan(&count, &bytes) != nil {
		fail("cannot measure tournaments")
	}
	report := map[string]interface{}{"measured_at": time.Now().UTC(), "tournaments": count, "tournament_json_bytes": bytes, "full_scan_every_second_bytes_per_day": bytes * 86400}
	// Validate the projected timer against real PostgreSQL without changing state.
	var due int
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM tournaments t
	CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(t.data->'matches')='object' THEN t.data->'matches' ELSE '{}'::jsonb END) m
	WHERE m.value->>'round_status'='ROUND_FINISHED'
	AND CASE WHEN jsonb_typeof(m.value->'intermission_ends_at')='number' THEN (m.value->>'intermission_ends_at')::numeric ELSE 0 END > 0
	AND CASE WHEN jsonb_typeof(m.value->'intermission_ends_at')='number' THEN (m.value->>'intermission_ends_at')::numeric ELSE 0 END <= $1`, float64(time.Now().UnixMilli())/1000).Scan(&due); err != nil {
		fail("cannot validate round transition projection")
	}
	report["due_round_transitions"] = due
	var runningMatches, runningJobs int
	if tx.QueryRowContext(ctx, `SELECT count(*) FROM tournaments t CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(t.data->'matches')='object' THEN t.data->'matches' ELSE '{}'::jsonb END) m WHERE m.value->>'round_status'='BATTLE_RUNNING'`).Scan(&runningMatches) != nil {
		fail("cannot inspect running matches")
	}
	if tx.QueryRowContext(ctx, `SELECT count(*) FROM arena_qualifier_records WHERE (key LIKE 'event:%' OR key LIKE 'job:%' OR key LIKE 'validation:%') AND data->>'status'='RUNNING'`).Scan(&runningJobs) != nil {
		fail("cannot inspect running jobs")
	}
	report["running_matches"], report["running_jobs"] = runningMatches, runningJobs
	// Match the new read protocol: send known revisions and receive NULL for
	// unchanged bodies. Only lengths/counts leave this diagnostic.
	const version = `t.xmin::text || ':' || COALESCE(t.updated_at::text, '')`
	var known string
	if tx.QueryRowContext(ctx, `SELECT COALESCE(jsonb_object_agg(t.id, `+version+`), '{}'::jsonb)::text FROM tournaments t`).Scan(&known) != nil {
		fail("cannot read revisions")
	}
	var metadataBytes, unchangedBodyBytes int64
	if tx.QueryRowContext(ctx, `SELECT COALESCE(sum(octet_length(t.id)+octet_length(`+version+`)),0),
	COALESCE(sum(octet_length((CASE WHEN known.value=(`+version+`) THEN NULL ELSE t.data END)::text)),0)
	FROM tournaments t LEFT JOIN jsonb_each_text($1::jsonb) AS known ON known.key=t.id`, known).Scan(&metadataBytes, &unchangedBodyBytes) != nil {
		fail("cannot validate revision projection")
	}
	report["version_metadata_bytes_per_scan"], report["unchanged_json_bytes_per_scan"] = metadataBytes, unchangedBodyBytes
	rows, err := tx.QueryContext(ctx, `SELECT queryid::text, calls, rows, total_exec_time,
	CASE WHEN query LIKE 'SELECT id, data FROM tournaments%' THEN 'tournament_full_scan'
	WHEN query LIKE 'SELECT data FROM tournaments WHERE id%' THEN 'tournament_full_read'
	WHEN query LIKE '%arena_qualifier_records%' THEN 'qualifier_read'
	ELSE 'other_tournament_read' END
	FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database())
	AND query LIKE 'SELECT%' AND (query LIKE '%FROM tournaments%' OR query LIKE '%FROM arena_qualifier_records%')
	ORDER BY calls DESC LIMIT 20`)
	if err != nil {
		report["query_statistics"] = "unavailable"
	} else {
		stats := []map[string]interface{}{}
		for rows.Next() {
			var id, kind string
			var calls, returned int64
			var ms float64
			if rows.Scan(&id, &calls, &returned, &ms, &kind) != nil {
				fail("cannot decode query statistics")
			}
			stats = append(stats, map[string]interface{}{"query_id": id, "kind": kind, "calls": calls, "rows": returned, "total_ms": ms})
		}
		if rows.Err() != nil {
			fail("cannot read query statistics")
		}
		rows.Close()
		report["query_statistics"] = stats
	}
	out := json.NewEncoder(os.Stdout)
	out.SetIndent("", "  ")
	out.Encode(report)
}
func fail(message string) { fmt.Fprintln(os.Stderr, message); os.Exit(1) }

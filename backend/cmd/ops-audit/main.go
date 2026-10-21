// Read-only production audit. Reports counts, never keys, source or passwords.
package main

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
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
	pid := flag.Int("pid", 0, "read effective environment of Linux gateway process (requires same user/root)")
	flag.Parse()
	env := map[string]string{}
	values := os.Environ()
	if *pid > 0 {
		raw, err := os.ReadFile("/proc/" + strconv.Itoa(*pid) + "/environ")
		if err != nil {
			fail("cannot read gateway environment")
		}
		values = strings.Split(string(raw), "\x00")
	}
	for _, entry := range values {
		if key, value, ok := strings.Cut(entry, "="); ok {
			env[key] = value
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
		fail("gateway has no PostgreSQL configuration")
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
	report := map[string]interface{}{}
	workers := env["WORKER_URLS"]
	if workers == "" {
		workers = env["WORKER_URL"]
	}
	count := 0
	for _, v := range strings.Split(workers, ",") {
		if strings.TrimSpace(v) != "" {
			count++
		}
	}
	if count == 0 {
		count = 1
	}
	report["configured_worker_endpoints"] = count
	report["worker_token_configured"] = env["WORKER_TOKEN"] != ""
	report["worker_release_check_configured"] = env["WORKER_RELEASE"] != ""
	report["judge_concurrency"] = env["JUDGE_CONCURRENCY"]
	report["validation_workers"] = env["VALIDATION_WORKERS"]
	selected := ""
	ciphers := map[string]cipher.AEAD{}
	for _, name := range []string{"ACCOUNT_ENCRYPTION_KEY", "SESSION_SECRET", "ADMIN_PASSWORD"} {
		if env[name] == "" {
			continue
		}
		if selected == "" {
			selected = name
		}
		key := sha256.Sum256([]byte("arena-account-v1:" + env[name]))
		block, _ := aes.NewCipher(key[:])
		ciphers[name], _ = cipher.NewGCM(block)
	}
	report["selected_account_key_variable"] = selected
	matches := map[string]int{}
	for name := range ciphers {
		matches[name] = 0
	}
	total, active, unreadable, invalidEncoding := 0, 0, 0, 0
	rows, err := tx.QueryContext(ctx, `SELECT student_id,data->>'password_encrypted',COALESCE((data->>'deleted')::boolean,false) FROM arena_accounts`)
	if err != nil {
		fail("cannot read accounts")
	}
	for rows.Next() {
		var sid string
		var encoded sql.NullString
		var deleted bool
		if rows.Scan(&sid, &encoded, &deleted) != nil {
			fail("cannot decode account record")
		}
		total++
		if deleted {
			continue
		}
		active++
		raw, decodeErr := base64.StdEncoding.DecodeString(encoded.String)
		selectedOK := false
		if decodeErr != nil || len(raw) < 12 {
			invalidEncoding++
		}
		for name, c := range ciphers {
			if decodeErr != nil || len(raw) < c.NonceSize() {
				continue
			}
			clear, openErr := c.Open(nil, raw[:c.NonceSize()], raw[c.NonceSize():], []byte(sid))
			if openErr == nil {
				matches[name]++
				if name == selected {
					selectedOK = true
				}
			}
			for i := range clear {
				clear[i] = 0
			}
		}
		if !selectedOK {
			unreadable++
		}
	}
	if rows.Err() != nil {
		fail("account scan failed")
	}
	rows.Close()
	report["accounts_total"] = total
	report["accounts_active"] = active
	report["accounts_unreadable_with_selected_key"] = unreadable
	report["accounts_bad_ciphertext_encoding"] = invalidEncoding
	report["accounts_decryptable_by_variable"] = matches
	var size int64
	if tx.QueryRowContext(ctx, "SELECT pg_database_size(current_database())").Scan(&size) != nil {
		fail("cannot measure database")
	}
	report["database_bytes"] = size
	rows, err = tx.QueryContext(ctx, "SELECT relname,n_live_tup,pg_total_relation_size(relid) FROM pg_stat_user_tables WHERE relname LIKE 'arena_%' OR relname='tournaments' ORDER BY relname")
	if err != nil {
		fail("cannot inspect table sizes")
	}
	tables := []map[string]interface{}{}
	for rows.Next() {
		var name string
		var estimated, bytes int64
		if rows.Scan(&name, &estimated, &bytes) != nil {
			fail("cannot read table stats")
		}
		tables = append(tables, map[string]interface{}{"table": name, "estimated_rows": estimated, "bytes": bytes})
	}
	if rows.Err() != nil {
		fail("table scan failed")
	}
	rows.Close()
	report["tables"] = tables
	rows, err = tx.QueryContext(ctx, "SELECT split_part(key,':',1),count(*),sum(octet_length(data::text)) FROM arena_qualifier_records GROUP BY 1 ORDER BY 1")
	if err != nil {
		fail("cannot inspect record distribution")
	}
	records := []map[string]interface{}{}
	for rows.Next() {
		var kind string
		var count, bytes int64
		if rows.Scan(&kind, &count, &bytes) != nil {
			fail("cannot read record distribution")
		}
		records = append(records, map[string]interface{}{"kind": kind, "rows": count, "json_bytes": bytes})
	}
	if rows.Err() != nil {
		fail("record scan failed")
	}
	rows.Close()
	report["record_groups"] = records
	var running int
	if tx.QueryRowContext(ctx, "SELECT count(*) FROM arena_qualifier_records WHERE (key LIKE 'event:%' OR key LIKE 'job:%') AND data->>'status'='RUNNING'").Scan(&running) != nil {
		fail("cannot inspect active jobs")
	}
	report["running_qualifier_events_and_jobs"] = running
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	encoder.Encode(report)
}

func fail(message string) { fmt.Fprintln(os.Stderr, message); os.Exit(1) }

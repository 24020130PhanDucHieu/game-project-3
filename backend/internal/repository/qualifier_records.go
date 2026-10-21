package repository

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/lib/pq"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Separate records keep source code and job results out of tournament snapshots.
// Local batches use a write-ahead journal; PostgreSQL batches use a transaction.
type QualifierRecords struct {
	mu     sync.Mutex
	db     *sql.DB
	dir    string
	items  map[string]json.RawMessage
	failed error
	views  map[string]qualifierView
}
type qualifierView struct {
	prefix  string
	expires time.Time
	rows    map[string]json.RawMessage
	size    int
}

func cloneQualifierRows(rows map[string]json.RawMessage) map[string]json.RawMessage {
	result := make(map[string]json.RawMessage, len(rows))
	for key, raw := range rows {
		result[key] = append(json.RawMessage(nil), raw...)
	}
	return result
}

type recordFile struct {
	Key  string          `json:"key"`
	Data json.RawMessage `json:"data"`
}

func NewQualifierRecords(repo TournamentRepository, dir string) (*QualifierRecords, error) {
	s := &QualifierRecords{dir: dir, items: map[string]json.RawMessage{}}
	if pg, ok := repo.(*PostgresTournamentRepository); ok {
		s.db = pg.db
		_, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS arena_qualifier_records (key TEXT PRIMARY KEY, data JSONB NOT NULL); ALTER TABLE arena_qualifier_records ENABLE ROW LEVEL SECURITY`)
		if err == nil {
			_, err = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_qualifier_prefix ON arena_qualifier_records(key text_pattern_ops); CREATE INDEX IF NOT EXISTS idx_qualifier_job_a ON arena_qualifier_records ((data->>'a')); CREATE INDEX IF NOT EXISTS idx_qualifier_job_b ON arena_qualifier_records ((data->>'b'))`)
		}
		if err == nil {
			_, err = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_validation_ready ON arena_qualifier_records (((data->>'at')::double precision),key) WHERE key LIKE 'validation:%' AND data->>'status'='QUEUED'`)
		}
		return s, err
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	files, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	for _, file := range files {
		if !strings.HasSuffix(file.Name(), ".record") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, file.Name()))
		if err != nil {
			return nil, err
		}
		var row recordFile
		if err = json.Unmarshal(raw, &row); err != nil {
			return nil, err
		}
		s.items[row.Key] = row.Data
	}
	raw, err := os.ReadFile(filepath.Join(dir, "journal.json"))
	if err == nil {
		var journal map[string]json.RawMessage
		if err = json.Unmarshal(raw, &journal); err != nil {
			return nil, err
		}
		if err = s.localBatch(journal); err != nil {
			return nil, err
		}
	} else if !os.IsNotExist(err) {
		return nil, err
	}
	return s, nil
}

func (s *QualifierRecords) Get(key string, target interface{}) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	var raw []byte
	if s.db != nil {
		if err := s.db.QueryRow(`SELECT data FROM arena_qualifier_records WHERE key=$1`, key).Scan(&raw); err != nil {
			return err
		}
	} else {
		var ok bool
		raw, ok = s.items[key]
		if !ok {
			return sql.ErrNoRows
		}
	}
	return json.Unmarshal(raw, target)
}
func (s *QualifierRecords) List(prefix string) (map[string]json.RawMessage, error) {
	return s.list(prefix, false, "")
}

// ListMetadata projects source code out inside PostgreSQL, before network transfer.
// studentID restricts job results to the requesting team.
func (s *QualifierRecords) ListMetadata(prefix, studentID string) (map[string]json.RawMessage, error) {
	return s.list(prefix, true, studentID)
}

func (s *QualifierRecords) list(prefix string, metadata bool, studentID string) (map[string]json.RawMessage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	cacheKey := prefix + "\x00" + studentID
	if metadata {
		if view, ok := s.views[cacheKey]; ok && time.Now().Before(view.expires) {
			return cloneQualifierRows(view.rows), nil
		}
	}
	cacheResult := func(rows map[string]json.RawMessage, err error) (map[string]json.RawMessage, error) {
		if err != nil {
			return nil, err
		}
		if metadata {
			size := 0
			for key, raw := range rows {
				size += len(key) + len(raw)
			}
			if size <= 4*1024*1024 {
				if s.views == nil {
					s.views = map[string]qualifierView{}
				}
				total := size
				for key, view := range s.views {
					if time.Now().After(view.expires) {
						delete(s.views, key)
					} else {
						total += view.size
					}
				}
				if total > 16*1024*1024 || len(s.views) >= 128 {
					s.views = map[string]qualifierView{}
				}
				s.views[cacheKey] = qualifierView{prefix, time.Now().Add(5 * time.Second), cloneQualifierRows(rows), size}
			}
		}
		return rows, nil
	}
	result := map[string]json.RawMessage{}
	if s.db != nil {
		projection := "data"
		if metadata {
			projection = "data - 'code'"
		}
		query := "SELECT key," + projection + " FROM arena_qualifier_records WHERE key LIKE $1"
		pattern := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(prefix) + "%"
		args := []interface{}{pattern}
		if studentID != "" {
			query += " AND (data->>'a'=$2 OR data->>'b'=$2)"
			args = append(args, studentID)
		}
		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()
		rows, err := s.db.QueryContext(ctx, query, args...)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		for rows.Next() {
			var key string
			var raw []byte
			if err = rows.Scan(&key, &raw); err != nil {
				return nil, err
			}
			result[key] = raw
		}
		return cacheResult(result, rows.Err())
	}
	for key, raw := range s.items {
		if strings.HasPrefix(key, prefix) {
			if metadata {
				var value map[string]json.RawMessage
				if err := json.Unmarshal(raw, &value); err != nil {
					return nil, err
				}
				if studentID != "" {
					var a, b string
					json.Unmarshal(value["a"], &a)
					json.Unmarshal(value["b"], &b)
					if a != studentID && b != studentID {
						continue
					}
				}
				delete(value, "code")
				var err error
				raw, err = json.Marshal(value)
				if err != nil {
					return nil, err
				}
			}
			result[key] = append(json.RawMessage(nil), raw...)
		}
	}
	return cacheResult(result, nil)
}
func (s *QualifierRecords) Batch(values map[string]interface{}) error {
	return s.batch(values, false)
}

// BatchPreservingParticipantCode updates standings without transferring every
// entrant's source out of PostgreSQL and back on every pairing round.
func (s *QualifierRecords) BatchPreservingParticipantCode(values map[string]interface{}) error {
	return s.batch(values, true)
}

func (s *QualifierRecords) batch(values map[string]interface{}, preserveCode bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Invalidate before writing: an uncertain commit must never leave stale views.
	for cacheKey, view := range s.views {
		for key := range values {
			if strings.HasPrefix(key, view.prefix) {
				delete(s.views, cacheKey)
				break
			}
		}
	}
	if s.failed != nil {
		return s.failed
	}
	rows := map[string]json.RawMessage{}
	for key, value := range values {
		raw, err := json.Marshal(value)
		if err != nil {
			return err
		}
		rows[key] = raw
		if preserveCode && s.db == nil && strings.HasPrefix(key, "participant:") {
			var prior, update map[string]json.RawMessage
			if old, ok := s.items[key]; ok {
				if err := json.Unmarshal(old, &prior); err != nil {
					return err
				}
				if code, ok := prior["code"]; ok {
					if err := json.Unmarshal(raw, &update); err != nil {
						return err
					}
					update["code"] = code
					rows[key], err = json.Marshal(update)
					if err != nil {
						return err
					}
				}
			}
		}
	}
	if s.db != nil {
		tx, err := s.db.Begin()
		if err != nil {
			return err
		}
		defer tx.Rollback()
		keys := make([]string, 0, len(rows))
		values := make([]string, 0, len(rows))
		for key, raw := range rows {
			keys = append(keys, key)
			values = append(values, string(raw))
		}
		update := "EXCLUDED.data"
		if preserveCode {
			update += ` || CASE WHEN arena_qualifier_records.key LIKE 'participant:%' AND arena_qualifier_records.data ? 'code' THEN jsonb_build_object('code',arena_qualifier_records.data->'code') ELSE '{}'::jsonb END`
		}
		if _, err = tx.Exec(`INSERT INTO arena_qualifier_records(key,data) SELECT entry.key,entry.data::jsonb FROM unnest($1::text[],$2::text[]) AS entry(key,data) ON CONFLICT(key) DO UPDATE SET data=`+update, pq.Array(keys), pq.Array(values)); err != nil {
			return err
		}
		return tx.Commit()
	}
	raw, err := json.Marshal(rows)
	if err != nil {
		return err
	}
	if err = atomicQualifierFile(filepath.Join(s.dir, "journal.json"), raw); err != nil {
		return err
	}
	if err = s.localBatch(rows); err != nil {
		s.failed = err
	}
	return err
}
func (s *QualifierRecords) localBatch(rows map[string]json.RawMessage) error {
	for key, raw := range rows {
		sum := sha256.Sum256([]byte(key))
		file := filepath.Join(s.dir, hex.EncodeToString(sum[:])+".record")
		data, err := json.Marshal(recordFile{key, raw})
		if err != nil {
			return err
		}
		if err = atomicQualifierFile(file, data); err != nil {
			return err
		}
	}
	for key, raw := range rows {
		s.items[key] = raw
	}
	return os.Remove(filepath.Join(s.dir, "journal.json"))
}
func atomicQualifierFile(path string, data []byte) error {
	f, err := os.CreateTemp(filepath.Dir(path), ".qualifier-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if _, err = f.Write(data); err != nil {
		f.Close()
		return err
	}
	if err = f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	return os.Rename(f.Name(), path)
}
func (s *QualifierRecords) Lease(id string) (func(), error) {
	if s.db == nil {
		return func() {}, nil
	}
	conn, err := s.db.Conn(context.Background())
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256([]byte("qualifier:" + id))
	key := int64(binary.BigEndian.Uint64(sum[:8]))
	var acquired bool
	if err = conn.QueryRowContext(context.Background(), `SELECT pg_try_advisory_lock($1)`, key).Scan(&acquired); err != nil || !acquired {
		conn.Close()
		if err != nil {
			return nil, err
		}
		return nil, errors.New("Vòng loại đang được điều phối trên máy chủ khác.")
	}
	return func() { conn.ExecContext(context.Background(), `SELECT pg_advisory_unlock($1)`, key); conn.Close() }, nil
}

func (s *QualifierRecords) DeleteQualifier(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.views = map[string]qualifierView{}
	if s.failed != nil {
		return s.failed
	}
	if s.db != nil {
		_, err := s.db.Exec(`DELETE FROM arena_qualifier_records WHERE key=$1 OR key LIKE $2 OR key LIKE $3 OR key LIKE $4`,
			"event:"+id, "participant:"+id+":%", "submission:"+id+":%", "job:"+id+":%")
		return err
	}
	prefixes := []string{"event:" + id, "participant:" + id + ":", "submission:" + id + ":", "job:" + id + ":"}
	for key := range s.items {
		matches := false
		for _, prefix := range prefixes {
			if strings.HasPrefix(key, prefix) || key == "event:"+id {
				matches = true
				break
			}
		}
		if matches {
			delete(s.items, key)
			sum := sha256.Sum256([]byte(key))
			file := filepath.Join(s.dir, hex.EncodeToString(sum[:])+".record")
			_ = os.Remove(file)
		}
	}
	return nil
}

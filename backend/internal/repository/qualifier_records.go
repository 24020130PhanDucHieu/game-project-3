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
)

// Separate records keep source code and job results out of tournament snapshots.
// Local batches use a write-ahead journal; PostgreSQL batches use a transaction.
type QualifierRecords struct {
	mu     sync.Mutex
	db     *sql.DB
	dir    string
	items  map[string]json.RawMessage
	failed error
}
type recordFile struct {
	Key  string          `json:"key"`
	Data json.RawMessage `json:"data"`
}

func NewQualifierRecords(repo TournamentRepository, dir string) (*QualifierRecords, error) {
	s := &QualifierRecords{dir: dir, items: map[string]json.RawMessage{}}
	if pg, ok := repo.(*PostgresTournamentRepository); ok {
		s.db = pg.db
		_, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS arena_qualifier_records (key TEXT PRIMARY KEY, data JSONB NOT NULL)`)
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
	s.mu.Lock()
	defer s.mu.Unlock()
	result := map[string]json.RawMessage{}
	if s.db != nil {
		rows, err := s.db.Query(`SELECT key,data FROM arena_qualifier_records WHERE starts_with(key,$1)`, prefix)
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
		return result, rows.Err()
	}
	for key, raw := range s.items {
		if strings.HasPrefix(key, prefix) {
			result[key] = append(json.RawMessage(nil), raw...)
		}
	}
	return result, nil
}
func (s *QualifierRecords) Batch(values map[string]interface{}) error {
	s.mu.Lock()
	defer s.mu.Unlock()
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
		if _, err = tx.Exec(`INSERT INTO arena_qualifier_records(key,data) SELECT entry.key,entry.data::jsonb FROM unnest($1::text[],$2::text[]) AS entry(key,data) ON CONFLICT(key) DO UPDATE SET data=EXCLUDED.data`, pq.Array(keys), pq.Array(values)); err != nil {
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

package repository

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"io"
	"strconv"
	"strings"
	"sync"
	"testing"
)

type versionRow struct {
	version int
	raw     []byte
}
type versionDriver struct {
	mu               sync.Mutex
	rows             map[string]versionRow
	bytes            int
	fail             bool
	queries          []string
	started, release chan struct{}
}

func (d *versionDriver) Open(string) (driver.Conn, error) { return &versionConn{d}, nil }

type versionConn struct{ d *versionDriver }

func (c *versionConn) Close() error                        { return nil }
func (c *versionConn) Begin() (driver.Tx, error)           { return nil, errors.New("unsupported") }
func (c *versionConn) Prepare(string) (driver.Stmt, error) { return nil, errors.New("unsupported") }

type versionRows struct {
	cols   []string
	values [][]driver.Value
}

func (r *versionRows) Columns() []string { return r.cols }
func (r *versionRows) Close() error      { return nil }
func (r *versionRows) Next(v []driver.Value) error {
	if len(r.values) == 0 {
		return io.EOF
	}
	copy(v, r.values[0])
	r.values = r.values[1:]
	return nil
}
func (c *versionConn) QueryContext(_ context.Context, q string, args []driver.NamedValue) (driver.Rows, error) {
	d := c.d
	d.mu.Lock()
	d.queries = append(d.queries, q)
	if d.fail {
		d.mu.Unlock()
		return nil, errors.New("disconnected")
	}
	if strings.Contains(q, "CROSS JOIN LATERAL") {
		d.mu.Unlock()
		return &versionRows{[]string{"id", "key"}, [][]driver.Value{{"cup", "due-match"}}}, nil
	}
	all := strings.Contains(q, "jsonb_each_text")
	known := map[string]string{}
	cols := []string{"version", "data"}
	if all {
		json.Unmarshal([]byte(args[0].Value.(string)), &known)
		cols = []string{"id", "version", "data"}
	} else {
		known[args[0].Value.(string)] = args[1].Value.(string)
	}
	rows := &versionRows{cols: cols}
	for id, row := range d.rows {
		if !all && id != args[0].Value.(string) {
			continue
		}
		version := strconv.Itoa(row.version)
		var body driver.Value
		if known[id] != version {
			body = append([]byte(nil), row.raw...)
			d.bytes += len(row.raw)
		}
		values := []driver.Value{version, body}
		if all {
			values = append([]driver.Value{id}, values...)
		}
		rows.values = append(rows.values, values)
	}
	started, release := d.started, d.release
	d.started = nil
	d.mu.Unlock()
	if started != nil {
		close(started)
		<-release
	}
	return rows, nil
}
func (c *versionConn) ExecContext(_ context.Context, q string, args []driver.NamedValue) (driver.Result, error) {
	d := c.d
	d.mu.Lock()
	defer d.mu.Unlock()
	id := args[0].Value.(string)
	if strings.HasPrefix(q, "DELETE") {
		if _, ok := d.rows[id]; !ok {
			return driver.RowsAffected(0), nil
		}
		delete(d.rows, id)
	} else {
		row := d.rows[id]
		row.version++
		row.raw = append([]byte(nil), args[5].Value.([]byte)...)
		d.rows[id] = row
	}
	return driver.RowsAffected(1), nil
}
func versionRepo(t *testing.T) (*PostgresTournamentRepository, *versionDriver) {
	t.Helper()
	d := &versionDriver{rows: map[string]versionRow{"cup": {1, []byte(`{"name":"Original","matches":{},"source":"` + strings.Repeat("x", 100000) + `"}`)}}}
	sql.Register(t.Name(), d)
	db, err := sql.Open(t.Name(), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return &PostgresTournamentRepository{db: db, cache: map[string]map[string]interface{}{}}, d
}
func TestUnchangedTournamentPollingTransfersNoJSON(t *testing.T) {
	r, d := versionRepo(t)
	first := r.GetAll()
	initial := d.bytes
	first["cup"].(map[string]interface{})["name"] = "caller mutation"
	for i := 0; i < 20; i++ {
		if r.GetAll()["cup"].(map[string]interface{})["name"] != "Original" {
			t.Fatal("cache escaped")
		}
		got, found, err := r.GetByID("cup")
		if err != nil || !found || got["name"] != "Original" {
			t.Fatalf("read: %v", err)
		}
		got["name"] = "changed by caller"
	}
	if initial == 0 || d.bytes != initial {
		t.Fatalf("unchanged reads downloaded JSON: initial=%d now=%d", initial, d.bytes)
	}
	d.mu.Lock()
	d.rows["cup"] = versionRow{2, []byte(`{"name":"External","matches":{}}`)}
	d.mu.Unlock()
	got, _, err := r.GetByID("cup")
	if err != nil || got["name"] != "External" {
		t.Fatalf("external update not seen: %v", err)
	}
	if r.GetAll()["cup"].(map[string]interface{})["name"] != "External" {
		t.Fatal("all-read lost update")
	}
}
func TestVersionedReadsKeepFailureAndDeletionSemantics(t *testing.T) {
	r, d := versionRepo(t)
	r.GetAll()
	d.fail = true
	if _, _, err := r.GetByID("cup"); err == nil {
		t.Fatal("mutation read silently used stale cache")
	}
	if len(r.GetAll()) != 1 {
		t.Fatal("read-only fallback lost cache")
	}
	d.fail = false
	delete(d.rows, "cup")
	if _, found, err := r.GetByID("cup"); err != nil || found {
		t.Fatal("deleted row still returned")
	}
	if len(r.GetAll()) != 0 || len(r.cachedSnapshot()) != 0 {
		t.Fatal("deleted cache entry survived")
	}
}
func TestSaveInvalidatesVersionAndReadersCannotOverwriteIt(t *testing.T) {
	r, d := versionRepo(t)
	r.GetAll()
	d.started = make(chan struct{})
	d.release = make(chan struct{})
	started := d.started
	done := make(chan struct{})
	go func() { r.GetAll(); close(done) }()
	<-started
	if err := r.Save("cup", map[string]interface{}{"name": "Saved", "matches": map[string]interface{}{}}); err != nil {
		t.Fatal(err)
	}
	close(d.release)
	<-done
	if r.cachedSnapshot()["cup"].(map[string]interface{})["name"] != "Saved" {
		t.Fatal("in-flight read overwrote saved cache")
	}
	got, _, err := r.GetByID("cup")
	if err != nil || got["name"] != "Saved" {
		t.Fatal("save version not refreshed")
	}
	if err := r.Delete("cup"); err != nil {
		t.Fatal(err)
	}
	if len(r.cachedSnapshot()) != 0 {
		t.Fatal("delete left cache")
	}
}
func TestRoundTransitionProjectionAvoidsFullPayload(t *testing.T) {
	r, d := versionRepo(t)
	due, err := DueRoundTransitions(r, 100)
	if err != nil || len(due) != 1 || due[0].MatchID != "due-match" {
		t.Fatalf("due matches: %v %v", due, err)
	}
	if d.bytes != 0 || len(d.queries) != 1 || !strings.Contains(d.queries[0], "SELECT t.id, m.key") {
		t.Fatal("timer loaded full tournament")
	}
}
func TestLocalRoundTransitionDeadlines(t *testing.T) {
	r := NewJSONTournamentRepository(t.TempDir() + "/state.json")
	r.Save("cup", map[string]interface{}{"matches": map[string]interface{}{
		"due":     map[string]interface{}{"round_status": "ROUND_FINISHED", "intermission_ends_at": 100},
		"future":  map[string]interface{}{"round_status": "ROUND_FINISHED", "intermission_ends_at": 101},
		"unset":   map[string]interface{}{"round_status": "ROUND_FINISHED", "intermission_ends_at": 0},
		"running": map[string]interface{}{"round_status": "BATTLE_RUNNING", "intermission_ends_at": 50},
		"invalid": map[string]interface{}{"round_status": "ROUND_FINISHED", "intermission_ends_at": "oops"},
	}})
	due, err := DueRoundTransitions(r, 100)
	if err != nil || len(due) != 1 || due[0].MatchID != "due" {
		t.Fatalf("wrong deadline selection: %v %v", due, err)
	}
}

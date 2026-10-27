package repository

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"testing"
)

type readDriver struct {
	failures int
	calls    int
	missing  bool
}

func (d *readDriver) Open(string) (driver.Conn, error) { return &readConn{d}, nil }

type readConn struct{ d *readDriver }

func (c *readConn) Close() error                        { return nil }
func (c *readConn) Begin() (driver.Tx, error)           { return nil, errors.New("unsupported") }
func (c *readConn) Prepare(string) (driver.Stmt, error) { return nil, errors.New("unsupported") }
func (c *readConn) QueryContext(context.Context, string, []driver.NamedValue) (driver.Rows, error) {
	c.d.calls++
	if c.d.calls <= c.d.failures {
		return nil, errors.New("temporary database disconnect")
	}
	return &readRows{done: c.d.missing}, nil
}

type readRows struct{ done bool }

func (r *readRows) Columns() []string { return []string{"version", "data"} }
func (r *readRows) Close() error      { return nil }
func (r *readRows) Next(values []driver.Value) error {
	if r.done {
		return io.EOF
	}
	r.done = true
	values[0] = "1:2026-10-27"
	values[1] = []byte(`{"tournament_id":"legacy-id","matches":{}}`)
	return nil
}
func testReadRepository(t *testing.T, d *readDriver) *PostgresTournamentRepository {
	sql.Register(t.Name(), d)
	db, err := sql.Open(t.Name(), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return &PostgresTournamentRepository{db: db, cache: map[string]map[string]interface{}{}}
}
func TestReadRetriesTemporaryDisconnect(t *testing.T) {
	d := &readDriver{failures: 1}
	repository := testReadRepository(t, d)
	data, found, err := repository.GetByID("cup")
	if err != nil || !found || data["tournament_id"] != "cup" || d.calls != 2 {
		t.Fatalf("failed read recovery: %v %v %v", data, found, err)
	}
}
func TestDatabaseFailureIsDifferentFromMissingTournament(t *testing.T) {
	d := &readDriver{failures: 2}
	repository := testReadRepository(t, d)
	if _, _, err := repository.GetByID("cup"); err == nil {
		t.Fatal("connection failure was reported as missing data")
	}
	d.missing = true
	if _, found, err := repository.GetByID("cup"); found || err != nil {
		t.Fatalf("missing row not recognized: found=%v err=%v", found, err)
	}
}

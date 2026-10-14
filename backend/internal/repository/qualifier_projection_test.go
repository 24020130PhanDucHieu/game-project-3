package repository

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"strings"
	"testing"
)

type projectionDriver struct {
	query string
	args  []driver.NamedValue
	calls int
}

func (d *projectionDriver) Open(string) (driver.Conn, error) { return &projectionConn{d}, nil }

type projectionConn struct{ d *projectionDriver }

func (c *projectionConn) Close() error                        { return nil }
func (c *projectionConn) Begin() (driver.Tx, error)           { return nil, errors.New("unsupported") }
func (c *projectionConn) Prepare(string) (driver.Stmt, error) { return nil, errors.New("unsupported") }
func (c *projectionConn) QueryContext(_ context.Context, q string, args []driver.NamedValue) (driver.Rows, error) {
	c.d.query = q
	c.d.args = args
	c.d.calls++
	return &projectionRows{}, nil
}

type projectionRows struct{ done bool }

func (*projectionRows) Columns() []string { return []string{"key", "data"} }
func (*projectionRows) Close() error      { return nil }
func (r *projectionRows) Next(v []driver.Value) error {
	if r.done {
		return io.EOF
	}
	r.done = true
	v[0] = "job:cup:1"
	v[1] = []byte(`{"a":"alice","b":"bob"}`)
	return nil
}
func TestPostgresProjectsAndScopesBeforeTransfer(t *testing.T) {
	d := &projectionDriver{}
	sql.Register(t.Name(), d)
	db, err := sql.Open(t.Name(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	s := &QualifierRecords{db: db}
	if _, err := s.ListMetadata("job:cup_%:", "alice"); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(d.query, "data - 'code'") || !strings.Contains(d.query, "data->>'a'=$2 OR data->>'b'=$2") {
		t.Fatalf("unbounded projection: %s", d.query)
	}
	if len(d.args) != 2 || d.args[0].Value != `job:cup\_\%:%` || d.args[1].Value != "alice" {
		t.Fatalf("unsafe prefix or scope: %v", d.args)
	}
	s.ListMetadata("job:cup_%:", "alice")
	if d.calls != 1 {
		t.Fatal("identical polling bypassed cache")
	}
	s.ListMetadata("job:cup_%:", "bob")
	if d.calls != 2 {
		t.Fatal("cache crossed team identity")
	}
}

package qualifier

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"project-tuan3/internal/repository"
)

// Use only a disposable database: this installs a failure-injection trigger.
func TestPostgresSubmissionAtomicCommitAndRecovery(t *testing.T) {
	dsn := os.Getenv("ARENA_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("requires a disposable PostgreSQL database")
	}
	t.Setenv("SESSION_SECRET", "isolated-integration-test-key")
	repo, err := repository.NewPostgresTournamentRepository(dsn)
	if err != nil {
		t.Fatal("cannot initialize test PostgreSQL")
	}
	store, err := repository.NewQualifierRecords(repo, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	accounts, err := repository.NewAccounts(repo, filepath.Join(t.TempDir(), "accounts.json"))
	if err != nil {
		t.Fatal(err)
	}
	// Unique, valid student ID; the database is discarded after the test job.
	sid := fmt.Sprintf("29%06d", time.Now().UnixNano()%1000000)
	if err = accounts.Create(sid, "Postgres test", "fixture-password"); err != nil {
		t.Fatal(err)
	}
	s := New(store, accounts, nil, &testEngine{})
	e, err := s.Configure("", Event{Name: "Atomic PostgreSQL fixture", Deadline: now() + 600, Rounds: 1, TopK: 8})
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Register(e.ID, sid); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal("cannot connect to disposable database")
	}
	defer db.Close()
	name := "arena_fail_" + e.ID
	// ID is generated internally as hex; it is never supplied by a caller.
	_, err = db.Exec(fmt.Sprintf(`CREATE FUNCTION %s() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.key LIKE 'validation:%s:%%' THEN RAISE EXCEPTION 'injected validation write failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER %s BEFORE INSERT ON arena_qualifier_records FOR EACH ROW EXECUTE FUNCTION %s();`, name, e.ID, name, name))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Exec(fmt.Sprintf(`DROP TRIGGER IF EXISTS %s ON arena_qualifier_records; DROP FUNCTION IF EXISTS %s();`, name, name))
	if _, err = s.EnqueueSubmission(e.ID, sid, "code", "PYTHON", "stable-id"); err == nil {
		t.Fatal("injected storage failure acknowledged")
	}
	history, err := store.List("submission:" + e.ID + ":")
	if err != nil || len(history) != 0 {
		t.Fatal("partial submission persisted", len(history), err)
	}
	people, err := s.Participants(e.ID)
	if err != nil || people[sid].Pending != 0 {
		t.Fatal("partial participant write", people, err)
	}
	if _, err = db.Exec(fmt.Sprintf(`DROP TRIGGER %s ON arena_qualifier_records; DROP FUNCTION %s();`, name, name)); err != nil {
		t.Fatal(err)
	}
	sub, err := s.EnqueueSubmission(e.ID, sid, "code", "PYTHON", "stable-id")
	if err != nil {
		t.Fatal(err)
	}
	ready, err := store.ReadyValidations(now(), 128)
	if err != nil || ready["validation:"+e.ID+":"+sub.ID] == nil {
		t.Fatal("SQL queue page lost accepted work", err)
	}
	// Re-open the SQL repository instead of reusing the in-memory store.
	otherStore, err := repository.NewQualifierRecords(repo, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	restarted := New(otherStore, accounts, nil, &testEngine{})
	again, err := restarted.EnqueueSubmission(e.ID, sid, "code", "PYTHON", "stable-id")
	if err != nil || again.ID != sub.ID {
		t.Fatal("receipt not recovered", err)
	}
	if err = restarted.processSubmission("validation:" + e.ID + ":" + sub.ID); err != nil {
		t.Fatal(err)
	}
	people, err = restarted.Participants(e.ID)
	if err != nil || people[sid].ValidID != sub.ID || people[sid].Pending != 0 {
		t.Fatal(people, err)
	}
	history, err = otherStore.List("submission:" + e.ID + ":")
	if err != nil || len(history) != 1 {
		t.Fatal("duplicate history", len(history), err)
	}
	p := people[sid]
	p.Code = ""
	p.Elo = 1216
	if err = otherStore.BatchPreservingParticipantCode(map[string]interface{}{participantKey(e.ID, sid): p}); err != nil {
		t.Fatal(err)
	}
	if err = otherStore.Get(participantKey(e.ID, sid), &p); err != nil || p.Code != "code" || p.Elo != 1216 {
		t.Fatal("SQL rating update lost source", p, err)
	}
}

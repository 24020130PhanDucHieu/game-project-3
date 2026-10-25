package qualifier

import (
	"errors"
	"path/filepath"
	"project-tuan3/internal/repository"
	"strings"
	"sync/atomic"
	"testing"
)

// aiEngine chấm giả: điểm của mô hình suy ra từ mã ("score=NN"), điểm riêng tư thấp hơn công khai 10 điểm.
type aiEngine struct {
	calls   atomic.Int64
	failing atomic.Bool
	garbage atomic.Bool
}

func (e *aiEngine) Mutate(_ interface{}, action string, params map[string]interface{}) (map[string]interface{}, error) {
	if e.failing.Load() {
		return nil, errors.New("worker unavailable")
	}
	if action != "ai-suite" {
		return map[string]interface{}{"is_valid": true}, nil
	}
	e.calls.Add(1)
	code, _ := params["code"].(string)
	if e.garbage.Load() {
		return map[string]interface{}{"public_score": "x"}, nil
	}
	if strings.Contains(code, "broken") {
		return map[string]interface{}{"error": "Import module bị cấm"}, nil
	}
	var score float64
	for _, field := range strings.Fields(code) {
		if strings.HasPrefix(field, "score=") {
			for _, r := range strings.TrimPrefix(field, "score=") {
				score = score*10 + float64(r-'0')
			}
		}
	}
	return map[string]interface{}{
		"public_score": score, "private_score": score - 8, "reading_score": score - 5,
		"board":           map[string]interface{}{"score": 40.0, "bosses": map[string]interface{}{"RANDOM": 50.0}},
		"families_public": map[string]interface{}{"cycle": score}, "families_private": map[string]interface{}{"markov2": score - 10},
		"errors":     []interface{}{"Bộ ẩn: Time Limit Exceeded (1.00s)", "Bộ ẩn: Time Limit Exceeded (1.00s)"},
		"elapsed_ms": 1500.0,
	}, nil
}

func aiFixture(t *testing.T, codes map[string]string) (*Service, *aiEngine, Event) {
	t.Helper()
	dir := t.TempDir()
	repo := repository.NewJSONTournamentRepository(filepath.Join(dir, "tournaments.json"))
	store, err := repository.NewQualifierRecords(repo, filepath.Join(dir, "qualifiers"))
	if err != nil {
		t.Fatal(err)
	}
	engine := &aiEngine{}
	s := New(store, nil, nil, engine)
	e := Event{ID: "ai1", Kind: KindAI, Status: "RUNNING", Rounds: 3, TopK: 8, Eligible: len(codes), Seed: "secret"}
	rows := map[string]interface{}{metaKey(e.ID): e}
	for sid, code := range codes {
		rows[participantKey(e.ID, sid)] = Participant{SID: sid, Name: "Đội " + sid, LockedID: sid, Code: code, Language: "PYTHON", Elo: 1200, SubmittedAt: 1}
	}
	if err = store.Batch(rows); err != nil {
		t.Fatal(err)
	}
	return s, engine, e
}

func TestAIRoundsAverageAndRankByPrivateScore(t *testing.T) {
	s, engine, e := aiFixture(t, map[string]string{"A": "score=70", "B": "score=90", "C": "score=50"})
	if err := s.run(e.ID); err != nil {
		t.Fatal(err)
	}
	done, _ := s.Event(e.ID)
	if done.Status != "FINISHED" || done.AppliedRound != 3 || done.Completed != 9 || engine.calls.Load() != 9 {
		t.Fatal(done, engine.calls.Load())
	}
	people, _ := s.Participants(e.ID)
	if p := people["B"]; p.AIRounds != 3 || p.AIPublic != 90 || p.AIPrivate != 82 || p.Code != "score=90" {
		t.Fatalf("%+v", p)
	}
	ranked, err := s.Ranked(e.ID)
	if err != nil || len(ranked) != 3 || ranked[0].SID != "B" || ranked[2].SID != "C" {
		t.Fatal(ranked, err)
	}
	// Chạy lại không được cộng đôi.
	if err = s.run(e.ID); err != nil {
		t.Fatal(err)
	}
	again, _ := s.Participants(e.ID)
	if again["B"].AIRounds != 3 || engine.calls.Load() != 9 {
		t.Fatal("double-applied", again["B"], engine.calls.Load())
	}
}

func TestAIPrivateBoardStaysHiddenUntilFinished(t *testing.T) {
	s, _, e := aiFixture(t, map[string]string{"A": "score=70", "B": "score=90"})
	if err := s.run(e.ID); err != nil {
		t.Fatal(err)
	}
	if _, rows, err := s.AILeaderboard(e.ID, true, false); err != nil || len(rows) != 2 || rows[0].Private == nil || rows[0].Gap == nil {
		t.Fatal("finished event must reveal the private board", rows, err)
	}
	// Đưa về trạng thái đang chấm: bảng riêng tư phải đóng với đội, mở với ban tổ chức.
	running, _ := s.Event(e.ID)
	running.Status = "RUNNING"
	s.Store.Batch(map[string]interface{}{metaKey(e.ID): running})
	if _, _, err := s.AILeaderboard(e.ID, true, false); err == nil {
		t.Fatal("private board leaked while RUNNING")
	}
	if _, rows, err := s.AILeaderboard(e.ID, true, true); err != nil || len(rows) != 2 || rows[0].Private == nil {
		t.Fatal("organizers must see the private board", rows, err)
	}
	_, rows, err := s.AILeaderboard(e.ID, false, false)
	if err != nil || rows[0].StudentID != "B" || rows[0].Private != nil || rows[0].Reading != nil || rows[0].Board != nil {
		t.Fatal("public board must not carry private fields", rows, err)
	}
}

func TestAIBrokenBotScoresZeroWithoutStoppingEvent(t *testing.T) {
	s, _, e := aiFixture(t, map[string]string{"A": "score=70", "B": "broken"})
	if err := s.run(e.ID); err != nil {
		t.Fatal(err)
	}
	people, _ := s.Participants(e.ID)
	if people["B"].AIRounds != 3 || people["B"].AIPublic != 0 || people["A"].AIPublic != 70 {
		t.Fatal(people["A"], people["B"])
	}
	jobs, _ := s.jobs(e.ID, 1)
	for _, j := range jobs {
		if j.A == "B" && (j.AI == nil || j.AI.Failed == "") {
			t.Fatal("failure reason must be kept for the team", j)
		}
		if j.A == "A" && (len(j.AI.Notes) != 1 || j.AI.Notes[0] != "Bộ ẩn: Time Limit Exceeded (1.00s)") {
			t.Fatal("notes must be de-duplicated and carry no private family name", j.AI.Notes)
		}
	}
}

func TestAIWorkerFailureResumesWithoutPartialScores(t *testing.T) {
	s, engine, e := aiFixture(t, map[string]string{"A": "score=70", "B": "score=90"})
	engine.failing.Store(true)
	if s.run(e.ID) == nil {
		t.Fatal("missing worker failure")
	}
	people, _ := s.Participants(e.ID)
	for _, p := range people {
		if p.AIRounds != 0 {
			t.Fatal("partially scored", p)
		}
	}
	engine.failing.Store(false)
	if err := s.run(e.ID); err != nil {
		t.Fatal(err)
	}
	done, _ := s.Event(e.ID)
	if done.Status != "FINISHED" || done.AppliedRound != 3 {
		t.Fatal(done)
	}
}

func TestAIGarbageWorkerAnswerIsNotAccepted(t *testing.T) {
	s, engine, e := aiFixture(t, map[string]string{"A": "score=70"})
	engine.garbage.Store(true)
	if s.run(e.ID) == nil {
		t.Fatal("garbage scores must not be stored")
	}
	people, _ := s.Participants(e.ID)
	if people["A"].AIRounds != 0 {
		t.Fatal(people["A"])
	}
}

func TestAIBannedTeamIsNotScored(t *testing.T) {
	s, _, e := aiFixture(t, map[string]string{"A": "score=70", "B": "score=90"})
	var p Participant
	s.Store.Get(participantKey(e.ID, "B"), &p)
	p.Banned = true
	s.Store.Batch(map[string]interface{}{participantKey(e.ID, "B"): p})
	if err := s.run(e.ID); err != nil {
		t.Fatal(err)
	}
	ranked, _ := s.Ranked(e.ID)
	if len(ranked) != 1 || ranked[0].SID != "A" {
		t.Fatal(ranked)
	}
}

func TestPublicSeedIsStableAndPerEvent(t *testing.T) {
	if PublicSeed("x") != PublicSeed("x") || PublicSeed("x") == PublicSeed("y") || !strings.HasPrefix(PublicSeed("x"), "pub-") {
		t.Fatal(PublicSeed("x"), PublicSeed("y"))
	}
}

func TestModelCardValidationAndWindow(t *testing.T) {
	s, _, e := aiFixture(t, map[string]string{"A": "score=70"})
	e.Status = "OPEN"
	s.Store.Batch(map[string]interface{}{metaKey(e.ID): e})
	if err := s.SetModelCard(e.ID, "A", "magic", "x"); err == nil {
		t.Fatal("unknown technique accepted")
	}
	if err := s.SetModelCard(e.ID, "A", "nn", strings.Repeat("x", 2001)); err == nil {
		t.Fatal("long card accepted")
	}
	if err := s.SetModelCard(e.ID, "A", "nn", " Mạng 2 lớp "); err != nil {
		t.Fatal(err)
	}
	var p Participant
	s.Store.Get(participantKey(e.ID, "A"), &p)
	if p.Technique != "NN" || p.ModelCard != "Mạng 2 lớp" || p.Code != "score=70" {
		t.Fatalf("%+v", p)
	}
	e.Status = "RUNNING"
	s.Store.Batch(map[string]interface{}{metaKey(e.ID): e})
	if err := s.SetModelCard(e.ID, "A", "NN", "đổi"); err == nil {
		t.Fatal("model card changed after scoring started")
	}
}

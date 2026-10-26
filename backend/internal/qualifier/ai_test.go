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
	rolls    atomic.Int64
	lastRoll map[string]interface{}
	calls    atomic.Int64
	failing atomic.Bool
	garbage atomic.Bool
}

func (e *aiEngine) Mutate(_ interface{}, action string, params map[string]interface{}) (map[string]interface{}, error) {
	if e.failing.Load() {
		return nil, errors.New("worker unavailable")
	}
	if handled, result := e.taskAction(action, params); handled {
		return result, nil
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

func TestReleaseTargetReopensPromotionAfterMainTournamentDeleted(t *testing.T) {
	s, _, e := aiFixture(t, map[string]string{"a": "x"})
	e.Status, e.Target = "PROMOTED", "main1"
	other := Event{ID: "ai2", Kind: KindAI, Status: "PROMOTED", Target: "main2", Seed: "s2"}
	if err := s.Store.Batch(map[string]interface{}{metaKey(e.ID): e, metaKey(other.ID): other}); err != nil {
		t.Fatal(err)
	}
	if err := s.ReleaseTarget("main1"); err != nil {
		t.Fatal(err)
	}
	got, _ := s.Event(e.ID)
	if got.Status != "FINISHED" || got.Target != "" || got.Seed != "secret" {
		t.Fatalf("vòng loại phải về FINISHED, bỏ đích, giữ hạt giống: %+v", got)
	}
	untouched, _ := s.Event(other.ID)
	if untouched.Status != "PROMOTED" || untouched.Target != "main2" {
		t.Fatalf("không được đụng vòng loại của giải khác: %+v", untouched)
	}
}

func TestDeleteEventSignalsAndClearsRecords(t *testing.T) {
	s, _, e := aiFixture(t, map[string]string{"a": "x"})
	signalled := ""
	s.OnUpdate = func(id string) { signalled = id }
	if err := s.Store.Batch(map[string]interface{}{"validation:" + e.ID + ":a": map[string]interface{}{"status": "QUEUED"}}); err != nil {
		t.Fatal(err)
	}
	e.Status = "FINISHED"
	_ = s.Store.Batch(map[string]interface{}{metaKey(e.ID): e})
	if err := s.DeleteEvent(e.ID); err != nil {
		t.Fatal(err)
	}
	if signalled != e.ID {
		t.Fatal("xóa vòng loại phải báo cho các máy khác")
	}
	var v map[string]interface{}
	if s.Store.Get("validation:"+e.ID+":a", &v) == nil {
		t.Fatal("nhiệm vụ kiểm tra mồ côi vẫn còn")
	}
	if _, err := s.Event(e.ID); err == nil {
		t.Fatal("sự kiện phải biến mất")
	}
}

func TestAdminRegisterChecksKindStatusAndDuplicates(t *testing.T) {
	s, _, e := aiFixture(t, map[string]string{"a": "x"})
	accounts, err := repositoryAccounts(t)
	if err != nil {
		t.Fatal(err)
	}
	if err = accounts.Create("S1", "Đội Một", "pass-1234"); err != nil {
		t.Fatal(err)
	}
	s.Accounts = accounts
	e.Status = "OPEN"
	normal := Event{ID: "n1", Kind: "", Status: "OPEN", Rounds: 1, TopK: 8, Seed: "s"}
	if err = s.Store.Batch(map[string]interface{}{metaKey(e.ID): e, metaKey(normal.ID): normal}); err != nil {
		t.Fatal(err)
	}
	if _, _, err = s.AdminRegister(e.ID, "S1", false); err == nil || !strings.Contains(err.Error(), "Giải AI") {
		t.Fatalf("ghi danh vòng loại AI bằng loại thường phải bị từ chối: %v", err)
	}
	if _, _, err = s.AdminRegister(normal.ID, "S1", true); err == nil || !strings.Contains(err.Error(), "thường") {
		t.Fatalf("ghi danh vòng loại thường bằng loại AI phải bị từ chối: %v", err)
	}
	if _, total, err := s.AdminRegister(e.ID, "S1", true); err != nil || total != 2 {
		t.Fatalf("ghi danh hợp lệ: total=%d err=%v", total, err)
	}
	if _, _, err = s.AdminRegister(e.ID, "S1", true); err == nil || !strings.Contains(err.Error(), "đã có") {
		t.Fatalf("ghi danh trùng phải báo: %v", err)
	}
	if _, _, err = s.AdminRegister(e.ID, "NOPE", true); err == nil {
		t.Fatal("tài khoản không tồn tại phải bị từ chối")
	}
	e.Status = "LOCKED"
	_ = s.Store.Batch(map[string]interface{}{metaKey(e.ID): e})
	if _, _, err = s.AdminRegister(e.ID, "S1", true); err == nil {
		t.Fatal("vòng loại đã khóa bài không được ghi danh thêm")
	}
}

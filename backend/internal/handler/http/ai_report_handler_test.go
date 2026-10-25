package http

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/gin-gonic/gin"

	"project-tuan3/internal/ai"
	"project-tuan3/internal/qualifier"
)

type memStore struct {
	mu   sync.Mutex
	rows map[string]json.RawMessage
}

func newMemStore() *memStore { return &memStore{rows: map[string]json.RawMessage{}} }

func (m *memStore) Get(key string, target interface{}) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	raw, ok := m.rows[key]
	if !ok {
		return fmt.Errorf("not found")
	}
	return json.Unmarshal(raw, target)
}

func (m *memStore) List(prefix string) (map[string]json.RawMessage, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := map[string]json.RawMessage{}
	for k, v := range m.rows {
		if strings.HasPrefix(k, prefix) {
			out[k] = v
		}
	}
	return out, nil
}

func (m *memStore) Batch(values map[string]interface{}) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for k, v := range values {
		raw, err := json.Marshal(v)
		if err != nil {
			return err
		}
		m.rows[k] = raw
	}
	return nil
}

func seedReports(t *testing.T, h *AIReportHandler, tid string) {
	t.Helper()
	put := func(sid, name string, at float64) {
		if err := h.Store.Batch(map[string]interface{}{fmt.Sprintf(aiReportKeyFmt, tid, sid): AIReport{TournamentID: tid, StudentID: sid, TeamName: name, Summary: "x", SubmittedAt: at}}); err != nil {
			t.Fatal(err)
		}
	}
	score := func(sid, judge string, s ...int) {
		if err := h.Store.Batch(map[string]interface{}{fmt.Sprintf(aiScoreKeyFmt, tid, sid, judge): AIScore{Judge: judge, Scores: s}}); err != nil {
			t.Fatal(err)
		}
	}
	put("A1", "Alpha", 10)
	put("B2", "Beta", 5)
	put("C3", "Gamma", 7)
	put("D4", "Delta", 8) // chưa ai chấm
	score("A1", "gk1", 8, 8, 8, 8, 8) // 40
	score("A1", "gk2", 6, 6, 6, 6, 6) // 30 → trung bình 35
	score("B2", "gk1", 7, 7, 7, 7, 7) // 35
	score("C3", "gk1", 5, 5, 5, 5, 5) // 25
}

func TestTechRankingAveragesJudgesAndBreaksTiesByEarlierSubmission(t *testing.T) {
	h := &AIReportHandler{Store: newMemStore()}
	seedReports(t, h, "T")
	rows, err := h.ranking("T")
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 3 {
		t.Fatalf("đội chưa được chấm không được lên bảng: %+v", rows)
	}
	// A1 và B2 cùng 35; B2 nộp sớm hơn (5 < 10) nên đứng trước.
	if rows[0].StudentID != "B2" || rows[1].StudentID != "A1" || rows[2].StudentID != "C3" {
		t.Fatalf("%+v", rows)
	}
	if rows[1].Score != 35 || rows[1].Judges != 2 || rows[1].Criteria[0] != 7 {
		t.Fatalf("%+v", rows[1])
	}
}

func TestTechWinnerOnlyAfterPublish(t *testing.T) {
	h := &AIReportHandler{Store: newMemStore()}
	seedReports(t, h, "T")
	if _, _, _, ok := h.TechWinner("T"); ok {
		t.Fatal("công bố sớm")
	}
	h.Store.Batch(map[string]interface{}{aiReportCfgKey + "T": AIReportConfig{Published: true}})
	name, sid, score, ok := h.TechWinner("T")
	if !ok || sid != "B2" || name != "Beta" || score != 35 {
		t.Fatal(name, sid, score, ok)
	}
}

func TestCertificatesIncludeTechAwardOnlyForAITournaments(t *testing.T) {
	cert := &CertificateHandler{TechWinner: func(tid string) (string, string, float64, bool) { return "Beta", "B2", 35, true }}
	final := map[string]interface{}{"matches": map[string]interface{}{
		"f": map[string]interface{}{"round_level": float64(1), "winner": "team_a", "team_a": team("Alpha", "A1"), "team_b": team("Beta", "B2")},
	}}
	normal := cert.allPlacements("T", final)
	if len(normal) != 2 {
		t.Fatalf("giải thường không có Giải Kỹ thuật: %v", normal)
	}
	final["track"] = "AI"
	got := cert.allPlacements("T", final)
	if len(got) != 3 || got[2].Place != aiTechAwardName || got[2].StudentID != "B2" {
		t.Fatalf("%v", got)
	}
	if certDedup("T", got[2]) == certDedup("T", got[1]) {
		t.Fatal("Giải Kỹ thuật và Á quân của cùng một đội phải có hai thông báo khác nhau")
	}
}

func TestMainEloIsIndependentPerTrack(t *testing.T) {
	match := func(a, b string) map[string]interface{} {
		return map[string]interface{}{"round_level": float64(1), "winner": "team_a", "status": "COMPLETED", "team_a": team(a, a), "team_b": team(b, b),
			"rounds_history": []interface{}{map[string]interface{}{"winner": "team_a"}, map[string]interface{}{"winner": "team_a"}, map[string]interface{}{"winner": "team_a"}}}
	}
	all := map[string]interface{}{
		"normal": map[string]interface{}{"name": "Giải thường", "matches": map[string]interface{}{"m": match("X", "Y")}},
		"ai":     map[string]interface{}{"name": "Giải AI", "track": "AI", "matches": map[string]interface{}{"m": match("X", "Z")}},
	}
	n, a := ComputeMainElo(filterTrack(all, "")), ComputeMainElo(filterTrack(all, "AI"))
	if len(n) != 2 || n["X"] == nil || n["Z"] != nil {
		t.Fatalf("giải thường lẫn đội của Giải AI: %v", n)
	}
	if len(a) != 2 || a["Z"] == nil || a["Y"] != nil {
		t.Fatalf("Giải AI lẫn đội của giải thường: %v", a)
	}
	if n["X"].Rating != 1216 || a["X"].Rating != 1216 {
		t.Fatalf("mỗi đường đua phải bắt đầu lại từ 1200: %v %v", n["X"].Rating, a["X"].Rating)
	}
}

func TestTrackParam(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for q, want := range map[string]string{"": "", "track=ai": "AI", "track=AI": "AI", "track=x": ""} {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest("GET", "/?"+q, nil)
		if got := trackParam(c); got != want {
			t.Fatalf("%q: %q", q, got)
		}
	}
}

func TestReportConfigDefaultsToUnpublished(t *testing.T) {
	h := &AIReportHandler{Store: newMemStore()}
	if cfg := h.config("T"); cfg.Published || cfg.Deadline != 0 {
		t.Fatal("mặc định phải chưa công bố và không có hạn")
	}
	h.Store.Batch(map[string]interface{}{aiReportCfgKey + "T": AIReportConfig{Deadline: 5, Published: true}})
	if cfg := h.config("T"); !cfg.Published || cfg.Deadline != 5 {
		t.Fatal(cfg)
	}
}

// Tài liệu của trợ lý hỏi đáp phải nói đúng các con số trong mã (một nguồn sự thật).
func TestAICupKnowledgeBaseMatchesCode(t *testing.T) {
	kb, err := ai.LoadKB()
	if err != nil {
		t.Fatal(err)
	}
	var text strings.Builder
	for _, s := range kb.Sources() {
		if strings.HasPrefix(s.ID, "kb:giai-ai#") {
			text.WriteString(s.Text + "\n")
		}
	}
	doc := text.String()
	for _, want := range []string{
		fmt.Sprintf("từ %d đến %d ký tự", aiReportMin, aiReportMax),
		fmt.Sprintf("mỗi tiêu chí 0 đến %d", aiRubricMax),
		fmt.Sprintf("tối đa %d", aiRubricMax*len(aiCriteria)),
		fmt.Sprintf("%d tiêu chí", len(aiCriteria)),
		fmt.Sprintf("%d lượt oẳn tù tì", qualifier.AIRoundsPerMatch),
		fmt.Sprintf("đấu %d trận với mỗi nhóm", qualifier.AIInstances),
		fmt.Sprintf("%d trận với ba boss", qualifier.AIBoardGames),
		"chiếm 60%", "chiếm 40%", "0,6 nhân phần A", "0,4 nhân phần B",
	} {
		if !strings.Contains(doc, want) {
			t.Errorf("tài liệu Giải AI thiếu %q", want)
		}
	}
	if qualifier.AIReadingWeight != 0.6 || qualifier.AIBoardWeight != 0.4 {
		t.Fatal("trọng số đổi nhưng tài liệu chưa đổi")
	}
}

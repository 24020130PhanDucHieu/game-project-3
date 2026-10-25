package http

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"project-tuan3/internal/ai"
	"project-tuan3/internal/auth"
)

type aiMemStore struct {
	mu   sync.Mutex
	rows map[string][]byte
}

func (s *aiMemStore) Get(key string, target interface{}) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	raw, ok := s.rows[key]
	if !ok {
		return sql.ErrNoRows
	}
	return json.Unmarshal(raw, target)
}
func (s *aiMemStore) Batch(v map[string]interface{}) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for k, x := range v {
		raw, _ := json.Marshal(x)
		s.rows[k] = raw
	}
	return nil
}
func (s *aiMemStore) List(prefix string) (map[string]json.RawMessage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := map[string]json.RawMessage{}
	for k, v := range s.rows {
		if strings.HasPrefix(k, prefix) {
			out[k] = v
		}
	}
	return out, nil
}

type aiNoData struct{}

func (aiNoData) Tournament(string, ai.Identity) (map[string]interface{}, error) {
	return nil, errors.New("none")
}
func (aiNoData) Tournaments() []ai.TournamentRef     { return nil }
func (aiNoData) TournamentsOfTeam(string) []string    { return nil }
func (aiNoData) PublicFAQ() ([]ai.FAQItem, error)     { return nil, nil }

// aiModel: model giả. fail != nil thì lỗi; còn lại luôn tra cứu tài liệu rồi trả lời có trích dẫn đúng.
type aiModel struct {
	mu    sync.Mutex
	calls int
	fail  error
	cite  bool // true: trích dẫn thật; false: bịa
}

func (m *aiModel) Complete(_ context.Context, req ai.Request) (ai.Response, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.calls++
	if m.fail != nil {
		return ai.Response{}, m.fail
	}
	hasResult := len(req.Messages) > 1
	if !hasResult {
		in, _ := json.Marshal(map[string]string{"query": "bàn cờ bao nhiêu ô"})
		return ai.Response{Content: []ai.Block{{Type: "tool_use", ID: "t1", Name: "search_knowledge", Input: in}}, Usage: ai.Usage{InputTokens: 50, OutputTokens: 5}}, nil
	}
	quote := "Kích thước bàn cờ là 9×9"
	if !m.cite {
		quote = "Bàn cờ có hình tròn bán kính 5 mét"
	}
	in, _ := json.Marshal(map[string]interface{}{"answer": "Bàn cờ có kích thước 9×9.", "needs_human": false,
		"citations": []map[string]string{{"source_id": "kb:luat-co-ban#ban-co-va-quan-co", "quote": quote}}})
	return ai.Response{Content: []ai.Block{{Type: "tool_use", ID: "t2", Name: ai.SubmitTool, Input: in}}, Usage: ai.Usage{InputTokens: 80, OutputTokens: 20}}, nil
}

func aiServer(t *testing.T, model *aiModel, role string) (*gin.Engine, *AIHandler) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	kb, err := ai.LoadKB()
	if err != nil {
		t.Fatal(err)
	}
	h := &AIHandler{
		KB:        kb,
		Quota:     &ai.Manager{Store: &aiMemStore{rows: map[string][]byte{}}, Defaults: ai.Settings{Enabled: true, PerTeam: 2, DailyTokens: 100000}},
		Available: true,
	}
	h.Agent = &ai.Agent{C: model, Model: "test", MaxTurns: 4, Tools: &ai.Toolbox{KB: kb, Data: aiNoData{}, Now: time.Now}}
	r := gin.New()
	r.Use(func(c *gin.Context) {
		if role != "" {
			c.Set("session", auth.Session{Role: role, StudentID: map[string]string{"TEAM": "A1", "ADMIN": ""}[role], TeamName: "Alpha"})
		}
		c.Next()
	})
	r.POST("/ai/ask", h.Ask)
	r.GET("/ai/usage", h.Usage)
	r.GET("/ai/settings", h.Settings)
	r.PUT("/ai/settings", h.SaveSettings)
	r.GET("/ai/log", h.Log)
	return r, h
}

func aiDo(r *gin.Engine, method, path, body string) (int, map[string]interface{}) {
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var out map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return w.Code, out
}

func TestAIAskGroundedCachedAndLogged(t *testing.T) {
	model := &aiModel{cite: true}
	r, h := aiServer(t, model, "TEAM")
	code, out := aiDo(r, "POST", "/ai/ask", `{"question":"Bàn cờ bao nhiêu ô?"}`)
	if code != 200 || out["needs_human"] != false || len(out["sources"].([]interface{})) != 1 || out["remaining"] != float64(1) {
		t.Fatalf("câu trả lời có nguồn: %d %v", code, out)
	}
	callsAfterFirst := model.calls
	code, out = aiDo(r, "POST", "/ai/ask", `{"question":"bàn cờ bao nhiêu ô"}`)
	if code != 200 || out["cached"] != true || model.calls != callsAfterFirst || out["remaining"] != float64(1) {
		t.Fatalf("lần hai phải lấy từ cache, không gọi model và không trừ lượt: %d %v calls=%d", code, out, model.calls)
	}
	logs := h.Quota.Logs(1, 10)
	if len(logs) != 2 || !logs[0].Cached || logs[1].Tokens != 155 || logs[1].StudentID != "A1" {
		t.Fatalf("nhật ký: %+v", logs)
	}
}

func TestAIAskFabricatedCitationGoesToHuman(t *testing.T) {
	model := &aiModel{cite: false}
	r, h := aiServer(t, model, "TEAM")
	_, out := aiDo(r, "POST", "/ai/ask", `{"question":"Bàn cờ hình gì?"}`)
	if out["needs_human"] != true || out["answer"] != ai.FallbackAnswer || len(out["sources"].([]interface{})) != 0 {
		t.Fatalf("trích dẫn bịa phải chuyển BTC: %v", out)
	}
	if logs := h.Quota.Logs(1, 10); logs[0].Reason != "no_valid_citation" || !logs[0].NeedsHuman {
		t.Fatalf("phải ghi lý do: %+v", logs[0])
	}
	// kết quả chuyển BTC không được cache
	calls := model.calls
	aiDo(r, "POST", "/ai/ask", `{"question":"Bàn cờ hình gì?"}`)
	if model.calls == calls {
		t.Fatal("câu bị chuyển BTC không được cache")
	}
}

func TestAIAskLimitsAndAccess(t *testing.T) {
	model := &aiModel{cite: true}
	r, _ := aiServer(t, model, "TEAM")
	for i, q := range []string{"câu một về bàn cờ", "câu hai về quân cờ"} {
		if code, _ := aiDo(r, "POST", "/ai/ask", `{"question":"`+q+`"}`); code != 200 {
			t.Fatalf("lượt %d: %d", i, code)
		}
	}
	code, out := aiDo(r, "POST", "/ai/ask", `{"question":"câu ba về luật chơi"}`)
	if code != 429 || out["code"] != "AI_LIMIT" {
		t.Fatalf("hết lượt phải 429: %d %v", code, out)
	}
	if code, out := aiDo(r, "GET", "/ai/usage", ""); code != 200 || out["remaining"] != float64(0) || out["limit"] != float64(2) {
		t.Fatalf("usage: %v", out)
	}
	if code, _ := aiDo(r, "POST", "/ai/ask", `{"question":"x"}`); code != 400 {
		t.Fatalf("câu quá ngắn: %d", code)
	}
	guest, _ := aiServer(t, model, "")
	if code, _ := aiDo(guest, "POST", "/ai/ask", `{"question":"bàn cờ bao nhiêu ô"}`); code != 403 {
		t.Fatalf("khách phải bị chặn: %d", code)
	}
}

func TestAIProviderErrorRefundsAndDoesNotLeak(t *testing.T) {
	model := &aiModel{fail: &ai.APIError{Status: 503, Body: "sk-secret-key upstream"}}
	r, h := aiServer(t, model, "TEAM")
	code, out := aiDo(r, "POST", "/ai/ask", `{"question":"bàn cờ bao nhiêu ô"}`)
	if code != 502 || out["code"] != "AI_BUSY" || strings.Contains(out["detail"].(string), "sk-secret") {
		t.Fatalf("lỗi nhà cung cấp: %d %v", code, out)
	}
	if u := h.Quota.UsageFor("A1"); u.Used != 0 {
		t.Fatalf("phải hoàn lượt khi model lỗi: %+v", u)
	}
}

func TestAIAdminSwitchAndSettings(t *testing.T) {
	model := &aiModel{cite: true}
	r, h := aiServer(t, model, "ADMIN")
	if code, out := aiDo(r, "PUT", "/ai/settings", `{"enabled":false,"per_team":5,"daily_tokens":1000}`); code != 200 {
		t.Fatalf("lưu cài đặt: %d %v", code, out)
	}
	code, out := aiDo(r, "POST", "/ai/ask", `{"question":"bàn cờ bao nhiêu ô"}`)
	if code != 503 || out["code"] != "AI_DISABLED" || model.calls != 0 {
		t.Fatalf("tắt thì không gọi model: %d %v", code, out)
	}
	if code, out := aiDo(r, "GET", "/ai/usage", ""); out["available"] != false {
		t.Fatalf("usage khi tắt: %d %v", code, out)
	}
	_, _ = aiDo(r, "PUT", "/ai/settings", `{"enabled":true,"per_team":5,"daily_tokens":1000}`)
	aiDo(r, "POST", "/ai/ask", `{"question":"bàn cờ bao nhiêu ô"}`)
	code, out = aiDo(r, "GET", "/ai/settings", "")
	if code != 200 || out["asked_today"] != float64(1) || out["tokens_today"] != float64(155) {
		t.Fatalf("thống kê: %v", out)
	}
	// trần ngân sách ngày: 1000 token, đã dùng 155 → đặt trần 100 thì chặn
	_, _ = aiDo(r, "PUT", "/ai/settings", `{"enabled":true,"per_team":5,"daily_tokens":100}`)
	if code, out := aiDo(r, "POST", "/ai/ask", `{"question":"quân cờ có mấy loại"}`); code != 429 || out["code"] != "AI_LIMIT" {
		t.Fatalf("hết ngân sách ngày: %d %v", code, out)
	}
	_ = h
}

func TestAIQuestionIsTrimmedAndCapped(t *testing.T) {
	if got := cleanQuestion("  bàn   cờ \n  bao nhiêu  "); got != "bàn cờ bao nhiêu" {
		t.Fatalf("%q", got)
	}
	if n := len([]rune(cleanQuestion(strings.Repeat("a", 1000)))); n != aiQuestionMax {
		t.Fatalf("độ dài %d", n)
	}
}

package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// Máy chủ Gemini giả: ghi lại yêu cầu và trả về đúng kiểu phản hồi của Gemini (có id và thoughtSignature).
type fakeGemini struct {
	mu      sync.Mutex
	bodies  []map[string]interface{}
	keys    []string
	urls    []string
	status  []int
	replies []string
}

func (f *fakeGemini) handler(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var b map[string]interface{}
	_ = json.NewDecoder(r.Body).Decode(&b)
	f.bodies = append(f.bodies, b)
	f.keys = append(f.keys, r.Header.Get("x-goog-api-key"))
	f.urls = append(f.urls, r.URL.String())
	i := len(f.bodies) - 1
	if i < len(f.status) && f.status[i] != 200 {
		w.WriteHeader(f.status[i])
		_, _ = w.Write([]byte(`{"error":{"message":"secret upstream detail"}}`))
		return
	}
	_, _ = w.Write([]byte(f.replies[min(i, len(f.replies)-1)]))
}

const gemSearch = `{"candidates":[{"content":{"role":"model","parts":[{"functionCall":{"name":"search_knowledge","args":{"query":"bàn cờ"},"id":"call_1"},"thoughtSignature":"SIG-ONE"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":100,"candidatesTokenCount":10,"thoughtsTokenCount":5}}`
const gemSubmit = `{"candidates":[{"content":{"role":"model","parts":[{"functionCall":{"name":"submit_answer","args":{"answer":"Bàn cờ có kích thước 9×9.","needs_human":false,"citations":[{"source_id":"kb:luat-co-ban#ban-co-va-quan-co","quote":"Kích thước bàn cờ là 9×9"}]},"id":"call_2"},"thoughtSignature":"SIG-TWO"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":200,"candidatesTokenCount":30}}`

func TestGeminiClientEndToEndThroughAgent(t *testing.T) {
	f := &fakeGemini{replies: []string{gemSearch, gemSubmit}}
	srv := httptest.NewServer(http.HandlerFunc(f.handler))
	defer srv.Close()
	kb, _ := LoadKB()
	agent := &Agent{C: NewGeminiClient(srv.URL, "gem-test-key"), Model: "gemini-test", MaxTurns: 4, MaxTokens: 1200,
		Tools: &Toolbox{KB: kb, Data: testData(), Now: func() time.Time { return now0 }}}
	res, err := agent.Ask(context.Background(), "bàn cờ bao nhiêu ô", Identity{Role: "TEAM", StudentID: "A1"})
	if err != nil || res.NeedsHuman || len(res.Sources) != 1 || !strings.Contains(res.Answer, "9×9") {
		t.Fatalf("Agent + Gemini phải ra câu trả lời có nguồn: %+v err=%v", res, err)
	}
	if res.Usage.InputTokens != 300 || res.Usage.OutputTokens != 45 {
		t.Fatalf("token (gồm thoughtsTokenCount): %+v", res.Usage)
	}
	if len(f.bodies) != 2 || f.keys[0] != "gem-test-key" || strings.Contains(f.urls[0], "gem-test-key") || !strings.HasSuffix(f.urls[0], "/v1beta/models/gemini-test:generateContent") {
		t.Fatalf("khóa phải nằm ở header, không ở URL: %v %v", f.keys, f.urls)
	}
	first := f.bodies[0]
	fc := first["toolConfig"].(map[string]interface{})["functionCallingConfig"].(map[string]interface{})
	if fc["mode"] != "ANY" || fc["allowedFunctionNames"] != nil {
		t.Fatalf("vòng đầu phải ép gọi công cụ: %v", fc)
	}
	gc := first["generationConfig"].(map[string]interface{})
	if gc["temperature"] != float64(0) || gc["maxOutputTokens"] != float64(1200) {
		t.Fatalf("generationConfig: %v", gc)
	}
	if first["systemInstruction"].(map[string]interface{})["parts"].([]interface{})[0].(map[string]interface{})["text"] == "" {
		t.Fatal("thiếu system prompt")
	}
	decls := first["tools"].([]interface{})[0].(map[string]interface{})["functionDeclarations"].([]interface{})
	if len(decls) != 8 {
		t.Fatalf("phải có đủ 8 công cụ: %d", len(decls))
	}
	for _, d := range decls {
		m := d.(map[string]interface{})
		if m["parameters"] == nil || m["input_schema"] != nil || m["name"] == "" {
			t.Fatalf("Gemini dùng \"parameters\", không dùng \"input_schema\": %v", m)
		}
	}
	// vòng 2: lịch sử phải có phần của model gửi lại nguyên văn (kèm thoughtSignature) và functionResponse là OBJECT
	contents := f.bodies[1]["contents"].([]interface{})
	if len(contents) != 3 {
		t.Fatalf("contents vòng 2: %d", len(contents))
	}
	model := contents[1].(map[string]interface{})
	if model["role"] != "model" {
		t.Fatalf("role phải là model: %v", model["role"])
	}
	echoed := model["parts"].([]interface{})[0].(map[string]interface{})
	if echoed["thoughtSignature"] != "SIG-ONE" || echoed["functionCall"].(map[string]interface{})["id"] != "call_1" {
		t.Fatalf("phải gửi lại nguyên văn phần model (thoughtSignature): %v", echoed)
	}
	user := contents[2].(map[string]interface{})
	fr := user["parts"].([]interface{})[0].(map[string]interface{})["functionResponse"].(map[string]interface{})
	resp, isObj := fr["response"].(map[string]interface{})
	if user["role"] != "user" || fr["name"] != "search_knowledge" || fr["id"] != "call_1" || !isObj || resp["sources"] == nil {
		t.Fatalf("functionResponse sai: %v", user)
	}
	// vòng 2 vẫn ép gọi công cụ (không bao giờ trả văn bản trần)
	if f.bodies[1]["toolConfig"].(map[string]interface{})["functionCallingConfig"].(map[string]interface{})["mode"] != "ANY" {
		t.Fatal("vòng 2 phải ép ANY")
	}
}

func TestGeminiForcedSubmitOnLastTurn(t *testing.T) {
	f := &fakeGemini{replies: []string{gemSearch}} // model cứ gọi search mãi
	srv := httptest.NewServer(http.HandlerFunc(f.handler))
	defer srv.Close()
	kb, _ := LoadKB()
	agent := &Agent{C: NewGeminiClient(srv.URL, "k"), Model: "m", MaxTurns: 2, Tools: &Toolbox{KB: kb, Data: testData(), Now: func() time.Time { return now0 }}}
	res, _ := agent.Ask(context.Background(), "bàn cờ", Identity{Role: "TEAM", StudentID: "A1"})
	if !res.NeedsHuman || res.Reason != "max_turns" {
		t.Fatalf("%+v", res)
	}
	last := f.bodies[1]["toolConfig"].(map[string]interface{})["functionCallingConfig"].(map[string]interface{})
	names, _ := last["allowedFunctionNames"].([]interface{})
	if last["mode"] != "ANY" || len(names) != 1 || names[0] != SubmitTool {
		t.Fatalf("vòng cuối chỉ được phép submit_answer: %v", last)
	}
}

func TestGeminiRetriesAndHidesUpstreamDetail(t *testing.T) {
	f := &fakeGemini{status: []int{429, 200}, replies: []string{gemSubmit}}
	srv := httptest.NewServer(http.HandlerFunc(f.handler))
	defer srv.Close()
	c := NewGeminiClient(srv.URL, "k")
	if _, err := c.Complete(context.Background(), Request{Model: "m", System: "s", Tools: Defs(), ToolChoice: map[string]interface{}{"type": "any"}, Messages: []Message{{Role: "user", Content: "x"}}}); err != nil || len(f.bodies) != 2 {
		t.Fatalf("phải thử lại sau 429: %v n=%d", err, len(f.bodies))
	}
	f2 := &fakeGemini{status: []int{500, 500}, replies: []string{"{}"}}
	srv2 := httptest.NewServer(http.HandlerFunc(f2.handler))
	defer srv2.Close()
	if _, err := NewGeminiClient(srv2.URL, "k").Complete(context.Background(), Request{Model: "m", Messages: []Message{{Role: "user", Content: "x"}}}); err == nil {
		t.Fatal("lỗi 500 liên tục phải trả lỗi")
	}
	f3 := &fakeGemini{status: []int{404}, replies: []string{"{}"}}
	srv3 := httptest.NewServer(http.HandlerFunc(f3.handler))
	defer srv3.Close()
	_, err := NewGeminiClient(srv3.URL, "k").Complete(context.Background(), Request{Model: "m", Messages: []Message{{Role: "user", Content: "x"}}})
	if ae, ok := err.(*APIError); !ok || ae.Status != 404 || len(f3.bodies) != 1 {
		t.Fatalf("lỗi 404 không được thử lại: %v", err)
	}
}

func TestGeminiEmptyCandidatesGoToHuman(t *testing.T) {
	f := &fakeGemini{replies: []string{`{"candidates":[],"promptFeedback":{"blockReason":"SAFETY"},"usageMetadata":{"promptTokenCount":10}}`}}
	srv := httptest.NewServer(http.HandlerFunc(f.handler))
	defer srv.Close()
	kb, _ := LoadKB()
	agent := &Agent{C: NewGeminiClient(srv.URL, "k"), Model: "m", Tools: &Toolbox{KB: kb, Data: testData(), Now: func() time.Time { return now0 }}}
	res, err := agent.Ask(context.Background(), "bàn cờ", Identity{Role: "TEAM", StudentID: "A1"})
	if err != nil || !res.NeedsHuman || res.Reason != "no_tool_call" {
		t.Fatalf("bị chặn phải chuyển BTC: %+v %v", res, err)
	}
}

package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// GeminiClient gọi Google Gemini (generateContent) và dịch qua lại với định dạng Request/Response chung của gói ai,
// nên Agent, công cụ và mọi bước kiểm chứng nguồn dùng y hệt cho Claude lẫn Gemini.
type GeminiClient struct {
	BaseURL string
	APIKey  string
	HTTP    *http.Client
}

func NewGeminiClient(baseURL, key string) *GeminiClient {
	if baseURL == "" {
		baseURL = "https://generativelanguage.googleapis.com"
	}
	return &GeminiClient{BaseURL: strings.TrimRight(baseURL, "/"), APIKey: key, HTTP: &http.Client{Timeout: 30 * time.Second}}
}

type gPart = map[string]interface{}

func (c *GeminiClient) Complete(ctx context.Context, req Request) (Response, error) {
	body := map[string]interface{}{
		"systemInstruction": map[string]interface{}{"parts": []gPart{{"text": req.System}}},
		"contents":          geminiContents(req.Messages),
		"tools":             []map[string]interface{}{{"functionDeclarations": geminiDeclarations(req.Tools)}},
		"toolConfig":        map[string]interface{}{"functionCallingConfig": geminiChoice(req.ToolChoice)},
		// temperature 0 để cùng câu hỏi ra cùng cách tra cứu
		"generationConfig": map[string]interface{}{"temperature": 0, "maxOutputTokens": req.MaxTokens},
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return Response{}, err
	}
	url := fmt.Sprintf("%s/v1beta/models/%s:generateContent", c.BaseURL, req.Model)
	var last error
	for attempt := 0; attempt < 2; attempt++ {
		if attempt > 0 {
			select {
			case <-time.After(800 * time.Millisecond):
			case <-ctx.Done():
				return Response{}, ctx.Err()
			}
		}
		hreq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(raw))
		if err != nil {
			return Response{}, err
		}
		hreq.Header.Set("content-type", "application/json")
		hreq.Header.Set("x-goog-api-key", c.APIKey) // khóa nằm trong header, không nằm trong URL (tránh lọt vào log)
		resp, err := c.HTTP.Do(hreq)
		if err != nil {
			last = fmt.Errorf("gemini: kết nối lỗi")
			continue
		}
		data, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
		resp.Body.Close()
		if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
			last = &APIError{resp.StatusCode, truncate(string(data), 700)}
			continue
		}
		if resp.StatusCode != http.StatusOK {
			return Response{}, &APIError{resp.StatusCode, truncate(string(data), 700)}
		}
		return parseGemini(data)
	}
	return Response{}, last
}

// geminiDeclarations: Gemini gọi lược đồ tham số là "parameters" (Claude gọi là "input_schema").
func geminiDeclarations(tools []ToolDef) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(tools))
	for _, t := range tools {
		out = append(out, map[string]interface{}{"name": t.Name, "description": t.Description, "parameters": t.InputSchema})
	}
	return out
}

func geminiChoice(choice map[string]interface{}) map[string]interface{} {
	cfg := map[string]interface{}{"mode": "ANY"} // bắt buộc gọi công cụ ở mọi vòng
	if choice["type"] == "tool" {
		cfg["allowedFunctionNames"] = []string{fmt.Sprint(choice["name"])}
	}
	return cfg
}

// geminiContents đổi tin nhắn chung sang "contents" của Gemini. Phần model trả về được gửi lại NGUYÊN VĂN
// (Raw) để giữ thoughtSignature mà Gemini yêu cầu ở lượt sau.
func geminiContents(messages []Message) []map[string]interface{} {
	names := map[string]string{} // id lời gọi -> tên công cụ
	var out []map[string]interface{}
	for _, m := range messages {
		switch content := m.Content.(type) {
		case string:
			out = append(out, map[string]interface{}{"role": "user", "parts": []gPart{{"text": content}}})
		case []Block:
			var parts []interface{}
			for _, b := range content {
				switch b.Type {
				case "text":
					if b.Raw != nil {
						parts = append(parts, json.RawMessage(b.Raw))
					} else if b.Text != "" {
						parts = append(parts, gPart{"text": b.Text})
					}
				case "tool_use":
					names[b.ID] = b.Name
					if b.Raw != nil {
						parts = append(parts, json.RawMessage(b.Raw))
					} else {
						var args interface{} = map[string]interface{}{}
						_ = json.Unmarshal(b.Input, &args)
						parts = append(parts, gPart{"functionCall": gPart{"name": b.Name, "args": args, "id": b.ID}})
					}
				case "tool_result":
					var resp interface{}
					if json.Unmarshal([]byte(b.Content), &resp) != nil {
						resp = map[string]interface{}{"result": b.Content}
					}
					if _, isObj := resp.(map[string]interface{}); !isObj {
						resp = map[string]interface{}{"result": resp}
					}
					parts = append(parts, gPart{"functionResponse": gPart{"name": names[b.ToolUseID], "id": b.ToolUseID, "response": resp}})
				}
			}
			role := m.Role
			if role == "assistant" {
				role = "model"
			}
			out = append(out, map[string]interface{}{"role": role, "parts": parts})
		}
	}
	return out
}

func parseGemini(data []byte) (Response, error) {
	var g struct {
		Candidates []struct {
			Content struct {
				Parts []json.RawMessage `json:"parts"`
			} `json:"content"`
			FinishReason string `json:"finishReason"`
		} `json:"candidates"`
		Usage struct {
			Prompt   int `json:"promptTokenCount"`
			Output   int `json:"candidatesTokenCount"`
			Thoughts int `json:"thoughtsTokenCount"`
		} `json:"usageMetadata"`
	}
	if err := json.Unmarshal(data, &g); err != nil {
		return Response{}, err
	}
	out := Response{Usage: Usage{InputTokens: g.Usage.Prompt, OutputTokens: g.Usage.Output + g.Usage.Thoughts}}
	if len(g.Candidates) == 0 {
		return out, nil // bị chặn hoặc không có kết quả: Agent sẽ chuyển cho ban tổ chức
	}
	out.StopReason = g.Candidates[0].FinishReason
	for i, raw := range g.Candidates[0].Content.Parts {
		var p struct {
			Text         string `json:"text"`
			FunctionCall *struct {
				Name string          `json:"name"`
				Args json.RawMessage `json:"args"`
				ID   string          `json:"id"`
			} `json:"functionCall"`
			Thought bool `json:"thought"`
		}
		if json.Unmarshal(raw, &p) != nil {
			continue
		}
		switch {
		case p.FunctionCall != nil:
			id := p.FunctionCall.ID
			if id == "" {
				id = fmt.Sprintf("gem_%d_%s", i, p.FunctionCall.Name)
			}
			args := p.FunctionCall.Args
			if len(args) == 0 {
				args = json.RawMessage(`{}`)
			}
			out.Content = append(out.Content, Block{Type: "tool_use", ID: id, Name: p.FunctionCall.Name, Input: args, Raw: append(json.RawMessage(nil), raw...)})
		case p.Text != "" && !p.Thought:
			out.Content = append(out.Content, Block{Type: "text", Text: p.Text, Raw: append(json.RawMessage(nil), raw...)})
		}
	}
	return out, nil
}

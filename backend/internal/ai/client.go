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

type Message struct {
	Role    string      `json:"role"`
	Content interface{} `json:"content"`
}

type Block struct {
	Type      string          `json:"type"`
	Text      string          `json:"text,omitempty"`
	ID        string          `json:"id,omitempty"`
	Name      string          `json:"name,omitempty"`
	Input     json.RawMessage `json:"input,omitempty"`
	ToolUseID string          `json:"tool_use_id,omitempty"`
	Content   string          `json:"content,omitempty"`
	IsError   bool            `json:"is_error,omitempty"`
}

type Usage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

func (u Usage) Total() int { return u.InputTokens + u.OutputTokens }

type Request struct {
	Model      string
	MaxTokens  int
	System     string
	Tools      []ToolDef
	ToolChoice map[string]interface{}
	Messages   []Message
}

type Response struct {
	Content    []Block `json:"content"`
	StopReason string  `json:"stop_reason"`
	Usage      Usage   `json:"usage"`
}

// Completer là phần gọi model; Client thật gọi Anthropic, test dùng bản giả có kịch bản.
type Completer interface {
	Complete(ctx context.Context, req Request) (Response, error)
}

type APIError struct {
	Status int
	Body   string
}

func (e *APIError) Error() string { return fmt.Sprintf("anthropic %d: %s", e.Status, e.Body) }

// Client gọi Anthropic Messages API. BaseURL cấu hình được để thử bằng máy chủ giả.
type Client struct {
	BaseURL string
	APIKey  string
	HTTP    *http.Client
}

func NewClient(baseURL, key string) *Client {
	if baseURL == "" {
		baseURL = "https://api.anthropic.com"
	}
	return &Client{BaseURL: strings.TrimRight(baseURL, "/"), APIKey: key, HTTP: &http.Client{Timeout: 25 * time.Second}}
}

func (c *Client) Complete(ctx context.Context, req Request) (Response, error) {
	body := map[string]interface{}{
		"model":       req.Model,
		"max_tokens":  req.MaxTokens,
		"temperature": 0, // cố định để cùng câu hỏi ra cùng cách tra cứu
		// System prompt và công cụ cố định: bật prompt caching để rẻ và nhanh hơn.
		"system":      []map[string]interface{}{{"type": "text", "text": req.System, "cache_control": map[string]string{"type": "ephemeral"}}},
		"tools":       req.Tools,
		"tool_choice": req.ToolChoice,
		"messages":    req.Messages,
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return Response{}, err
	}
	var last error
	for attempt := 0; attempt < 2; attempt++ {
		if attempt > 0 {
			select {
			case <-time.After(800 * time.Millisecond):
			case <-ctx.Done():
				return Response{}, ctx.Err()
			}
		}
		hreq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/v1/messages", bytes.NewReader(raw))
		if err != nil {
			return Response{}, err
		}
		hreq.Header.Set("content-type", "application/json")
		hreq.Header.Set("x-api-key", c.APIKey)
		hreq.Header.Set("anthropic-version", "2023-06-01")
		resp, err := c.HTTP.Do(hreq)
		if err != nil {
			last = err
			continue
		}
		data, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		resp.Body.Close()
		if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
			last = &APIError{resp.StatusCode, truncate(string(data), 200)}
			continue
		}
		if resp.StatusCode != http.StatusOK {
			return Response{}, &APIError{resp.StatusCode, truncate(string(data), 200)}
		}
		var out Response
		if err := json.Unmarshal(data, &out); err != nil {
			return Response{}, err
		}
		return out, nil
	}
	return Response{}, last
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

package adapter

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"net"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"project-tuan3/internal/dto"
)

type BotRunnerAdapter interface {
	Mutate(currentTournament interface{}, action string, params map[string]interface{}) (map[string]interface{}, error)
}

type HTTPBotRunnerAdapter struct {
	workerURL string
	workers   []string
	next      atomic.Uint64
	client    *http.Client
}

func NewHTTPBotRunnerAdapter(workerURL string) *HTTPBotRunnerAdapter {
	workers := []string{}
	for _, value := range strings.Split(workerURL, ",") {
		if value = strings.TrimSpace(value); value != "" {
			workers = append(workers, value)
		}
	}
	if len(workers) == 0 {
		workers = append(workers, "http://127.0.0.1:8001/mutate-tournament")
	}
	return &HTTPBotRunnerAdapter{
		workerURL: workerURL,
		workers:   workers,
		client: &http.Client{
			Timeout: 3 * time.Minute,
			Transport: &http.Transport{
				Proxy:        http.ProxyFromEnvironment,
				DialContext:  (&net.Dialer{Timeout: 3 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
				MaxIdleConns: 64, MaxIdleConnsPerHost: 8, IdleConnTimeout: 90 * time.Second,
			},
		},
	}
}

func (a *HTTPBotRunnerAdapter) Mutate(currentTournament interface{}, action string, params map[string]interface{}) (map[string]interface{}, error) {
	reqBody := dto.MutateWorkerRequest{
		Tournament: currentTournament,
		Action:     action,
		Params:     params,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("lỗi mã hóa JSON: %w", err)
	}

	// Workers are stateless: only the gateway commits tournament/results to SQL.
	// Retry on a different worker only for transport errors or temporary overload.
	start := int((a.next.Add(1) - 1) % uint64(len(a.workers)))
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	var resp *http.Response
	for offset := 0; offset < len(a.workers); offset++ {
		url := a.workers[(start+offset)%len(a.workers)]
		var request *http.Request
		request, err = http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(jsonData))
		if err != nil {
			continue
		}
		request.Header.Set("Content-Type", "application/json")
		resp, err = a.client.Do(request)
		if err != nil {
			continue
		}
		if (resp.StatusCode == 429 || resp.StatusCode >= 500) && offset+1 < len(a.workers) {
			_, _ = ioutil.ReadAll(io.LimitReader(resp.Body, 65536))
			resp.Body.Close()
			continue
		}
		break
	}
	if err != nil {
		return nil, fmt.Errorf("không thể kết nối Game Engine Worker: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("lỗi đọc dữ liệu phản hồi: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		var errResp map[string]interface{}
		_ = json.Unmarshal(bodyBytes, &errResp)
		detail := "lỗi xử lý từ Engine Worker"
		if d, ok := errResp["detail"].(string); ok {
			detail = d
		}
		return nil, fmt.Errorf("%s (status %d)", detail, resp.StatusCode)
	}

	var successResp map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &successResp); err != nil {
		return nil, fmt.Errorf("lỗi phân giải JSON kết quả: %w", err)
	}

	return successResp, nil
}

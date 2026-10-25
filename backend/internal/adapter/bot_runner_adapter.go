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
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"project-tuan3/internal/dto"
)

type BotRunnerAdapter interface {
	Mutate(currentTournament interface{}, action string, params map[string]interface{}) (map[string]interface{}, error)
}

type WorkerEventLog struct {
	Timestamp   string `json:"timestamp"`
	WorkerIndex int    `json:"worker_index"`
	WorkerName  string `json:"worker_name"`
	WorkerHost  string `json:"worker_host"`
	Action      string `json:"action"`
	Detail      string `json:"detail"`
	DurationMs  int64  `json:"duration_ms"`
	Success     bool   `json:"success"`
}

type HTTPBotRunnerAdapter struct {
	workerURL        string
	workers          []string
	next             atomic.Uint64
	client           *http.Client
	slots            chan struct{}
	poolMu           sync.Mutex
	active           []int
	dispatched       []uint64
	finished         []uint64
	failed           []uint64
	qualifierGames   []uint64
	totalDurationMs  []int64
	recentLogs       []WorkerEventLog
	reportedCapacity []int
	cooldown         []time.Time
	perWorker        int
	token            string
	attemptTimeout   time.Duration
	expectedRelease  string
}

func NewHTTPBotRunnerAdapter(workerURL string) *HTTPBotRunnerAdapter {
	concurrency, _ := strconv.Atoi(os.Getenv("JUDGE_CONCURRENCY"))
	perWorker, _ := strconv.Atoi(os.Getenv("WORKER_CONCURRENCY"))
	if perWorker < 1 || perWorker > 8 {
		perWorker = 1
	}
	workers := []string{}
	seen := map[string]bool{}
	for _, value := range strings.Split(workerURL, ",") {
		if value = strings.TrimSpace(value); value != "" {
			if !seen[value] {
				workers = append(workers, value)
				seen[value] = true
			}
		}
	}
	if len(workers) == 0 {
		workers = append(workers, "http://127.0.0.1:8001/mutate-tournament")
	}
	if concurrency < 1 || concurrency > 32 {
		concurrency = min(32, len(workers)*perWorker)
	}
	timeout, _ := strconv.Atoi(os.Getenv("WORKER_ATTEMPT_TIMEOUT_SECONDS"))
	if timeout < 1 || timeout > 180 {
		timeout = 90
	}
	return &HTTPBotRunnerAdapter{
		totalDurationMs: make([]int64, len(workers)),
		recentLogs:      make([]WorkerEventLog, 0, 50),
		active:          make([]int, len(workers)), cooldown: make([]time.Time, len(workers)),
		dispatched: make([]uint64, len(workers)), finished: make([]uint64, len(workers)), failed: make([]uint64, len(workers)), qualifierGames: make([]uint64, len(workers)),
		reportedCapacity: make([]int, len(workers)),
		perWorker:        perWorker, token: os.Getenv("WORKER_TOKEN"), attemptTimeout: time.Duration(timeout) * time.Second,
		expectedRelease: os.Getenv("WORKER_RELEASE"),
		slots:           make(chan struct{}, concurrency),
		workerURL:       workerURL,
		workers:         workers,
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

func (a *HTTPBotRunnerAdapter) recordEventLog(entry WorkerEventLog) {
	a.poolMu.Lock()
	defer a.poolMu.Unlock()
	if len(a.recentLogs) >= 40 {
		a.recentLogs = a.recentLogs[1:]
	}
	a.recentLogs = append(a.recentLogs, entry)
	if entry.WorkerIndex >= 0 && entry.WorkerIndex < len(a.totalDurationMs) {
		a.totalDurationMs[entry.WorkerIndex] += entry.DurationMs
	}
}

func formatActionDetail(action string, params map[string]interface{}) string {
	switch action {
	case "play-round", "next-round":
		if m, ok := params["match_id"].(string); ok && m != "" {
			return "Chấm trận đấu " + m
		}
		return "Chấm lượt thi đấu chính thức"
	case "qualifier-game":
		if seed, ok := params["seed"].(string); ok && seed != "" {
			return "Trận đấu vòng loại (Mã: " + seed + ")"
		}
		return "Trận đấu vòng loại song song"
	case "ai-suite":
		return "Chấm mô hình Giải AI"
	case "ai-task-suite", "validate-task-code", "ai-task-data", "ai-task-probe", "ai-task-roll", "ai-task-public", "ai-task-bank":
		return "Giải AI: kho đề học từ thế cờ (" + action + ")"
	case "validate-code":
		if lang, ok := params["language"].(string); ok && lang != "" {
			return "Kiểm duyệt cú pháp & sandbox (" + lang + ")"
		}
		return "Kiểm duyệt mã nguồn bot"
	case "practice-match":
		return "Trận đấu tập tự do (Practice)"
	case "demo-fill":
		return "Sinh mã bot thi đấu ngẫu nhiên"
	case "submit-code":
		return "Nộp và lưu trữ mã nguồn bot"
	default:
		return "Tác vụ: " + action
	}
}

func (a *HTTPBotRunnerAdapter) Mutate(currentTournament interface{}, action string, params map[string]interface{}) (map[string]interface{}, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	select {
	case a.slots <- struct{}{}:
		defer func() { <-a.slots }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}
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
	tried := map[int]bool{}
	var resp *http.Response
	var bodyBytes []byte
	for offset := 0; offset < len(a.workers); offset++ {
		index, acquireErr := a.acquireWorker(ctx, tried)
		if acquireErr != nil {
			return nil, acquireErr
		}
		tried[index] = true
		if action == "qualifier-game" || action == "ai-suite" || action == "ai-task-suite" {
			a.poolMu.Lock()
			a.qualifierGames[index]++
			a.poolMu.Unlock()
		}
		startedAt := time.Now()
		finishAttempt := func(failed bool) {
			a.releaseWorker(index, failed)
			host := ""
			if address, parseErr := url.Parse(a.workers[index]); parseErr == nil {
				host = address.Host
			}
			a.recordEventLog(WorkerEventLog{
				Timestamp: time.Now().Format(time.RFC3339), WorkerIndex: index,
				WorkerName: fmt.Sprintf("Máy chấm %d", index+1), WorkerHost: host,
				Action: action, Detail: formatActionDetail(action, params),
				DurationMs: time.Since(startedAt).Milliseconds(), Success: !failed,
			})
		}
		url := a.workers[index]
		attemptCtx, attemptCancel := context.WithTimeout(ctx, a.attemptTimeout)
		var request *http.Request
		request, err = http.NewRequestWithContext(attemptCtx, http.MethodPost, url, bytes.NewReader(jsonData))
		if err != nil {
			attemptCancel()
			finishAttempt(true)
			continue
		}
		request.Header.Set("Content-Type", "application/json")
		if a.token != "" {
			request.Header.Set("X-Worker-Token", a.token)
		}
		resp, err = a.client.Do(request)
		if err != nil {
			attemptCancel()
			finishAttempt(true)
			continue
		}
		if a.expectedRelease != "" && resp.Header.Get("X-Arena-Release") != a.expectedRelease {
			_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 65536))
			resp.Body.Close()
			attemptCancel()
			finishAttempt(true)
			err = fmt.Errorf("worker release mismatch; refusing result")
			continue
		}
		a.observeCapacity(index, resp.Header.Get("X-Worker-Capacity"))
		if (resp.StatusCode == 429 || resp.StatusCode >= 500) && offset+1 < len(a.workers) {
			_, _ = ioutil.ReadAll(io.LimitReader(resp.Body, 65536))
			resp.Body.Close()
			attemptCancel()
			finishAttempt(true)
			continue
		}
		// Read before releasing the slot: headers alone do not mean the judge
		// finished delivering a result. A broken body can fail over as well.
		bodyBytes, err = io.ReadAll(io.LimitReader(resp.Body, 64*1024*1024+1))
		resp.Body.Close()
		attemptCancel()
		if err == nil && len(bodyBytes) > 64*1024*1024 {
			err = fmt.Errorf("worker response exceeds 64 MiB")
		}
		if err == nil && resp.StatusCode == http.StatusOK && !json.Valid(bodyBytes) {
			err = fmt.Errorf("worker returned invalid JSON")
		}
		finishAttempt(err != nil || resp.StatusCode == 429 || resp.StatusCode >= 500)
		if err != nil {
			continue
		}
		break
	}
	if err != nil {
		return nil, fmt.Errorf("không thể kết nối Game Engine Worker: %w", err)
	}
	if resp == nil {
		return nil, fmt.Errorf("no worker response")
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

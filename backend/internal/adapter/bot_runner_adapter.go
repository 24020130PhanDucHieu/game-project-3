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

type HTTPBotRunnerAdapter struct {
	workerURL       string
	workers         []string
	next            atomic.Uint64
	client          *http.Client
	slots           chan struct{}
	poolMu          sync.Mutex
	active          []int
	cooldown        []time.Time
	perWorker       int
	token           string
	attemptTimeout  time.Duration
	expectedRelease string
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
		active: make([]int, len(workers)), cooldown: make([]time.Time, len(workers)),
		perWorker: perWorker, token: os.Getenv("WORKER_TOKEN"), attemptTimeout: time.Duration(timeout) * time.Second,
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
		url := a.workers[index]
		attemptCtx, attemptCancel := context.WithTimeout(ctx, a.attemptTimeout)
		var request *http.Request
		request, err = http.NewRequestWithContext(attemptCtx, http.MethodPost, url, bytes.NewReader(jsonData))
		if err != nil {
			attemptCancel()
			a.releaseWorker(index, true)
			continue
		}
		request.Header.Set("Content-Type", "application/json")
		if a.token != "" {
			request.Header.Set("X-Worker-Token", a.token)
		}
		resp, err = a.client.Do(request)
		if err != nil {
			attemptCancel()
			a.releaseWorker(index, true)
			continue
		}
		if a.expectedRelease != "" && resp.Header.Get("X-Arena-Release") != a.expectedRelease {
			_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 65536))
			resp.Body.Close()
			attemptCancel()
			a.releaseWorker(index, true)
			err = fmt.Errorf("worker release mismatch; refusing result")
			continue
		}
		if (resp.StatusCode == 429 || resp.StatusCode >= 500) && offset+1 < len(a.workers) {
			_, _ = ioutil.ReadAll(io.LimitReader(resp.Body, 65536))
			resp.Body.Close()
			attemptCancel()
			a.releaseWorker(index, true)
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
		a.releaseWorker(index, err != nil || resp.StatusCode == 429 || resp.StatusCode >= 500)
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

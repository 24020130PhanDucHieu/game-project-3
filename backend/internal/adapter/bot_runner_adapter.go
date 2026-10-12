package adapter

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"time"

	"project-tuan3/internal/dto"
)

type BotRunnerAdapter interface {
	Mutate(currentTournament interface{}, action string, params map[string]interface{}) (map[string]interface{}, error)
}

type HTTPBotRunnerAdapter struct {
	workerURL string
	client    *http.Client
}

func NewHTTPBotRunnerAdapter(workerURL string) *HTTPBotRunnerAdapter {
	return &HTTPBotRunnerAdapter{
		workerURL: workerURL,
		client: &http.Client{
			Timeout: 3 * time.Minute,
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

	resp, err := a.client.Post(a.workerURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("không thể kết nối Game Engine Worker tại %s: %w", a.workerURL, err)
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

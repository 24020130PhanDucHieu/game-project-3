package adapter

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
)

// Require all configured workers to pass so a broken pool member is visible.
func (a *HTTPBotRunnerAdapter) Ready(ctx context.Context) error {
	for _, address := range a.workers {
		u, err := url.Parse(address)
		if err != nil {
			return err
		}
		u.Path, u.RawQuery = "/health", ""
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
		if err != nil {
			return err
		}
		res, err := a.client.Do(req)
		if err != nil {
			return err
		}
		var body struct {
			Status string `json:"status"`
		}
		err = json.NewDecoder(io.LimitReader(res.Body, 8192)).Decode(&body)
		res.Body.Close()
		if err != nil || res.StatusCode != 200 || body.Status != "HEALTHY" {
			return errors.New("worker not ready")
		}
	}
	return nil
}

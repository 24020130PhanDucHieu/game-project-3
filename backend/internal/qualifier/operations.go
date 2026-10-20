package qualifier

import (
	"errors"
)

// Pause at the next round boundary, preserving the atomic rating batch.
func (s *Service) Pause(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, err := s.Event(id)
	if err != nil {
		return err
	}
	if e.Status != "RUNNING" {
		return errors.New("Chỉ tạm dừng vòng loại đang chạy.")
	}
	e.PauseRequested = true
	return s.Store.Batch(map[string]interface{}{metaKey(id): e})
}

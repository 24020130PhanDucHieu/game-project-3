package qualifier

import (
	"errors"
	"strings"
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

// Reopen only before any competitive job exists. Previously valid bots remain
// valid; all entrants receive the same new deadline and unlocked eligibility.
func (s *Service) Reopen(id string, deadline float64, reason string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if deadline <= now() || strings.TrimSpace(reason) == "" || len(reason) > 500 {
		return errors.New("Chọn hạn mới trong tương lai và ghi lý do gia hạn (tối đa 500 ký tự).")
	}
	release, err := s.Store.Lease(id)
	if err != nil {
		return err
	}
	defer release()
	e, err := s.Event(id)
	if err != nil {
		return err
	}
	if (e.Status != "OPEN" && e.Status != "CLOSING" && e.Status != "LOCKED") || e.CurrentRound != 0 || e.AppliedRound != 0 || e.Total != 0 || e.Completed != 0 || deadline <= e.Deadline {
		return errors.New("Chỉ gia hạn trước khi thi đấu; hạn mới phải muộn hơn hạn cũ.")
	}
	jobs, err := s.Store.List("job:" + id + ":")
	if err != nil {
		return err
	}
	if len(jobs) > 0 {
		return errors.New("Vòng loại đã ghép cặp; không mở lại bài nộp.")
	}
	people, err := s.ParticipantSummaries(id)
	if err != nil {
		return err
	}
	rows := map[string]interface{}{}
	for sid, p := range people {
		if p.LockedID != "" {
			p.LockedID = ""
			rows[participantKey(id, sid)] = p
		}
	}
	rows["audit:qualifier-reopen:"+uniqueID()] = map[string]interface{}{"at": now(), "event_id": id, "old_deadline": e.Deadline, "new_deadline": deadline, "reason": strings.TrimSpace(reason), "actor": "ADMIN"}
	e.Status, e.Deadline, e.Eligible, e.Error = "OPEN", deadline, 0, ""
	rows[metaKey(id)] = e
	return s.Store.BatchPreservingParticipantCode(rows)
}

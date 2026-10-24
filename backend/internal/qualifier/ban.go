package qualifier

import (
	"database/sql"
	"errors"
	"strings"
)

// SetBanned loại (hoặc bỏ loại) một đội khỏi vòng loại. Đội bị loại không được ghép cặp,
// không có trong bảng xếp hạng và không nộp thêm bài; lịch sử bài nộp và kết quả cũ vẫn được giữ.
func (s *Service) SetBanned(id, sid string, banned bool, reason string) error {
	sid = strings.ToUpper(strings.TrimSpace(sid))
	reason = strings.TrimSpace(reason)
	if sid == "" {
		return reject("Chọn đội cần thao tác.")
	}
	if banned && reason == "" {
		return reject("Hãy ghi lý do loại đội.")
	}
	if len(reason) > 300 {
		reason = reason[:300]
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	release, err := s.Store.Lease(id)
	if err != nil {
		return err
	}
	defer release()
	var p Participant
	if err := s.Store.Get(participantKey(id, sid), &p); errors.Is(err, sql.ErrNoRows) {
		return reject("Đội này chưa đăng ký vòng loại.")
	} else if err != nil {
		return err
	}
	p.Banned = banned
	p.BanReason = ""
	if banned {
		p.BanReason = reason
	}
	return s.Store.Batch(map[string]interface{}{participantKey(id, sid): p})
}

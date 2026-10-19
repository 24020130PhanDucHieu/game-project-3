package qualifier

import (
	"errors"
	"fmt"
)

// Register reserves one place without submitting code or creating an account.
func (s *Service) Register(id, sid string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, err := s.Event(id)
	if err != nil {
		return err
	}
	account, err := s.Accounts.Get(sid)
	if err != nil || account.Deleted {
		return errors.New("Tài khoản không hợp lệ.")
	}
	people, err := s.Participants(id)
	if err != nil {
		return err
	}
	if _, exists := people[sid]; exists {
		return nil
	}
	if e.Status != "OPEN" || now() >= e.Deadline {
		return errors.New("Vòng loại đã đóng đăng ký.")
	}
	if len(people) >= 4000 {
		return errors.New("Vòng loại đã đủ 4.000 đội.")
	}
	return s.Store.Batch(map[string]interface{}{participantKey(id, sid): Participant{SID: sid, Name: account.TeamName, Elo: 1200}})
}

// Test bots are explicit event-only fixtures; they never create login accounts.
func (s *Service) GenerateTestBots(id string, count int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	release, err := s.Store.Lease(id)
	if err != nil {
		return err
	}
	defer release()
	e, err := s.Event(id)
	if err != nil {
		return err
	}
	if e.Status != "OPEN" || now() >= e.Deadline {
		return errors.New("Chỉ tạo bot khi vòng loại còn nhận đăng ký.")
	}
	people, err := s.Participants(id)
	if err != nil {
		return err
	}
	if count < 1 || count > 4000 || len(people)+count > 4000 {
		return errors.New("Số bot từ 1 đến 4.000; tổng số đội không vượt quá 4.000.")
	}
	rows := map[string]interface{}{}
	batch := uniqueID()
	for i := 0; i < count; i++ {
		sid := fmt.Sprintf("TEST-%s-%04d", batch, i+1)
		code := fmt.Sprintf("def decide_move(game_state):\n    return '%s'\n", []string{"ROCK", "PAPER", "SCISSORS"}[i%3])
		sub := Submission{ID: uniqueID(), Code: code, Language: "PYTHON", Valid: true, At: now()}
		p := Participant{SID: sid, Name: fmt.Sprintf("Bot thử nghiệm %d", len(people)+i+1), TestBot: true, Elo: 1200, Code: code, Language: "PYTHON", ValidID: sub.ID, SubmittedAt: sub.At}
		rows[participantKey(id, sid)] = p
		rows["submission:"+id+":"+sid+":"+sub.ID] = sub
	}
	return s.Store.Batch(rows)
}

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

// testBotSolve là các mô hình thử nghiệm tối giản cho vòng loại kho đề: lớp phổ biến nhất, lớp 0, giá trị trung vị / trung bình.
var testBotSolve = []string{
	"def solve(task):\n    y = task[\"train\"][\"y\"]\n    n = len(task[\"test\"][\"X\"])\n    if task[\"meta\"][\"regression\"]:\n        return [sum(y) / len(y)] * n\n    best = max(set(y), key=y.count)\n    return [best] * n\n",
	"def solve(task):\n    n = len(task[\"test\"][\"X\"])\n    if task[\"meta\"][\"regression\"]:\n        y = task[\"train\"][\"y\"]\n        return [sorted(y)[len(y) // 2]] * n\n    return [0] * n\n",
	"def solve(task):\n    n = len(task[\"test\"][\"X\"])\n    if task[\"meta\"][\"regression\"]:\n        y = task[\"train\"][\"y\"]\n        return [sum(y) / len(y)] * n\n    k = task[\"meta\"][\"n_classes\"]\n    return [i % k for i in range(n)]\n",
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
		if e.Mode == ModeTasks {
			// Vòng loại kho đề chấm hàm solve(task): bot thử nghiệm phải có solve hợp lệ (dự đoán đơn giản).
			code = testBotSolve[i%len(testBotSolve)]
		}
		sub := Submission{ID: uniqueID(), Code: code, Language: "PYTHON", Valid: true, At: now()}
		p := Participant{SID: sid, Name: fmt.Sprintf("Bot thử nghiệm %d", len(people)+i+1), TestBot: true, Elo: 1200, Code: code, Language: "PYTHON", ValidID: sub.ID, SubmittedAt: sub.At}
		rows[participantKey(id, sid)] = p
		rows["submission:"+id+":"+sid+":"+sub.ID] = sub
	}
	return s.Store.Batch(rows)
}

// AdminRegister cho ban tổ chức ghi danh một tài khoản vào vòng loại. ai=true nghĩa là đích phải là vòng loại Giải AI,
// ai=false là vòng loại thường: không cho ghi danh nhầm loại. Chỉ khi còn nhận bài (chưa khóa bài).
// Trả về sự kiện và số đội sau khi ghi danh.
func (s *Service) AdminRegister(id, sid string, ai bool) (Event, int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, err := s.Event(id)
	if err != nil {
		return e, 0, err
	}
	if (e.Kind == KindAI) != ai {
		if ai {
			return e, 0, errors.New("Đây là vòng loại thường, không phải vòng loại Giải AI.")
		}
		return e, 0, errors.New("Đây là vòng loại Giải AI, hãy chọn loại đích “Vòng loại Giải AI”.")
	}
	account, err := s.Accounts.Get(sid)
	if err != nil || account.Deleted {
		return e, 0, errors.New("Tài khoản không hợp lệ.")
	}
	if e.Status != "OPEN" && e.Status != "CLOSING" {
		return e, 0, errors.New("Vòng loại đã khóa bài hoặc đã chạy, không ghi danh thêm được. Hãy dùng “Gia hạn / mở lại” trước.")
	}
	people, err := s.Participants(id)
	if err != nil {
		return e, 0, err
	}
	if _, exists := people[sid]; exists {
		return e, len(people), errors.New("Đội này đã có trong vòng loại.")
	}
	if len(people) >= 4000 {
		return e, len(people), errors.New("Vòng loại đã đủ 4.000 đội.")
	}
	if err := s.Store.Batch(map[string]interface{}{participantKey(id, sid): Participant{SID: sid, Name: account.TeamName, Elo: 1200}}); err != nil {
		return e, 0, err
	}
	s.signal(id)
	return e, len(people) + 1, nil
}

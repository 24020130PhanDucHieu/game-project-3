package qualifier

import (
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
)

// Chế độ vòng loại AI bốc đề từ kho: bộ đề (kèm hạt giống) lưu ở khóa riêng chỉ quản trị đọc được.
const ModeTasks = "TASKS"

// TaskPlan là bộ đề của một vòng loại. Items giữ nguyên các mục worker trả về (có hạt giống), Public là phần được công khai.
type TaskPlan struct {
	Items     []map[string]interface{} `json:"items"`
	Locked    bool                     `json:"locked"`
	Seed      string                   `json:"seed"`
	UpdatedAt float64                  `json:"updated_at"`
}

func planKey(id string) string { return "aitasks:" + id }

// BankSource cho biết các đề do admin thêm và danh sách đề dựng sẵn bị tắt (để worker bốc đúng kho hiện tại).
type BankSource interface {
	BankInputs() (custom []interface{}, disabled []string, err error)
}

func (s *Service) Plan(id string) (TaskPlan, error) {
	var plan TaskPlan
	err := s.Store.Get(planKey(id), &plan)
	if errors.Is(err, sql.ErrNoRows) {
		return TaskPlan{}, nil
	}
	return plan, err
}

func (s *Service) aiTaskEvent(id string) (Event, error) {
	e, err := s.Event(id)
	if err != nil {
		return e, err
	}
	if e.Kind != KindAI || e.Mode != ModeTasks {
		return e, errors.New("Vòng loại này không dùng kho đề.")
	}
	return e, nil
}

// RollTasks bốc ngẫu nhiên bộ đề (cả bộ, hoặc một vị trí `index` khi >= 0) từ kho. Chỉ khi vòng loại còn nhận bài và chưa khóa đề.
func (s *Service) RollTasks(id string, tags []string, difficulties []int, index int) (TaskPlan, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, err := s.aiTaskEvent(id)
	if err != nil {
		return TaskPlan{}, err
	}
	if e.Status != "OPEN" || e.TasksLocked {
		return TaskPlan{}, errors.New("Chỉ bốc lại đề khi vòng loại còn nhận bài và đề chưa khóa.")
	}
	plan, err := s.Plan(id)
	if err != nil {
		return plan, err
	}
	custom, disabled := []interface{}{}, []string{}
	if s.Bank != nil {
		if custom, disabled, err = s.Bank.BankInputs(); err != nil {
			return plan, err
		}
	}
	params := map[string]interface{}{"count": e.TaskCount, "seed": uniqueID(), "custom": custom, "disabled": disabled, "ramp": true}
	if len(tags) > 0 {
		params["tags"] = tags
	}
	if len(difficulties) > 0 {
		params["difficulties"] = difficulties
	}
	if index >= 0 {
		if index >= len(plan.Items) {
			return plan, errors.New("Vị trí đề không tồn tại. Hãy bốc cả bộ trước.")
		}
		exclude := []string{}
		for _, it := range plan.Items {
			if name, _ := it["entry_id"].(string); name != "" {
				exclude = append(exclude, name)
			}
		}
		params["count"], params["ramp"], params["exclude"] = 1, false, exclude
	}
	result, err := s.Engine.Mutate(nil, "ai-task-roll", params)
	if err != nil {
		return plan, err
	}
	raw, _ := result["plan"].([]interface{})
	items := []map[string]interface{}{}
	for _, v := range raw {
		if m, ok := v.(map[string]interface{}); ok {
			items = append(items, m)
		}
	}
	if len(items) == 0 {
		return plan, errors.New("Máy chấm không trả về đề nào.")
	}
	if index >= 0 {
		replaced := append([]map[string]interface{}{}, plan.Items...)
		items[0]["n"] = float64(index)
		replaced[index] = items[0]
		plan.Items = replaced
	} else {
		plan.Items = items
	}
	for i := range plan.Items {
		plan.Items[i]["n"] = float64(i)
	}
	plan.Seed, plan.UpdatedAt, plan.Locked = fmt.Sprint(params["seed"]), now(), false
	return plan, s.Store.Batch(map[string]interface{}{planKey(id): plan})
}

// LockTasks khóa bộ đề: từ đây đội nộp bài, khóa bài và chạy được.
func (s *Service) LockTasks(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, err := s.aiTaskEvent(id)
	if err != nil {
		return err
	}
	if e.Status != "OPEN" {
		return errors.New("Chỉ khóa đề khi vòng loại còn nhận bài.")
	}
	plan, err := s.Plan(id)
	if err != nil {
		return err
	}
	if len(plan.Items) != e.TaskCount {
		return fmt.Errorf("Cần bốc đủ %d đề trước khi khóa (hiện có %d).", e.TaskCount, len(plan.Items))
	}
	plan.Locked, e.TasksLocked = true, true
	return s.Store.Batch(map[string]interface{}{planKey(id): plan, metaKey(id): e})
}

// UnlockTasks mở khóa để bốc lại; chỉ được khi chưa đội nào nộp bài (bài đã nộp được kiểm tra theo bộ đề cũ).
func (s *Service) UnlockTasks(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, err := s.aiTaskEvent(id)
	if err != nil {
		return err
	}
	if e.Status != "OPEN" {
		return errors.New("Vòng loại đã khóa bài; không mở khóa đề được nữa.")
	}
	people, err := s.ParticipantSummaries(id)
	if err != nil {
		return err
	}
	for _, p := range people {
		if p.SubmittedAt > 0 && !p.TestBot {
			return errors.New("Đã có đội nộp bài theo bộ đề này nên không mở khóa được.")
		}
	}
	plan, err := s.Plan(id)
	if err != nil {
		return err
	}
	plan.Locked, e.TasksLocked = false, false
	return s.Store.Batch(map[string]interface{}{planKey(id): plan, metaKey(id): e})
}

// PublicTasks là bộ đề không kèm hạt giống; đội chỉ thấy sau khi khóa, quản trị thấy cả bản nháp.
func (s *Service) PublicTasks(id string, organizer bool) ([]map[string]interface{}, bool, error) {
	e, err := s.aiTaskEvent(id)
	if err != nil {
		return nil, false, err
	}
	plan, err := s.Plan(id)
	if err != nil {
		return nil, false, err
	}
	if !plan.Locked && !organizer {
		return []map[string]interface{}{}, false, nil
	}
	if len(plan.Items) == 0 {
		return []map[string]interface{}{}, plan.Locked && e.TasksLocked, nil
	}
	result, err := s.Engine.Mutate(nil, "ai-task-public", map[string]interface{}{"items": plan.Items})
	if err != nil {
		return nil, false, err
	}
	list, _ := result["public"].([]interface{})
	out := []map[string]interface{}{}
	for _, v := range list {
		if m, ok := v.(map[string]interface{}); ok {
			out = append(out, m)
		}
	}
	return out, plan.Locked, nil
}

// TaskItem trả mục đề thứ n (kèm hạt giống) cho việc sinh dữ liệu và chấm; chỉ dùng phía máy chủ.
func (s *Service) TaskItem(id string, n int) (map[string]interface{}, error) {
	plan, err := s.Plan(id)
	if err != nil {
		return nil, err
	}
	if !plan.Locked || n < 0 || n >= len(plan.Items) {
		return nil, errors.New("Không có đề này (hoặc đề chưa được công bố).")
	}
	return plan.Items[n], nil
}

func (s *Service) taskItems(id string) ([]map[string]interface{}, error) {
	plan, err := s.Plan(id)
	if err != nil {
		return nil, err
	}
	return plan.Items, nil
}

// distinctTemplateItems giữ một mục cho mỗi mẫu đề: kiểm tra mã nộp chỉ cần chạy thử trên từng dạng.
func distinctTemplateItems(items []map[string]interface{}) []map[string]interface{} {
	seen := map[string]bool{}
	out := []map[string]interface{}{}
	for _, it := range items {
		t, _ := it["template"].(string)
		if !seen[t] {
			seen[t] = true
			out = append(out, it)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return fmt.Sprint(out[i]["template"]) < fmt.Sprint(out[j]["template"]) })
	return out
}

func isTasks(e Event) bool { return e.Kind == KindAI && strings.EqualFold(e.Mode, ModeTasks) }


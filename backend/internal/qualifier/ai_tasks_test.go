package qualifier

import (
	"fmt"
	"strings"
	"testing"
)

// taskAction mô phỏng các action kho đề của máy chấm cho bài kiểm tra Go.
func (e *aiEngine) taskAction(action string, params map[string]interface{}) (bool, map[string]interface{}) {
	switch action {
	case "ai-task-roll":
		count, _ := params["count"].(int)
		exclude, _ := params["exclude"].([]string)
		items := []interface{}{}
		for i := 0; i < count; i++ {
			id := fmt.Sprintf("entry-%d-%d", i, e.rolls.Add(1))
			for _, x := range exclude {
				if x == id {
					id += "x"
				}
			}
			items = append(items, map[string]interface{}{"n": float64(i), "entry_id": id, "template": []string{"winner", "nextcard", "material"}[i%3],
				"difficulty": float64(1 + i%3), "seed": "s" + id, "params": map[string]interface{}{}})
		}
		e.lastRoll = params
		return true, map[string]interface{}{"plan": items}
	case "ai-task-public":
		out := []interface{}{}
		for i, v := range params["items"].([]map[string]interface{}) {
			out = append(out, map[string]interface{}{"n": i, "id": v["entry_id"], "name": fmt.Sprintf("Đề %d", i+1)})
		}
		return true, map[string]interface{}{"public": out}
	case "validate-task-code":
		if code, _ := params["code"].(string); strings.Contains(code, "badsolve") {
			return true, map[string]interface{}{"is_valid": false, "error_message": "solve lỗi"}
		}
		return true, map[string]interface{}{"is_valid": true}
	case "ai-task-suite":
		e.calls.Add(1)
		code, _ := params["code"].(string)
		if strings.Contains(code, "broken") {
			return true, map[string]interface{}{"error": "Import module bị cấm"}
		}
		var base float64
		for _, field := range strings.Fields(code) {
			if strings.HasPrefix(field, "score=") {
				for _, r := range strings.TrimPrefix(field, "score=") {
					base = base*10 + float64(r-'0')
				}
			}
		}
		tasks := []interface{}{}
		for i := range params["items"].([]map[string]interface{}) {
			tasks = append(tasks, map[string]interface{}{"n": float64(i), "public": base, "private": base - 4, "error": nil})
		}
		return true, map[string]interface{}{"tasks": tasks, "public_score": base, "private_score": base - 4, "errors": []interface{}{"Đề 2: Time Limit Exceeded (8.0s)"}, "elapsed_ms": 900.0}
	}
	return false, nil
}

func tasksFixture(t *testing.T, codes map[string]string, locked bool) (*Service, *aiEngine, Event) {
	t.Helper()
	s, engine, e := aiFixture(t, codes)
	e.Mode, e.TaskCount, e.TasksLocked, e.Status, e.Deadline = ModeTasks, 3, locked, "OPEN", now()+3600
	rows := map[string]interface{}{metaKey(e.ID): e}
	if locked {
		items := []map[string]interface{}{}
		for i := 0; i < 3; i++ {
			items = append(items, map[string]interface{}{"n": float64(i), "entry_id": fmt.Sprintf("e%d", i), "template": []string{"winner", "nextcard", "material"}[i], "seed": "x"})
		}
		rows[planKey(e.ID)] = TaskPlan{Items: items, Locked: true}
	}
	if err := s.Store.Batch(rows); err != nil {
		t.Fatal(err)
	}
	return s, engine, e
}

func TestTasksRollLockUnlockRules(t *testing.T) {
	s, engine, e := tasksFixture(t, map[string]string{"A": "score=70"}, false)
	if _, err := s.RollTasks(e.ID, []string{"luật"}, []int{1, 2}, -1); err != nil {
		t.Fatal(err)
	}
	if engine.lastRoll["count"] != 3 || engine.lastRoll["tags"] == nil || engine.lastRoll["difficulties"] == nil {
		t.Fatal("bộ lọc và số đề phải chuyển cho máy chấm", engine.lastRoll)
	}
	plan, _ := s.Plan(e.ID)
	if len(plan.Items) != 3 || plan.Locked {
		t.Fatal(plan)
	}
	first := fmt.Sprint(plan.Items[1]["entry_id"])
	if _, err := s.RollTasks(e.ID, nil, nil, 1); err != nil {
		t.Fatal(err)
	}
	again, _ := s.Plan(e.ID)
	if len(again.Items) != 3 || fmt.Sprint(again.Items[1]["entry_id"]) == first || fmt.Sprint(again.Items[0]["entry_id"]) != fmt.Sprint(plan.Items[0]["entry_id"]) || again.Items[1]["n"] != float64(1) {
		t.Fatal("chỉ đề thứ 2 được bốc lại", plan.Items, again.Items)
	}
	if _, err := s.RollTasks(e.ID, nil, nil, 9); err == nil {
		t.Fatal("vị trí ngoài bộ đề phải bị từ chối")
	}
	if err := s.LockTasks(e.ID); err != nil {
		t.Fatal(err)
	}
	if ev, _ := s.Event(e.ID); !ev.TasksLocked {
		t.Fatal("sự kiện phải đánh dấu đã khóa đề")
	}
	if _, err := s.RollTasks(e.ID, nil, nil, -1); err == nil {
		t.Fatal("đã khóa đề thì không bốc lại được")
	}
	// Đội đã nộp bài thì không mở khóa được.
	p := Participant{SID: "A", Name: "A", SubmittedAt: 5}
	s.Store.Batch(map[string]interface{}{participantKey(e.ID, "A"): p})
	if err := s.UnlockTasks(e.ID); err == nil {
		t.Fatal("không mở khóa khi đã có bài nộp")
	}
}

func TestTasksLockNeedsFullPlanAndPublicHiddenUntilLocked(t *testing.T) {
	s, _, e := tasksFixture(t, nil, false)
	if err := s.LockTasks(e.ID); err == nil {
		t.Fatal("chưa bốc đề thì không khóa được")
	}
	s.RollTasks(e.ID, nil, nil, -1)
	if list, locked, _ := s.PublicTasks(e.ID, false); len(list) != 0 || locked {
		t.Fatal("đội không được thấy đề khi chưa khóa", list)
	}
	if list, _, _ := s.PublicTasks(e.ID, true); len(list) != 3 {
		t.Fatal("ban tổ chức xem được bản nháp", list)
	}
	if err := s.LockTasks(e.ID); err != nil {
		t.Fatal(err)
	}
	list, locked, _ := s.PublicTasks(e.ID, false)
	if len(list) != 3 || !locked {
		t.Fatal("sau khi khóa đội thấy đề")
	}
	for _, public := range list {
		if _, leaked := public["seed"]; leaked {
			t.Fatal("hạt giống không được công khai")
		}
	}
	if _, err := s.TaskItem(e.ID, 3); err == nil {
		t.Fatal("đề ngoài bộ phải báo lỗi")
	}
}

func TestTasksSubmissionNeedsLockAndValidatesEveryTemplate(t *testing.T) {
	s, _, e := tasksFixture(t, map[string]string{"A": "x"}, false)
	if _, err := s.EnqueueSubmission(e.ID, "A", "def solve(task): return []", "PYTHON", ""); err == nil || !strings.Contains(err.Error(), "chưa khóa") {
		t.Fatal("chưa khóa đề phải chặn nộp bài", err)
	}
	s2, _, e2 := tasksFixture(t, nil, true)
	ok, _ := s2.validateSubmission(e2.ID, Submission{Code: "def solve(task): return []", Language: "PYTHON"})
	if v, _ := ok["is_valid"].(bool); !v {
		t.Fatal(ok)
	}
	bad, _ := s2.validateSubmission(e2.ID, Submission{Code: "badsolve", Language: "PYTHON"})
	if v, _ := bad["is_valid"].(bool); v || bad["error_message"] != "solve lỗi" {
		t.Fatal(bad)
	}
}

func TestTasksRunnerAggregatesPerTaskScores(t *testing.T) {
	s, engine, e := tasksFixture(t, map[string]string{"A": "score=70", "B": "score=90", "C": "broken"}, true)
	e.Status, e.Rounds, e.Eligible = "RUNNING", 2, 3
	s.Store.Batch(map[string]interface{}{metaKey(e.ID): e})
	if err := s.run(e.ID); err != nil {
		t.Fatal(err)
	}
	done, _ := s.Event(e.ID)
	if done.Status != "FINISHED" || done.AppliedRound != 2 || engine.calls.Load() != 6 {
		t.Fatal(done, engine.calls.Load())
	}
	people, _ := s.Participants(e.ID)
	if b := people["B"]; b.AIRounds != 2 || b.AIPublic != 90 || b.AIPrivate != 86 || b.AIReading != 86 || b.Code != "score=90" {
		t.Fatalf("%+v", b)
	}
	if c := people["C"]; c.AIRounds != 2 || c.AIPublic != 0 {
		t.Fatalf("%+v", c)
	}
	jobs, _ := s.jobs(e.ID, 1)
	for _, j := range jobs {
		if j.A == "B" && (len(j.AI.FamiliesPublic) != 3 || j.AI.FamiliesPrivate["t2"] != 86) {
			t.Fatalf("%+v", j.AI)
		}
		if j.A == "C" && j.AI.Failed == "" {
			t.Fatal("lỗi khởi tạo phải được ghi lại")
		}
	}
	ranked, _ := s.Ranked(e.ID)
	if ranked[0].SID != "B" || ranked[2].SID != "C" {
		t.Fatal(ranked)
	}
}

func TestTasksStartNeedsLockedPlan(t *testing.T) {
	s, _, e := tasksFixture(t, map[string]string{"A": "score=70"}, false)
	e.Status, e.Eligible, e.TopK = "LOCKED", 8, 8
	s.Store.Batch(map[string]interface{}{metaKey(e.ID): e})
	if err := s.Start(e.ID); err == nil {
		t.Fatal("chưa khóa đề thì không chạy được")
	}
}

func TestTasksConfigureLimits(t *testing.T) {
	s, _, _ := aiFixture(t, nil)
	future := now() + 3600
	if _, err := s.Configure("", Event{Name: "x", Deadline: future, Rounds: 2, TopK: 8, Kind: KindAI, Mode: ModeTasks, TaskCount: 2}); err == nil {
		t.Fatal("ít hơn 3 đề phải bị từ chối")
	}
	ev, err := s.Configure("", Event{Name: "x", Deadline: future, Rounds: 2, TopK: 8, Kind: KindAI, Mode: ModeTasks})
	if err != nil || ev.TaskCount != 6 || ev.Mode != ModeTasks {
		t.Fatal(ev, err)
	}
	normal, err := s.Configure("", Event{Name: "y", Deadline: future, Rounds: 2, TopK: 8, Mode: ModeTasks, TaskCount: 4})
	if err != nil || normal.Mode != "" || normal.TaskCount != 0 {
		t.Fatal("vòng loại thường không có chế độ đề từ kho", normal, err)
	}
}

package http

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"project-tuan3/internal/auth"
)

func taskTournament(locked bool) map[string]interface{} {
	level := func(prefix string) []interface{} {
		out := []interface{}{}
		for i := 0; i < 5; i++ {
			out = append(out, map[string]interface{}{
				"item":   map[string]interface{}{"entry_id": prefix, "seed": "SECRET-SEED-" + prefix + string(rune('0'+i))},
				"public": map[string]interface{}{"n": float64(i + 1), "name": prefix + " đề " + string(rune('1'+i)), "statement": "Đề bài"},
			})
		}
		return out
	}
	return map[string]interface{}{
		"tournament_id": "T", "track": "AI", "round_mode": "TASK",
		"ai_task_plan": map[string]interface{}{"locked": locked, "levels": map[string]interface{}{"1": level("l1"), "2": level("l2")}},
		"matches": map[string]interface{}{
			"m1": map[string]interface{}{"round_level": float64(1), "current_round_idx": float64(3), "tie_break_seed": "x", "team_a": map[string]interface{}{"student_id": "A"}, "team_b": map[string]interface{}{"student_id": "B"}},
			"m2": map[string]interface{}{"round_level": float64(2), "current_round_idx": float64(1)},
		},
	}
}

func TestCurrentTaskSpecFollowsLevelAndRound(t *testing.T) {
	tour := taskTournament(true)
	m1 := tour["matches"].(map[string]interface{})["m1"].(map[string]interface{})
	if spec := currentTaskSpec(tour, m1); spec == nil || spec["name"] != "l1 đề 3" {
		t.Fatal("hiệp 3 của vòng 1 phải ra đề thứ 3 của vòng 1", spec)
	}
	m2 := tour["matches"].(map[string]interface{})["m2"].(map[string]interface{})
	if currentTaskSpec(tour, m2) != nil {
		t.Fatal("trận chưa đủ hai đội không được lộ đề của hiệp đầu")
	}
	m2["team_a"], m2["team_b"] = map[string]interface{}{"student_id": "A"}, map[string]interface{}{"student_id": "B"}
	if spec := currentTaskSpec(tour, m2); spec == nil || spec["name"] != "l2 đề 1" {
		t.Fatal(spec)
	}
	m1["current_round_idx"] = float64(9)
	if currentTaskSpec(tour, m1) != nil {
		t.Fatal("hiệp ngoài kế hoạch không có đề")
	}
	if currentTaskSpec(taskTournament(false), m2) != nil {
		t.Fatal("chưa khóa đề thì không công bố đề của hiệp")
	}
	board := taskTournament(true)
	board["round_mode"] = ""
	if currentTaskSpec(board, m2) != nil {
		t.Fatal("giải bàn cờ không có đề ML")
	}
}

func TestRedactionHidesThePlanAndSeedsFromEveryoneButOrganizers(t *testing.T) {
	for _, session := range []auth.Session{{}, {Role: "TEAM", StudentID: "A"}, {Role: "TEAM", StudentID: "B", MatchID: "m1", Side: "team_b"}} {
		out := redactTournament(taskTournament(true), session)
		raw, _ := json.Marshal(out)
		if strings.Contains(string(raw), "SECRET-SEED") || out["ai_task_plan"] != nil {
			t.Fatalf("%+v nhìn thấy kế hoạch đề hoặc hạt giống", session)
		}
		m1 := out["matches"].(map[string]interface{})["m1"].(map[string]interface{})
		spec, _ := m1["current_task"].(map[string]interface{})
		if spec == nil || spec["name"] != "l1 đề 3" {
			t.Fatalf("đội phải thấy đề của hiệp hiện tại: %v", m1["current_task"])
		}
	}
	admin := redactTournament(taskTournament(true), auth.Session{Role: "ADMIN"})
	if admin["ai_task_plan"] == nil {
		t.Fatal("ban tổ chức phải thấy kế hoạch đề")
	}
	locked := redactTournament(taskTournament(false), auth.Session{Role: "TEAM", StudentID: "A"})
	if locked["matches"].(map[string]interface{})["m1"].(map[string]interface{})["current_task"] != nil {
		t.Fatal("chưa khóa đề thì đội không thấy đề")
	}
}

func TestPlanViewAndLevelCount(t *testing.T) {
	tour := taskTournament(true)
	if levelCount(tour) != 2 {
		t.Fatal(levelCount(tour))
	}
	h := &AIMainTaskHandler{}
	v := h.view(tour)
	if v["locked"] != true || v["level_count"] != 2 || len(v["levels"].(gin.H)) != 2 {
		t.Fatal(v)
	}
	raw, _ := json.Marshal(v)
	if strings.Contains(string(raw), "SECRET-SEED") {
		t.Fatal("khung nhìn kế hoạch cho giao diện quản trị chỉ chứa phần công khai")
	}
	if planOf(map[string]interface{}{})["locked"] != false {
		t.Fatal("giải chưa có kế hoạch mặc định là chưa khóa")
	}
}

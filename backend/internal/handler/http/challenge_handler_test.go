package http

import (
	"net/http"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/auth"
	"project-tuan3/internal/repository"
)

type scriptedRunner struct{ wins []bool }

func (s *scriptedRunner) RunStateless(action string, params map[string]interface{}) (map[string]interface{}, error) {
	won := len(s.wins) > 0 && s.wins[0]
	if len(s.wins) > 0 {
		s.wins = s.wins[1:]
	}
	winner := "team_b"
	if won {
		winner = "team_a"
	}
	return map[string]interface{}{"winner": winner, "win_reason": "x", "board_steps": []interface{}{}}, nil
}

func TestChallengesUnlockInOrderAndOnlyServerDecides(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	store, err := repository.NewQualifierRecords(repository.NewJSONTournamentRepository(filepath.Join(dir, "t.json")), filepath.Join(dir, "kv"))
	if err != nil {
		t.Fatal(err)
	}
	runner := &scriptedRunner{}
	h := &ChallengeHandler{Store: store, Engine: runner}
	team := func(c *gin.Context) { c.Set("session", auth.Session{Role: "TEAM", StudentID: "SV1"}) }
	r := gin.New()
	r.GET("/challenges", team, h.List)
	r.POST("/challenges/:challengeId/attempt", team, h.Attempt)
	r.GET("/badges/:studentId", h.Badges)
	attempt := func(id string, body map[string]interface{}) (int, map[string]interface{}) {
		h.last = nil // bỏ qua giới hạn tần suất trong test
		return send(r, "POST", "/challenges/"+id+"/attempt", "", body)
	}

	if code, _ := attempt("c02", map[string]interface{}{"code": "x"}); code != http.StatusForbidden {
		t.Fatal("locked challenge must be refused", code)
	}
	runner.wins = []bool{false}
	// Client tự khai "passed" không có tác dụng: chỉ kết quả trận do server chạy được tính.
	if _, out := attempt("c01", map[string]interface{}{"code": "x", "passed": true}); out["passed"] != false {
		t.Fatal("loss must not pass", out)
	}
	runner.wins = []bool{true}
	if _, out := attempt("c01", map[string]interface{}{"code": "x"}); out["passed"] != true || out["new_badge"] != true {
		t.Fatal("win must award badge", out)
	}
	_, list := send(r, "GET", "/challenges", "", nil)
	items := list["items"].([]interface{})
	if items[1].(map[string]interface{})["unlocked"] != true || items[2].(map[string]interface{})["unlocked"] != false {
		t.Fatal("next challenge must unlock, later ones stay locked", items[:3])
	}
	_, badges := send(r, "GET", "/badges/SV1", "", nil)
	if len(badges["items"].([]interface{})) != 1 {
		t.Fatal("public badges wrong", badges)
	}

	// Thử thách nhiều ván dừng sớm khi không thể đạt nữa.
	for _, id := range []string{"c02", "c03", "c04", "c05", "c06", "c07", "c08", "c09"} {
		runner.wins = []bool{true}
		attempt(id, map[string]interface{}{"code": "x"})
	}
	runner.wins = []bool{false, false, true, true, true}
	_, out := attempt("c10", map[string]interface{}{"code": "x"})
	if out["passed"] != false || len(out["runs"].([]interface{})) != 2 {
		t.Fatal("4/5 challenge must stop after two losses", out)
	}
}

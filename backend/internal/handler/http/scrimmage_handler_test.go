package http

import (
	"encoding/json"
	"net/http"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/auth"
	"project-tuan3/internal/qualifier"
	"project-tuan3/internal/repository"
)

type fakeRunner struct{ params map[string]interface{} }

func (f *fakeRunner) RunStateless(action string, params map[string]interface{}) (map[string]interface{}, error) {
	f.params = params
	return map[string]interface{}{
		"winner_side": "team_b", "win_reason": "Xanh chiếm cứ điểm", "board_steps": []interface{}{map[string]interface{}{"step_idx": 0}},
		"bot_errors": map[string]interface{}{"team_a": "lỗi của tôi", "team_b": "name 'OPPONENT_SECRET' is not defined"},
	}, nil
}

func TestScrimmageHidesOpponentSourceAndRespectsOptOut(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	store, err := repository.NewQualifierRecords(repository.NewJSONTournamentRepository(filepath.Join(dir, "t.json")), filepath.Join(dir, "kv"))
	if err != nil {
		t.Fatal(err)
	}
	put := func(sid, code string) {
		p := qualifier.Participant{SID: sid, Name: "Đội " + sid, Code: code, Language: "PYTHON", ValidID: "v1"}
		if err := store.Batch(map[string]interface{}{"participant:q1:" + sid: p}); err != nil {
			t.Fatal(err)
		}
	}
	put("SV1", "MY_CODE")
	put("SV2", "OPPONENT_SECRET")
	runner := &fakeRunner{}
	h := &ScrimmageHandler{Store: store, Engine: runner}
	as := func(s auth.Session) gin.HandlerFunc { return func(c *gin.Context) { c.Set("session", s) } }
	a := auth.Session{Role: "TEAM", StudentID: "SV1"}
	b := auth.Session{Role: "TEAM", StudentID: "SV2"}
	r := gin.New()
	r.POST("/a", as(a), h.Create)
	r.GET("/a", as(a), h.List)
	r.PUT("/b/settings", as(b), h.Settings)
	r.GET("/b/:scrimId", as(b), h.Replay)
	r.GET("/c/:scrimId", as(auth.Session{Role: "TEAM", StudentID: "SV3"}), h.Replay)

	code, out := send(r, "POST", "/a", "", map[string]string{"qualifier_id": "q1", "opponent_student_id": "SV2", "rule_id": "COMBO_4"})
	if code != 200 {
		t.Fatal("scrimmage failed", code, out)
	}
	raw := mustJSON(out)
	if strings.Contains(raw, "OPPONENT_SECRET") {
		t.Fatal("response leaks opponent source or error text", raw)
	}
	if out["my_bot_error"] != "lỗi của tôi" {
		t.Fatal("own bot error should be reported", out)
	}
	if runner.params["code_a"] != "MY_CODE" || runner.params["rule_id"] != "COMBO_4" {
		t.Fatal("wrong worker params", runner.params)
	}
	id := out["scrimmage"].(map[string]interface{})["id"].(string)
	if code, _ := send(r, "GET", "/b/"+id, "", nil); code != 200 {
		t.Fatal("opponent should see the replay", code)
	}
	if code, _ := send(r, "GET", "/c/"+id, "", nil); code != http.StatusForbidden {
		t.Fatal("outsider must not see the replay", code)
	}
	if code, _ := send(r, "POST", "/a", "", map[string]string{"qualifier_id": "q1", "opponent_student_id": "SV2"}); code != http.StatusTooManyRequests {
		t.Fatal("cooldown not enforced", code)
	}
	send(r, "PUT", "/b/settings", "", map[string]bool{"accept": false})
	h.lastRun = nil
	if code, _ := send(r, "POST", "/a", "", map[string]string{"qualifier_id": "q1", "opponent_student_id": "SV2"}); code != http.StatusForbidden {
		t.Fatal("opt-out not respected", code)
	}
}

func mustJSON(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}

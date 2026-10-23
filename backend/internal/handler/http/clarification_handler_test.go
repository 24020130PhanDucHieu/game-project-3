package http

import (
	"net/http"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/auth"
	"project-tuan3/internal/repository"
)

func TestClarificationsArePrivateUntilAnsweredPublicly(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	repo := repository.NewJSONTournamentRepository(filepath.Join(dir, "t.json"))
	store, err := repository.NewQualifierRecords(repo, filepath.Join(dir, "kv"))
	if err != nil {
		t.Fatal(err)
	}
	h := &ClarificationHandler{Store: store}
	as := func(s auth.Session) gin.HandlerFunc { return func(c *gin.Context) { c.Set("session", s) } }
	teamA := auth.Session{Role: "TEAM", StudentID: "SV1", TeamName: "Alpha"}
	teamB := auth.Session{Role: "TEAM", StudentID: "SV2", TeamName: "Beta"}
	admin := auth.Session{Role: "ADMIN", Judge: "gk.lan"}
	r := gin.New()
	r.POST("/a/ask", as(teamA), h.Ask)
	r.GET("/a/list", as(teamA), h.List)
	r.GET("/b/list", as(teamB), h.List)
	r.GET("/admin/list", as(admin), h.List)
	r.POST("/admin/:clarId/answer", as(admin), h.Answer)

	code, out := send(r, "POST", "/a/ask", "", map[string]string{"topic": "rules", "question": "Sương mù có che lịch sử không?"})
	if code != 200 {
		t.Fatal("ask failed", code, out)
	}
	id := out["clarification"].(map[string]interface{})["id"].(string)
	if code, _ := send(r, "POST", "/a/ask", "", map[string]string{"question": "Câu thứ hai ngay lập tức"}); code != http.StatusTooManyRequests {
		t.Fatal("cooldown not enforced", code)
	}
	if _, list := send(r, "GET", "/b/list", "", nil); list["total"].(float64) != 0 {
		t.Fatal("other team sees a private question", list)
	}
	if _, list := send(r, "GET", "/admin/list", "", nil); list["total"].(float64) != 1 || list["open"].(float64) != 1 {
		t.Fatal("admin list wrong", list)
	}
	if code, _ := send(r, "POST", "/admin/"+id+"/answer", "", map[string]interface{}{"answer": "Có, xem mục Luật.", "public": true}); code != 200 {
		t.Fatal("answer failed", code)
	}
	_, list := send(r, "GET", "/b/list", "", nil)
	items := list["items"].([]interface{})
	if len(items) != 1 {
		t.Fatal("public answer not visible to other team", list)
	}
	item := items[0].(map[string]interface{})
	if item["student_id"] != "" && item["student_id"] != nil {
		t.Fatal("public clarification leaks the asking team's student ID", item)
	}
	if item["answered_by"] != "gk.lan" {
		t.Fatal("answer must record the judge", item)
	}
}

package http

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"

	"project-tuan3/internal/repository"
	"project-tuan3/internal/service"
)

// Báo cáo kỹ thuật của giải chính AI: đội nộp báo cáo, giám khảo chấm 5 tiêu chí × 0–10.
// Điểm kỹ thuật = trung bình điểm tổng (0–50) của các giám khảo; đội cao nhất nhận Giải Kỹ thuật.

const (
	aiReportMin     = 200
	aiReportMax     = 6000
	aiRubricMax     = 10
	aiCommentMax    = 1000
	aiReportKeyFmt  = "aireport:%s:%s"
	aiScoreKeyFmt   = "aiscore:%s:%s:%s"
	aiReportCfgKey  = "aireportcfg:"
	aiTechAwardName = "Giải Kỹ thuật"
)

var aiCriteria = []gin.H{
	{"id": "idea", "name": "Ý tưởng", "hint": "Cách tiếp cận có hợp lý, có sáng tạo và phù hợp bài toán đọc đối thủ không."},
	{"id": "data", "name": "Dữ liệu và huấn luyện", "hint": "Dữ liệu lấy từ đâu, cách chia tập huấn luyện/kiểm tra, cách chọn tham số."},
	{"id": "evaluation", "name": "Đánh giá trung thực", "hint": "Có đo trên dữ liệu chưa thấy, có nêu rõ điểm yếu và chênh lệch công khai/riêng tư không."},
	{"id": "explain", "name": "Giải thích được", "hint": "Giải thích được vì sao mô hình ra quyết định như vậy, có ví dụ minh họa."},
	{"id": "repro", "name": "Tái lập được", "hint": "Người khác làm lại được từ mô tả hoặc kho mã, hạt giống và phiên bản rõ ràng."},
}

type AIReport struct {
	TournamentID string  `json:"tournament_id"`
	StudentID    string  `json:"student_id"`
	TeamName     string  `json:"team_name"`
	Summary      string  `json:"summary"`
	RepoURL      string  `json:"repo_url,omitempty"`
	SubmittedAt  float64 `json:"submitted_at"`
	UpdatedAt    float64 `json:"updated_at"`
}

type AIScore struct {
	Judge   string  `json:"judge"`
	Scores  []int   `json:"scores"`
	Comment string  `json:"comment,omitempty"`
	At      float64 `json:"at"`
}

type AIReportConfig struct {
	Deadline    float64 `json:"deadline"`
	Published   bool    `json:"published"`
	PublishedAt float64 `json:"published_at,omitempty"`
}

type AIReportStore interface {
	Get(key string, target interface{}) error
	List(prefix string) (map[string]json.RawMessage, error)
	Batch(values map[string]interface{}) error
}

type AIReportHandler struct {
	Service   *service.TournamentService
	Store     AIReportStore
	Accounts  *repository.Accounts
	AuditLog  func(actor, action string, details map[string]interface{})
	OnPublish func(tid string)
}

func nowSeconds() float64 { return float64(time.Now().UnixMilli()) / 1000 }

func (h *AIReportHandler) config(tid string) AIReportConfig {
	var cfg AIReportConfig
	_ = h.Store.Get(aiReportCfgKey+tid, &cfg)
	return cfg
}

func (h *AIReportHandler) aiTournament(c *gin.Context) (map[string]interface{}, bool) {
	t, err := h.Service.GetTournamentByID(c.Param("tid"))
	if err != nil || tournamentTrack(t) != "AI" {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Không tìm thấy giải chính AI."})
		return nil, false
	}
	return t, true
}

func tournamentTeam(t map[string]interface{}, sid string) (map[string]interface{}, bool) {
	teams, _ := t["teams"].([]interface{})
	for _, raw := range teams {
		team, _ := raw.(map[string]interface{})
		if strings.EqualFold(strings.TrimSpace(fmt.Sprint(team["student_id"])), sid) {
			return team, true
		}
	}
	return nil, false
}

func (h *AIReportHandler) reports(tid string) (map[string]AIReport, error) {
	rows, err := h.Store.List("aireport:" + tid + ":")
	if err != nil {
		return nil, err
	}
	out := map[string]AIReport{}
	for _, raw := range rows {
		var r AIReport
		if json.Unmarshal(raw, &r) == nil {
			out[strings.ToUpper(r.StudentID)] = r
		}
	}
	return out, nil
}

func (h *AIReportHandler) scores(tid string) (map[string][]AIScore, error) {
	rows, err := h.Store.List("aiscore:" + tid + ":")
	if err != nil {
		return nil, err
	}
	out := map[string][]AIScore{}
	for key, raw := range rows {
		parts := strings.SplitN(strings.TrimPrefix(key, "aiscore:"+tid+":"), ":", 2)
		var s AIScore
		if len(parts) == 2 && json.Unmarshal(raw, &s) == nil && len(s.Scores) == len(aiCriteria) {
			out[strings.ToUpper(parts[0])] = append(out[strings.ToUpper(parts[0])], s)
		}
	}
	for sid := range out {
		sort.Slice(out[sid], func(i, j int) bool { return out[sid][i].Judge < out[sid][j].Judge })
	}
	return out, nil
}

func sum(values []int) int {
	total := 0
	for _, v := range values {
		total += v
	}
	return total
}

// aggregate: điểm kỹ thuật (0–50) và điểm trung bình từng tiêu chí.
func aggregate(list []AIScore) (total float64, criteria []float64) {
	criteria = make([]float64, len(aiCriteria))
	if len(list) == 0 {
		return 0, criteria
	}
	for _, s := range list {
		total += float64(sum(s.Scores))
		for i, v := range s.Scores {
			criteria[i] += float64(v)
		}
	}
	n := float64(len(list))
	for i := range criteria {
		criteria[i] = math.Round(criteria[i]/n*100) / 100
	}
	return math.Round(total/n*100) / 100, criteria
}

type techRow struct {
	Rank      int       `json:"rank"`
	StudentID string    `json:"student_id"`
	TeamName  string    `json:"team_name"`
	Score     float64   `json:"score"`
	Judges    int       `json:"judges"`
	Criteria  []float64 `json:"criteria"`
	RepoURL   string    `json:"repo_url,omitempty"`
	at        float64
}

// ranking: chỉ tính đội đã nộp báo cáo và có ít nhất một điểm chấm.
func (h *AIReportHandler) ranking(tid string) ([]techRow, error) {
	reports, err := h.reports(tid)
	if err != nil {
		return nil, err
	}
	scores, err := h.scores(tid)
	if err != nil {
		return nil, err
	}
	rows := []techRow{}
	for sid, r := range reports {
		list := scores[sid]
		if len(list) == 0 {
			continue
		}
		total, criteria := aggregate(list)
		rows = append(rows, techRow{StudentID: r.StudentID, TeamName: r.TeamName, Score: total, Judges: len(list), Criteria: criteria, RepoURL: r.RepoURL, at: r.SubmittedAt})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Score != rows[j].Score {
			return rows[i].Score > rows[j].Score
		}
		if rows[i].at != rows[j].at {
			return rows[i].at < rows[j].at
		}
		return rows[i].StudentID < rows[j].StudentID
	})
	for i := range rows {
		rows[i].Rank = i + 1
	}
	return rows, nil
}

// TechWinner: đội nhận Giải Kỹ thuật, chỉ khi điểm đã công bố.
func (h *AIReportHandler) TechWinner(tid string) (teamName, studentID string, score float64, ok bool) {
	if h == nil || h.Store == nil || !h.config(tid).Published {
		return "", "", 0, false
	}
	rows, err := h.ranking(tid)
	if err != nil || len(rows) == 0 {
		return "", "", 0, false
	}
	return rows[0].TeamName, rows[0].StudentID, rows[0].Score, true
}

func cleanText(s string, max int) string {
	s = strings.ReplaceAll(strings.TrimSpace(s), "\r\n", "\n")
	if utf8.RuneCountInString(s) > max {
		s = string([]rune(s)[:max])
	}
	return s
}

// Mine: GET /api/ai-cup/tournaments/:tid/report — báo cáo của đội, kèm nhận xét sau khi công bố.
func (h *AIReportHandler) Mine(c *gin.Context) {
	t, ok := h.aiTournament(c)
	if !ok {
		return
	}
	tid := c.Param("tid")
	session := requestSession(c)
	cfg := h.config(tid)
	out := gin.H{"config": cfg, "criteria": aiCriteria, "limits": gin.H{"min": aiReportMin, "max": aiReportMax}, "now": nowSeconds()}
	if session.Role != "TEAM" {
		c.JSON(http.StatusOK, out)
		return
	}
	_, inTournament := tournamentTeam(t, session.StudentID)
	out["eligible"] = inTournament
	var report AIReport
	if err := h.Store.Get(fmt.Sprintf(aiReportKeyFmt, tid, strings.ToUpper(session.StudentID)), &report); err == nil {
		out["report"] = report
		if cfg.Published {
			scores, _ := h.scores(tid)
			list := scores[strings.ToUpper(session.StudentID)]
			total, criteria := aggregate(list)
			comments := []string{}
			for _, s := range list {
				if s.Comment != "" {
					comments = append(comments, s.Comment)
				}
			}
			out["feedback"] = gin.H{"score": total, "judges": len(list), "criteria": criteria, "comments": comments}
		}
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, out)
}

// Save: PUT /api/ai-cup/tournaments/:tid/report
func (h *AIReportHandler) Save(c *gin.Context) {
	session := requestSession(c)
	if session.Role != "TEAM" {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Chỉ tài khoản đội được nộp báo cáo."})
		return
	}
	t, ok := h.aiTournament(c)
	if !ok {
		return
	}
	tid := c.Param("tid")
	team, in := tournamentTeam(t, session.StudentID)
	if !in || team["disqualified"] == true {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Chỉ đội thi đấu ở giải chính AI này mới nộp báo cáo."})
		return
	}
	cfg := h.config(tid)
	if cfg.Published {
		c.JSON(http.StatusConflict, gin.H{"detail": "Điểm báo cáo đã công bố; không sửa được nữa."})
		return
	}
	if cfg.Deadline > 0 && nowSeconds() >= cfg.Deadline {
		c.JSON(http.StatusConflict, gin.H{"detail": "Đã quá hạn nộp báo cáo kỹ thuật."})
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 64*1024)
	var req struct {
		Summary string `json:"summary"`
		RepoURL string `json:"repo_url"`
	}
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Báo cáo không hợp lệ."})
		return
	}
	summary, repo := cleanText(req.Summary, aiReportMax), strings.TrimSpace(req.RepoURL)
	if n := utf8.RuneCountInString(summary); n < aiReportMin {
		c.JSON(http.StatusBadRequest, gin.H{"detail": fmt.Sprintf("Báo cáo cần tối thiểu %d ký tự (hiện %d): nêu kỹ thuật, dữ liệu, cách đánh giá, hạn chế.", aiReportMin, n)})
		return
	}
	if repo != "" && (len(repo) > 300 || !(strings.HasPrefix(repo, "https://") || strings.HasPrefix(repo, "http://"))) {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Liên kết kho mã phải bắt đầu bằng https:// và tối đa 300 ký tự."})
		return
	}
	key := fmt.Sprintf(aiReportKeyFmt, tid, strings.ToUpper(session.StudentID))
	report := AIReport{TournamentID: tid, StudentID: strings.ToUpper(session.StudentID), TeamName: fmt.Sprint(team["team_name"]), Summary: summary, RepoURL: repo, SubmittedAt: nowSeconds()}
	var prior AIReport
	if h.Store.Get(key, &prior) == nil && prior.SubmittedAt > 0 {
		report.SubmittedAt = prior.SubmittedAt
	}
	report.UpdatedAt = nowSeconds()
	if err := h.Store.Batch(map[string]interface{}{key: report}); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Chưa lưu được báo cáo. Hãy thử lại."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "report": report})
}

// AdminList: GET /api/ai-cup/tournaments/:tid/reports — mọi đội, báo cáo, điểm từng giám khảo (ban tổ chức).
func (h *AIReportHandler) AdminList(c *gin.Context) {
	t, ok := h.aiTournament(c)
	if !ok {
		return
	}
	tid := c.Param("tid")
	reports, err := h.reports(tid)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Không đọc được báo cáo."})
		return
	}
	scores, err := h.scores(tid)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Không đọc được điểm."})
		return
	}
	me := requestSession(c).Actor()
	items := []gin.H{}
	teams, _ := t["teams"].([]interface{})
	for _, raw := range teams {
		team, _ := raw.(map[string]interface{})
		sid := strings.ToUpper(strings.TrimSpace(fmt.Sprint(team["student_id"])))
		list := scores[sid]
		total, criteria := aggregate(list)
		var mine *AIScore
		for i := range list {
			if list[i].Judge == me {
				mine = &list[i]
			}
		}
		row := gin.H{"student_id": sid, "team_name": fmt.Sprint(team["team_name"]), "scores": list, "score": total, "criteria": criteria, "judges": len(list), "mine": mine}
		if r, ok := reports[sid]; ok {
			row["report"] = r
		}
		items = append(items, row)
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"items": items, "config": h.config(tid), "criteria": aiCriteria, "judge": me})
}

// Score: PUT /api/ai-cup/tournaments/:tid/reports/:sid/score — một giám khảo chấm (ghi đè điểm cũ của chính họ).
func (h *AIReportHandler) Score(c *gin.Context) {
	t, ok := h.aiTournament(c)
	if !ok {
		return
	}
	tid, sid := c.Param("tid"), strings.ToUpper(strings.TrimSpace(c.Param("sid")))
	if _, in := tournamentTeam(t, sid); !in {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Đội không thuộc giải này."})
		return
	}
	if h.config(tid).Published {
		c.JSON(http.StatusConflict, gin.H{"detail": "Điểm đã công bố. Hãy hủy công bố trước khi sửa điểm."})
		return
	}
	var req struct {
		Scores  []int  `json:"scores"`
		Comment string `json:"comment"`
	}
	if c.ShouldBindJSON(&req) != nil || len(req.Scores) != len(aiCriteria) {
		c.JSON(http.StatusBadRequest, gin.H{"detail": fmt.Sprintf("Cần đúng %d điểm tiêu chí.", len(aiCriteria))})
		return
	}
	for _, v := range req.Scores {
		if v < 0 || v > aiRubricMax {
			c.JSON(http.StatusBadRequest, gin.H{"detail": fmt.Sprintf("Mỗi tiêu chí chấm từ 0 đến %d.", aiRubricMax)})
			return
		}
	}
	var report AIReport
	if h.Store.Get(fmt.Sprintf(aiReportKeyFmt, tid, sid), &report) != nil {
		c.JSON(http.StatusConflict, gin.H{"detail": "Đội chưa nộp báo cáo nên chưa chấm được."})
		return
	}
	judge := requestSession(c).Actor()
	score := AIScore{Judge: judge, Scores: req.Scores, Comment: cleanText(req.Comment, aiCommentMax), At: nowSeconds()}
	if err := h.Store.Batch(map[string]interface{}{fmt.Sprintf(aiScoreKeyFmt, tid, sid, judge): score}); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Chưa lưu được điểm."})
		return
	}
	if h.AuditLog != nil {
		h.AuditLog(judge, "AI_REPORT_SCORE", map[string]interface{}{"tournament_id": tid, "student_id": sid, "total": sum(req.Scores)})
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "score": score})
}

// Config: PUT /api/ai-cup/tournaments/:tid/report-config — hạn nộp và công bố điểm.
func (h *AIReportHandler) Config(c *gin.Context) {
	if _, ok := h.aiTournament(c); !ok {
		return
	}
	tid := c.Param("tid")
	var req struct {
		Deadline  float64 `json:"deadline"`
		Published bool    `json:"published"`
	}
	if c.ShouldBindJSON(&req) != nil || req.Deadline < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Cấu hình không hợp lệ."})
		return
	}
	cfg := h.config(tid)
	if req.Published && !cfg.Published {
		rows, err := h.ranking(tid)
		if err != nil || len(rows) == 0 {
			c.JSON(http.StatusConflict, gin.H{"detail": "Chưa có đội nào được chấm báo cáo nên chưa công bố được."})
			return
		}
		cfg.PublishedAt = nowSeconds()
	}
	cfg.Deadline, cfg.Published = req.Deadline, req.Published
	if !req.Published {
		cfg.PublishedAt = 0
	}
	if err := h.Store.Batch(map[string]interface{}{aiReportCfgKey + tid: cfg}); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Chưa lưu được cấu hình."})
		return
	}
	if h.AuditLog != nil {
		h.AuditLog(requestSession(c).Actor(), "AI_REPORT_CONFIG", map[string]interface{}{"tournament_id": tid, "deadline": cfg.Deadline, "published": cfg.Published})
	}
	if cfg.Published && h.OnPublish != nil {
		h.OnPublish(tid)
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "config": cfg})
}

// Scoreboard: GET /api/ai-cup/tournaments/:tid/scoreboard — bảng điểm kỹ thuật công khai sau khi công bố.
func (h *AIReportHandler) Scoreboard(c *gin.Context) {
	if _, ok := h.aiTournament(c); !ok {
		return
	}
	tid := c.Param("tid")
	cfg := h.config(tid)
	if !cfg.Published {
		c.JSON(http.StatusOK, gin.H{"published": false, "deadline": cfg.Deadline, "items": []techRow{}, "criteria": aiCriteria})
		return
	}
	rows, err := h.ranking(tid)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Không đọc được bảng điểm."})
		return
	}
	c.Header("Cache-Control", "public, max-age=15")
	c.JSON(http.StatusOK, gin.H{"published": true, "published_at": cfg.PublishedAt, "items": rows, "criteria": aiCriteria, "award": aiTechAwardName})
}

// NotifyPublished: thông báo cho mọi đội đã nộp báo cáo khi điểm được công bố (mỗi giải/đội một lần).
func (h *AIReportHandler) NotifyPublished(tid string) {
	if h.Accounts == nil {
		return
	}
	reports, err := h.reports(tid)
	if err != nil {
		return
	}
	for sid, r := range reports {
		_ = h.Accounts.CreateNotification(repository.Notification{
			RecipientID: sid,
			EventType:   "AI_REPORT",
			Title:       "Đã công bố điểm báo cáo kỹ thuật",
			Message:     "Đội " + r.TeamName + " có thể xem điểm và nhận xét của giám khảo trong tab Giải AI.",
			LinkTab:     "aicup",
			LinkData:    map[string]interface{}{"tournament_id": tid, "section": "report"},
			DedupKey:    "aireport:" + tid + ":" + sid,
		})
	}
}

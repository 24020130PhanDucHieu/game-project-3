package http

import (
	"database/sql"
	"encoding/json"
	"errors"
	"github.com/gin-gonic/gin"
	"net/http"
	"project-tuan3/internal/qualifier"
	"sort"
	"strconv"
	"strings"
)

type QualifierHandler struct{ Service *qualifier.Service }

func (h *QualifierHandler) Register(c *gin.Context) {
	session := requestSession(c)
	if session.Role != "TEAM" {
		c.JSON(403, gin.H{"detail": "Chỉ tài khoản đội được đăng ký."})
		return
	}
	if err := h.Service.Register(c.Param("qid"), session.StudentID); err != nil {
		qualifierError(c, err)
		return
	}
	c.JSON(200, gin.H{"status": "SUCCESS"})
}

func qualifierError(c *gin.Context, err error) { c.JSON(400, gin.H{"detail": err.Error()}) }
func (h *QualifierHandler) List(c *gin.Context) {
	items, err := h.Service.Events()
	if err != nil {
		qualifierError(c, err)
		return
	}
	c.JSON(200, items)
}
func (h *QualifierHandler) Configure(c *gin.Context) {
	var req qualifier.Event
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(400, gin.H{"detail": "Cấu hình không hợp lệ."})
		return
	}
	e, err := h.Service.Configure(c.Param("qid"), req)
	if err != nil {
		qualifierError(c, err)
		return
	}
	e.Seed = ""
	c.JSON(200, e)
}
func (h *QualifierHandler) Detail(c *gin.Context) {
	id := c.Param("qid")
	e, err := h.Service.Event(id)
	if err != nil {
		qualifierError(c, err)
		return
	}
	e.Seed = ""
	response := gin.H{"event": e}
	session := requestSession(c)
	sid := session.StudentID
	if session.Role == "ADMIN" {
		sid = c.Query("student_id")
	}
	if sid != "" {
		var participant qualifier.Participant
		err := h.Service.Store.Get("participant:"+id+":"+sid, &participant)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			qualifierError(c, err)
			return
		}
		response["participant"] = participant
		records, err := h.Service.Store.List("submission:" + id + ":" + sid + ":")
		if err != nil {
			qualifierError(c, err)
			return
		}
		history := []qualifier.Submission{}
		for _, raw := range records {
			var sub qualifier.Submission
			if err = json.Unmarshal(raw, &sub); err != nil {
				qualifierError(c, err)
				return
			}
			history = append(history, sub)
		}
		sort.Slice(history, func(i, j int) bool { return history[i].At > history[j].At })
		response["history"] = history
		jobs, err := h.Service.Store.ListMetadata("job:"+id+":", sid)
		if err != nil {
			qualifierError(c, err)
			return
		}
		results := []qualifier.Job{}
		for _, raw := range jobs {
			var job qualifier.Job
			if err = json.Unmarshal(raw, &job); err != nil {
				qualifierError(c, err)
				return
			}
			if job.A == sid || job.B == sid {
				job.Seed = ""
				results = append(results, job)
			}
		}
		sort.Slice(results, func(i, j int) bool { return results[i].Round < results[j].Round })
		response["results"] = results
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(200, response)
}
func (h *QualifierHandler) Submit(c *gin.Context) {
	session := requestSession(c)
	if session.Role != "TEAM" {
		c.JSON(403, gin.H{"detail": "Chỉ tài khoản đội được nộp bài vòng loại."})
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 100000)
	var req struct {
		Code     string `json:"code"`
		Language string `json:"language"`
	}
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(400, gin.H{"detail": "Bài nộp không hợp lệ hoặc quá 64 KB."})
		return
	}
	sub, err := h.Service.EnqueueSubmission(c.Param("qid"), session.StudentID, req.Code, req.Language, c.GetHeader("X-Submission-Id"))
	if err != nil {
		if errors.Is(err, qualifier.ErrSubmissionBacklog) {
			c.Header("Retry-After", "20")
			c.JSON(429, gin.H{"detail": err.Error()})
			return
		}
		var rejected *qualifier.RejectedSubmission
		if errors.As(err, &rejected) {
			c.JSON(400, gin.H{"detail": rejected.Error()})
		} else {
			c.Header("Retry-After", "15")
			c.JSON(503, gin.H{"detail": "Chưa lưu được bài. Bài trên thiết bị sẽ tự gửi lại; vui lòng giữ bản dự phòng."})
		}
		return
	}
	sub.Code = ""
	c.JSON(http.StatusAccepted, sub)
}
func (h *QualifierHandler) Action(c *gin.Context) {
	id := c.Param("qid")
	var err error
	switch c.Param("action") {
	case "reopen":
		var req struct {
			Deadline float64 `json:"deadline"`
			Reason   string  `json:"reason"`
		}
		if c.ShouldBindJSON(&req) != nil {
			c.JSON(400, gin.H{"detail": "Hạn mới hoặc lý do không hợp lệ."})
			return
		}
		err = h.Service.Reopen(id, req.Deadline, req.Reason)
	case "pause":
		err = h.Service.Pause(id)
	case "test-bots":
		var req struct {
			Count int `json:"count"`
		}
		if c.ShouldBindJSON(&req) != nil {
			c.JSON(400, gin.H{"detail": "Số bot không hợp lệ."})
			return
		}
		err = h.Service.GenerateTestBots(id, req.Count)
	case "freeze":
		err = h.Service.Freeze(id)
	case "start":
		err = h.Service.Start(id)
	case "promote":
		var req struct {
			Target string `json:"tournament_id"`
		}
		if c.ShouldBindJSON(&req) != nil || req.Target == "" {
			c.JSON(400, gin.H{"detail": "Chọn giải chính để chốt đội."})
			return
		}
		err = h.Service.Promote(id, req.Target)
	default:
		c.JSON(404, gin.H{"detail": "Không có thao tác này."})
		return
	}
	if err != nil {
		qualifierError(c, err)
		return
	}
	c.JSON(200, gin.H{"status": "SUCCESS"})
}
func (h *QualifierHandler) Teams(c *gin.Context) {
	id := c.Param("qid")
	if _, err := h.Service.Event(id); err != nil {
		qualifierError(c, err)
		return
	}
	people, err := h.Service.ParticipantSummaries(id)
	if err != nil {
		qualifierError(c, err)
		return
	}
	items := []gin.H{}
	query := strings.ToLower(strings.TrimSpace(c.Query("q")))
	filter := c.Query("filter")
	for _, p := range people {
		status := "NOT_SUBMITTED"
		if p.SubmittedAt > 0 {
			status = "INVALID"
		}
		if p.ValidID != "" {
			status = "VALID"
		}
		if p.Pending > 0 {
			status = "PENDING"
		}
		if p.LockedID != "" {
			status = "LOCKED"
		}
		if query != "" && !strings.Contains(strings.ToLower(p.SID+" "+p.Name), query) {
			continue
		}
		if filter != "" && filter != status {
			continue
		}
		items = append(items, gin.H{"student_id": p.SID, "team_name": p.Name, "test_bot": p.TestBot, "status": status, "elo": p.Elo, "wins": p.Wins, "played": p.Played})
	}
	sort.Slice(items, func(i, j int) bool { return items[i]["student_id"].(string) < items[j]["student_id"].(string) })
	page := qualifierPage(c)
	size := 50
	start := (page - 1) * size
	if start > len(items) {
		start = len(items)
	}
	end := start + size
	if end > len(items) {
		end = len(items)
	}
	c.JSON(200, gin.H{"items": items[start:end], "total": len(items), "page": page, "page_size": size})
}
func qualifierPage(c *gin.Context) int {
	page, _ := strconv.Atoi(c.Query("page"))
	if page < 1 {
		page = 1
	}
	if page > 100000 {
		page = 100000
	}
	return page
}
func (h *QualifierHandler) Ranking(c *gin.Context) {
	people, err := h.Service.Ranked(c.Param("qid"))
	if err != nil {
		qualifierError(c, err)
		return
	}
	items := []gin.H{}
	for index, p := range people {
		items = append(items, gin.H{"rank": index + 1, "student_id": p.SID, "team_name": p.Name, "elo": p.Elo, "wins": p.Wins, "played": p.Played, "byes": p.Byes})
	}
	page := qualifierPage(c)
	size := 50
	start := (page - 1) * size
	if start > len(items) {
		start = len(items)
	}
	end := start + size
	if end > len(items) {
		end = len(items)
	}
	c.JSON(200, gin.H{"items": items[start:end], "total": len(items), "page": page, "page_size": size})
}

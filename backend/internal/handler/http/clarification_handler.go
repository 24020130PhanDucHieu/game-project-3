package http

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/repository"
)

// Clarification là câu hỏi của đội gửi ban tổ chức (giống clarification của ICPC).
// Câu trả lời riêng chỉ đội hỏi thấy; câu trả lời công khai mọi người đều thấy.
type Clarification struct {
	ID           string    `json:"id"`
	StudentID    string    `json:"student_id"`
	TeamName     string    `json:"team_name"`
	TournamentID string    `json:"tournament_id,omitempty"`
	Topic        string    `json:"topic"`
	Question     string    `json:"question"`
	Answer       string    `json:"answer,omitempty"`
	Public       bool      `json:"public"`
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"created_at"`
	AnsweredAt   time.Time `json:"answered_at,omitempty"`
	AnsweredBy   string    `json:"answered_by,omitempty"`
}

const (
	clarOpen     = "OPEN"
	clarAnswered = "ANSWERED"
	clarRejected = "REJECTED"
	clarCooldown = 30 * time.Second
	clarPageSize = 50
)

var clarTopics = map[string]bool{"RULES": true, "TECH": true, "SCHEDULE": true, "INCIDENT": true, "OTHER": true}

type ClarificationHandler struct {
	Store    *repository.QualifierRecords
	Accounts *repository.Accounts
	mu       sync.Mutex
	lastAsk  map[string]time.Time
}

func randomID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (h *ClarificationHandler) all() ([]Clarification, error) {
	rows, err := h.Store.List("clar:")
	if err != nil {
		return nil, err
	}
	out := make([]Clarification, 0, len(rows))
	for _, raw := range rows {
		var item Clarification
		if json.Unmarshal(raw, &item) == nil && item.ID != "" {
			out = append(out, item)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out, nil
}

func (h *ClarificationHandler) notify(recipient, title, message string) {
	if h.Accounts == nil {
		return
	}
	_ = h.Accounts.CreateNotification(repository.Notification{RecipientID: recipient, EventType: "CLARIFICATION", Title: title, Message: message, LinkTab: "guide", CreatedAt: time.Now().UTC()})
}

func (h *ClarificationHandler) Ask(c *gin.Context) {
	session := requestSession(c)
	if session.Role != "TEAM" || session.StudentID == "" {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Chỉ tài khoản đội được gửi câu hỏi."})
		return
	}
	var req struct {
		Topic        string `json:"topic"`
		Question     string `json:"question"`
		TournamentID string `json:"tournament_id"`
	}
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Câu hỏi không hợp lệ."})
		return
	}
	question := strings.TrimSpace(req.Question)
	if question == "" || utf8.RuneCountInString(question) > 1000 {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Câu hỏi không được trống và tối đa 1.000 ký tự."})
		return
	}
	topic := strings.ToUpper(strings.TrimSpace(req.Topic))
	if !clarTopics[topic] {
		topic = "OTHER"
	}
	h.mu.Lock()
	if h.lastAsk == nil {
		h.lastAsk = map[string]time.Time{}
	}
	if last, ok := h.lastAsk[session.StudentID]; ok && time.Since(last) < clarCooldown {
		h.mu.Unlock()
		c.Header("Retry-After", "30")
		c.JSON(http.StatusTooManyRequests, gin.H{"detail": "Bạn vừa gửi câu hỏi. Vui lòng đợi 30 giây trước khi gửi tiếp."})
		return
	}
	h.lastAsk[session.StudentID] = time.Now()
	h.mu.Unlock()

	teamName := session.TeamName
	if h.Accounts != nil {
		if account, err := h.Accounts.Get(session.StudentID); err == nil && account.TeamName != "" {
			teamName = account.TeamName
		}
	}
	now := time.Now().UTC()
	item := Clarification{ID: now.Format("20060102T150405.000") + "-" + randomID(), StudentID: session.StudentID, TeamName: teamName, TournamentID: strings.TrimSpace(req.TournamentID), Topic: topic, Question: question, Status: clarOpen, CreatedAt: now}
	if err := h.Store.Batch(map[string]interface{}{"clar:" + item.ID: item}); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Chưa lưu được câu hỏi. Hãy thử lại."})
		return
	}
	h.notify("ADMIN", "Câu hỏi mới từ "+teamName, truncate(question, 140))
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "clarification": item})
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}

func (h *ClarificationHandler) List(c *gin.Context) {
	session := requestSession(c)
	items, err := h.all()
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Không tải được hỏi đáp."})
		return
	}
	visible := make([]Clarification, 0, len(items))
	open := 0
	status := strings.ToUpper(c.Query("status"))
	for _, item := range items {
		if item.Status == clarOpen {
			open++
		}
		switch {
		case session.Role == "ADMIN":
			if status != "" && item.Status != status {
				continue
			}
		case session.Role == "TEAM" && strings.EqualFold(item.StudentID, session.StudentID):
		case item.Public && item.Status == clarAnswered:
			// Câu hỏi công khai: ẩn mã sinh viên đội hỏi với người khác.
			item.StudentID = ""
		default:
			continue
		}
		visible = append(visible, item)
	}
	page := qualifierPage(c)
	start := (page - 1) * clarPageSize
	if start > len(visible) {
		start = len(visible)
	}
	end := start + clarPageSize
	if end > len(visible) {
		end = len(visible)
	}
	response := gin.H{"items": visible[start:end], "total": len(visible), "page": page, "page_size": clarPageSize}
	if session.Role == "ADMIN" {
		response["open"] = open
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, response)
}

func (h *ClarificationHandler) Answer(c *gin.Context) {
	var req struct {
		Answer string `json:"answer"`
		Public bool   `json:"public"`
		Status string `json:"status"`
	}
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Câu trả lời không hợp lệ."})
		return
	}
	answer := strings.TrimSpace(req.Answer)
	status := strings.ToUpper(req.Status)
	if status == "" {
		status = clarAnswered
	}
	if status != clarAnswered && status != clarRejected {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Trạng thái phải là ANSWERED hoặc REJECTED."})
		return
	}
	if answer == "" || utf8.RuneCountInString(answer) > 2000 {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Câu trả lời không được trống và tối đa 2.000 ký tự."})
		return
	}
	key := "clar:" + c.Param("clarId")
	var item Clarification
	if err := h.Store.Get(key, &item); errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Không tìm thấy câu hỏi."})
		return
	} else if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Không đọc được câu hỏi."})
		return
	}
	item.Answer, item.Status, item.Public = answer, status, req.Public && status == clarAnswered
	item.AnsweredAt, item.AnsweredBy = time.Now().UTC(), requestSession(c).Actor()
	if err := h.Store.Batch(map[string]interface{}{key: item}); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Chưa lưu được câu trả lời. Hãy thử lại."})
		return
	}
	if item.Public {
		h.notify("ALL", "BTC trả lời câu hỏi công khai", truncate(item.Question, 90)+" — "+truncate(answer, 120))
	} else {
		h.notify(item.StudentID, "BTC đã trả lời câu hỏi của bạn", truncate(answer, 160))
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "clarification": item})
}

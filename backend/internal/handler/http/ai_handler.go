package http

import (
	"context"
	"errors"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"

	"project-tuan3/internal/ai"
	"project-tuan3/internal/auth"
	"project-tuan3/internal/service"
)

// AIHandler: trợ lý hỏi đáp luật. Câu trả lời chỉ được dựa trên dữ liệu thật (xem package ai).
type AIHandler struct {
	Agent     *ai.Agent
	KB        *ai.KB
	Quota     *ai.Manager
	Available bool // có khóa API
	Audit     func(actor, action string, details map[string]interface{})
}

const aiQuestionMax = 400

// aiData cho công cụ của trợ lý đọc dữ liệu thật; mọi dữ liệu giải đi qua redactTournament như API công khai.
type aiData struct {
	Service *service.TournamentService
	Clar    *ClarificationHandler
}

func (d aiData) Tournament(id string, who ai.Identity) (map[string]interface{}, error) {
	t, err := d.Service.GetTournamentByID(id)
	if err != nil {
		return nil, err
	}
	return redactTournament(t, auth.Session{Role: who.Role, StudentID: who.StudentID, TournamentID: id}), nil
}

func (d aiData) Tournaments() []ai.TournamentRef {
	var out []ai.TournamentRef
	for _, t := range d.Service.GetTournamentList() {
		out = append(out, ai.TournamentRef{ID: t.TournamentID, Name: t.Name, Status: t.Status})
	}
	return out
}

func (d aiData) TournamentsOfTeam(studentID string) []string {
	var out []string
	for id, raw := range d.Service.GetAllTournaments() {
		t, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		found := false
		if teams, ok := t["teams"].([]interface{}); ok {
			for _, r := range teams {
				if tm, ok := r.(map[string]interface{}); ok {
					if sid, _ := tm["student_id"].(string); strings.EqualFold(sid, studentID) {
						found = true
					}
				}
			}
		}
		if !found {
			if matches, ok := t["matches"].(map[string]interface{}); ok {
			scan:
				for _, r := range matches {
					m, _ := r.(map[string]interface{})
					for _, side := range []string{"team_a", "team_b"} {
						if tm, ok := m[side].(map[string]interface{}); ok {
							if sid, _ := tm["student_id"].(string); strings.EqualFold(sid, studentID) {
								found = true
								break scan
							}
						}
					}
				}
			}
		}
		if found {
			out = append(out, id)
		}
	}
	sort.Strings(out)
	return out
}

func (d aiData) PublicFAQ() ([]ai.FAQItem, error) {
	items, err := d.Clar.all()
	if err != nil {
		return nil, err
	}
	var out []ai.FAQItem
	for _, it := range items {
		if it.Public && it.Status == clarAnswered && strings.TrimSpace(it.Answer) != "" {
			out = append(out, ai.FAQItem{ID: it.ID, Topic: it.Topic, Question: it.Question, Answer: it.Answer})
		}
	}
	return out, nil
}

func NewAIData(svc *service.TournamentService, clar *ClarificationHandler) ai.Data {
	return aiData{Service: svc, Clar: clar}
}

func aiIdentity(s auth.Session) ai.Identity {
	return ai.Identity{Role: s.Role, StudentID: s.StudentID, TeamName: s.TeamName, TournamentID: s.TournamentID}
}

func quotaID(s auth.Session) string {
	if s.Role == "ADMIN" {
		return "ADMIN"
	}
	return s.StudentID
}

func cleanQuestion(q string) string {
	q = strings.Join(strings.Fields(q), " ")
	if utf8.RuneCountInString(q) > aiQuestionMax {
		q = string([]rune(q)[:aiQuestionMax])
	}
	return q
}

type aiAskResponse struct {
	Answer     string           `json:"answer"`
	NeedsHuman bool             `json:"needs_human"`
	Sources    []ai.CitedSource `json:"sources"`
	Remaining  int              `json:"remaining"`
	Cached     bool             `json:"cached"`
}

// Ask: POST /api/ai/ask
func (h *AIHandler) Ask(c *gin.Context) {
	s := requestSession(c)
	if (s.Role != "TEAM" || s.StudentID == "") && s.Role != "ADMIN" {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Đăng nhập tài khoản đội để hỏi trợ lý AI."})
		return
	}
	if !h.Available {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Trợ lý AI chưa được cấu hình.", "code": "AI_UNAVAILABLE"})
		return
	}
	var req struct {
		Question     string `json:"question"`
		TournamentID string `json:"tournament_id"`
	}
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Câu hỏi không hợp lệ."})
		return
	}
	question := cleanQuestion(req.Question)
	if utf8.RuneCountInString(question) < 3 {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Hãy nhập câu hỏi (ít nhất 3 ký tự)."})
		return
	}
	who := aiIdentity(s)
	if who.TournamentID == "" && len(req.TournamentID) <= 64 {
		who.TournamentID = strings.TrimSpace(req.TournamentID)
	}
	qid := quotaID(s)

	if !h.Quota.Settings().Enabled {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": ai.ErrDisabled.Error(), "code": "AI_DISABLED"})
		return
	}
	key := ai.CacheKey(question, h.KB.Version)
	if hit, ok := h.Quota.CacheGet(key); ok {
		h.Quota.Log(ai.LogEntry{StudentID: qid, TeamName: who.TeamName, Role: s.Role, Question: question, Answer: truncateRunes(hit.Answer, 300), Cached: true, SourceIDs: sourceIDs(hit.Sources)})
		c.JSON(http.StatusOK, aiAskResponse{Answer: hit.Answer, Sources: hit.Sources, Remaining: h.Quota.UsageFor(qid).Remaining, Cached: true})
		return
	}
	remaining, err := h.Quota.Reserve(qid)
	if err != nil {
		switch {
		case errors.Is(err, ai.ErrTeamLimit), errors.Is(err, ai.ErrBudget):
			c.JSON(http.StatusTooManyRequests, gin.H{"detail": err.Error() + " Bạn vẫn có thể bấm “Hỏi ban tổ chức”.", "code": "AI_LIMIT"})
		case errors.Is(err, ai.ErrDisabled):
			c.JSON(http.StatusServiceUnavailable, gin.H{"detail": err.Error(), "code": "AI_DISABLED"})
		default:
			c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Chưa ghi nhận được lượt hỏi, hãy thử lại."})
		}
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 35*time.Second)
	defer cancel()
	res, err := h.Agent.Ask(ctx, question, who)
	if err != nil {
		h.Quota.Refund(qid)
		log.Printf("[AI] lỗi nhà cung cấp: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"detail": "Trợ lý AI đang bận. Bạn thử lại sau ít phút hoặc bấm “Hỏi ban tổ chức”.", "code": "AI_BUSY"})
		return
	}
	h.Quota.AddTokens(res.Usage.Total())
	h.Quota.Log(ai.LogEntry{StudentID: qid, TeamName: who.TeamName, Role: s.Role, Question: question, Answer: truncateRunes(res.Answer, 300), NeedsHuman: res.NeedsHuman, Reason: res.Reason, Draft: res.Draft,
		SourceIDs: sourceIDs(res.Sources), Tools: res.ToolsUsed, Tokens: res.Usage.Total()})
	if res.Cacheable {
		h.Quota.CachePut(key, ai.CachedAnswer{Answer: res.Answer, Sources: res.Sources})
	}
	c.JSON(http.StatusOK, aiAskResponse{Answer: res.Answer, NeedsHuman: res.NeedsHuman, Sources: res.Sources, Remaining: remaining})
}

func sourceIDs(list []ai.CitedSource) []string {
	out := make([]string, 0, len(list))
	for _, s := range list {
		out = append(out, s.ID)
	}
	return out
}

func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

// Usage: GET /api/ai/usage — số lượt còn lại của đội và trợ lý có dùng được không.
func (h *AIHandler) Usage(c *gin.Context) {
	s := requestSession(c)
	u := h.Quota.UsageFor(quotaID(s))
	c.JSON(http.StatusOK, gin.H{"available": h.Available && u.Enabled, "used": u.Used, "limit": u.Limit, "remaining": u.Remaining})
}

// Settings: GET /api/ai/settings (admin) — cài đặt, mức dùng hôm nay và thống kê chất lượng.
func (h *AIHandler) Settings(c *gin.Context) {
	logs := h.Quota.Logs(1, 1000)
	asked, human := 0, 0
	for _, l := range logs {
		asked++
		if l.NeedsHuman {
			human++
		}
	}
	u := h.Quota.UsageFor("ADMIN")
	c.JSON(http.StatusOK, gin.H{"available": h.Available, "settings": h.Quota.Settings(), "tokens_today": u.TokensToday, "asked_today": asked, "needs_human_today": human, "model": h.Agent.Model, "kb_version": h.KB.Version})
}

// SaveSettings: PUT /api/ai/settings (admin).
func (h *AIHandler) SaveSettings(c *gin.Context) {
	var body ai.Settings
	if c.ShouldBindJSON(&body) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Cài đặt không hợp lệ."})
		return
	}
	if err := h.Quota.SetSettings(body); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Chưa lưu được cài đặt."})
		return
	}
	if h.Audit != nil {
		s := requestSession(c)
		actor := s.DisplayName
		if actor == "" {
			actor = "admin"
		}
		h.Audit(actor, "AI_SETTINGS", map[string]interface{}{"enabled": body.Enabled, "per_team": body.PerTeam, "daily_tokens": body.DailyTokens})
	}
	c.JSON(http.StatusOK, gin.H{"settings": h.Quota.Settings()})
}

// Log: GET /api/ai/log?days=2&only=human (admin) — nhật ký hỏi đáp để xem câu chưa trả lời được.
func (h *AIHandler) Log(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "2"))
	if days < 1 || days > 14 {
		days = 2
	}
	logs := h.Quota.Logs(days, 300)
	if c.Query("only") == "human" {
		filtered := logs[:0]
		for _, l := range logs {
			if l.NeedsHuman {
				filtered = append(filtered, l)
			}
		}
		logs = filtered
	}
	if logs == nil {
		logs = []ai.LogEntry{}
	}
	c.JSON(http.StatusOK, gin.H{"items": logs})
}

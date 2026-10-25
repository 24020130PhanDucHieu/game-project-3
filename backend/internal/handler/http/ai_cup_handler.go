package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"

	"project-tuan3/internal/qualifier"
	"project-tuan3/internal/service"
)

// AICupHandler phục vụ tab "Giải AI": đề bài, dữ liệu mẫu, bảng điểm công khai/riêng tư và khai báo kỹ thuật.
// Việc đăng ký, nộp bài, khóa, chạy và chốt đội dùng chung các route /qualifiers/:qid/... với vòng loại thường.
type AICupHandler struct {
	Service     *qualifier.Service
	Tournaments *service.TournamentService
	// Tech trả đội nhận Giải Kỹ thuật của một giải chính AI (sau khi công bố).
	Tech     func(tid string) (teamName, studentID string, score float64, ok bool)
	mu       sync.Mutex
	datasets map[string]json.RawMessage
}

type aiFamilyInfo struct {
	Kind string `json:"kind"`
	Name string `json:"name"`
	Hint string `json:"hint"`
}

var aiPublicFamilyInfo = []aiFamilyInfo{
	{"bias", "Thiên lệch", "Ra một nước nhiều hơn hẳn hai nước còn lại. Đếm tần suất là đủ."},
	{"cycle", "Chu kỳ", "Lặp một mẫu dài 3–6 nước. Hãy tìm quy luật trong chuỗi."},
	{"markov1", "Phụ thuộc nước trước", "Nước kế tiếp phụ thuộc nước vừa rồi của chính nó (ma trận chuyển)."},
	{"beat_last", "Phản đòn", "Luôn ra nước thắng nước vừa rồi của bạn. Đối thủ này đọc bạn chứ không ngẫu nhiên."},
}

func (h *AICupHandler) aiEvent(c *gin.Context) (qualifier.Event, bool) {
	e, err := h.Service.Event(c.Param("qid"))
	if err != nil || e.Kind != qualifier.KindAI {
		c.JSON(404, gin.H{"detail": "Không tìm thấy vòng loại Giải AI."})
		return e, false
	}
	e.Seed = ""
	return e, true
}

// Events: danh sách vòng loại Giải AI, mới nhất trước.
func (h *AICupHandler) Events(c *gin.Context) {
	all, err := h.Service.Events()
	if err != nil {
		qualifierError(c, err)
		return
	}
	items := []qualifier.Event{}
	for _, e := range all {
		if e.Kind == qualifier.KindAI {
			items = append(items, e)
		}
	}
	c.JSON(200, items)
}

func (h *AICupHandler) Problem(c *gin.Context) {
	e, ok := h.aiEvent(c)
	if !ok {
		return
	}
	techniques := []gin.H{}
	for id, label := range qualifier.AITechniques {
		techniques = append(techniques, gin.H{"id": id, "label": label})
	}
	sort.Slice(techniques, func(i, j int) bool { return techniques[i]["id"].(string) < techniques[j]["id"].(string) })
	c.JSON(200, gin.H{
		"event": e, "public_seed": qualifier.PublicSeed(e.ID),
		"rounds_per_match": qualifier.AIRoundsPerMatch, "instances": qualifier.AIInstances, "board_games": qualifier.AIBoardGames,
		"weights":         gin.H{"reading": qualifier.AIReadingWeight, "board": qualifier.AIBoardWeight},
		"public_families": aiPublicFamilyInfo, "techniques": techniques,
		"limits": gin.H{"code_bytes": 65536, "move_ms": 1000, "suite_seconds": 75, "language": "PYTHON",
			"modules": []string{"random", "math", "collections", "itertools", "re", "json", "heapq", "functools", "typing"}},
	})
}

// Dataset: dữ liệu huấn luyện công khai, sinh một lần cho mỗi vòng loại từ hạt giống công khai.
func (h *AICupHandler) Dataset(c *gin.Context) {
	e, ok := h.aiEvent(c)
	if !ok {
		return
	}
	h.mu.Lock()
	cached, ok := h.datasets[e.ID]
	h.mu.Unlock()
	if !ok {
		result, err := h.Service.Engine.Mutate(nil, "ai-dataset", map[string]interface{}{"public_seed": qualifier.PublicSeed(e.ID), "matches": 6, "rounds_per_match": qualifier.AIRoundsPerMatch})
		if err != nil {
			c.JSON(503, gin.H{"detail": "Máy chấm chưa sẵn sàng. Hãy thử lại sau ít phút."})
			return
		}
		raw, err := json.Marshal(result)
		if err != nil {
			c.JSON(500, gin.H{"detail": "Không tạo được bộ dữ liệu."})
			return
		}
		cached = raw
		h.mu.Lock()
		if h.datasets == nil {
			h.datasets = map[string]json.RawMessage{}
		}
		h.datasets[e.ID] = raw
		h.mu.Unlock()
	}
	c.Header("Cache-Control", "public, max-age=600")
	c.Header("Content-Disposition", `attachment; filename="giai-ai-du-lieu-mau.json"`)
	c.Data(200, "application/json; charset=utf-8", cached)
}

func (h *AICupHandler) Leaderboard(c *gin.Context) {
	private := c.Query("board") == "private"
	organizer := requestSession(c).Role == "ADMIN"
	e, rows, err := h.Service.AILeaderboard(c.Param("qid"), private, organizer)
	if err != nil {
		code := 400
		if private && strings.Contains(err.Error(), "sẽ mở") {
			code = 403
		}
		c.JSON(code, gin.H{"detail": err.Error()})
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(200, gin.H{"board": map[bool]string{false: "public", true: "private"}[private], "items": rows, "total": len(rows),
		"private_visible": qualifier.PrivateVisible(e), "status": e.Status, "applied_round": e.AppliedRound, "rounds": e.Rounds})
}

// Mine: kết quả từng lượt của đội đang đăng nhập. Phần riêng tư chỉ có sau khi vòng loại kết thúc.
func (h *AICupHandler) Mine(c *gin.Context) {
	e, ok := h.aiEvent(c)
	if !ok {
		return
	}
	session := requestSession(c)
	sid := session.StudentID
	organizer := session.Role == "ADMIN"
	if organizer {
		sid = strings.ToUpper(strings.TrimSpace(c.Query("student_id")))
	}
	if sid == "" {
		c.JSON(200, gin.H{"registered": false})
		return
	}
	var p qualifier.Participant
	if err := h.Service.Store.Get("participant:"+e.ID+":"+sid, &p); err != nil {
		c.JSON(200, gin.H{"registered": false})
		return
	}
	reveal := organizer || qualifier.PrivateVisible(e)
	raw, err := h.Service.Store.ListMetadata("job:"+e.ID+":", sid)
	if err != nil {
		qualifierError(c, err)
		return
	}
	rounds := []gin.H{}
	for _, value := range raw {
		var job qualifier.Job
		if json.Unmarshal(value, &job) != nil || job.AI == nil || job.A != sid {
			continue
		}
		row := gin.H{"round": job.Round, "public": job.AI.Public, "families_public": job.AI.FamiliesPublic, "notes": job.AI.Notes, "failed": job.AI.Failed, "elapsed_ms": job.AI.ElapsedMs}
		if reveal {
			row["private"], row["reading"], row["board"] = job.AI.Private, job.AI.Reading, job.AI.Board
			row["families_private"], row["bosses"] = job.AI.FamiliesPrivate, job.AI.Bosses
		}
		rounds = append(rounds, row)
	}
	sort.Slice(rounds, func(i, j int) bool { return rounds[i]["round"].(int) < rounds[j]["round"].(int) })
	out := gin.H{"registered": true, "student_id": p.SID, "team_name": p.Name, "technique": p.Technique, "model_card": p.ModelCard,
		"locked": p.LockedID != "", "banned": p.Banned, "ban_reason": p.BanReason, "submitted_at": p.SubmittedAt, "valid": p.ValidID != "", "pending": p.Pending,
		"rounds_done": p.AIRounds, "public": p.AIPublic, "private_visible": reveal, "rounds": rounds}
	if reveal {
		out["private"], out["reading"], out["board"] = p.AIPrivate, p.AIReading, p.AIBoard
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(200, out)
}

func (h *AICupHandler) ModelCard(c *gin.Context) {
	session := requestSession(c)
	if session.Role != "TEAM" {
		c.JSON(403, gin.H{"detail": "Chỉ tài khoản đội được khai báo kỹ thuật."})
		return
	}
	var req struct {
		Technique string `json:"technique"`
		Card      string `json:"model_card"`
	}
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(400, gin.H{"detail": "Khai báo không hợp lệ."})
		return
	}
	if _, ok := h.aiEvent(c); !ok {
		return
	}
	if err := h.Service.SetModelCard(c.Param("qid"), session.StudentID, req.Technique, req.Card); err != nil {
		qualifierError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS"})
}


// AIBadge là một huy hiệu của Giải AI, tính từ kết quả thật (không lưu riêng nên không thể sai lệch).
type AIBadge struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Desc   string `json:"desc"`
	Tone   string `json:"tone"`
	Source string `json:"source"`
}

// Badges: GET /api/ai-badges/:sid — huy hiệu Giải AI của một đội, tách riêng khỏi huy hiệu thử thách của giải thường.
func (h *AICupHandler) Badges(c *gin.Context) {
	sid := strings.ToUpper(strings.TrimSpace(c.Param("sid")))
	out := []AIBadge{}
	events, err := h.Service.Events()
	if err != nil {
		qualifierError(c, err)
		return
	}
	for _, e := range events {
		if e.Kind != qualifier.KindAI || !qualifier.PrivateVisible(e) {
			continue
		}
		var p qualifier.Participant
		if h.Service.Store.Get("participant:"+e.ID+":"+sid, &p) != nil || p.LockedID == "" || p.Banned || p.AIRounds == 0 {
			continue
		}
		out = append(out, AIBadge{"ai-finisher", "Hoàn thành vòng loại AI", "Mô hình được chấm đủ các lượt trên bộ đề ẩn.", "info", e.Name})
		if p.AIReading >= 70 {
			out = append(out, AIBadge{"ai-reader", "Đọc được đối thủ", "Điểm đọc đối thủ trên bộ ẩn từ 70 trở lên.", "success", e.Name})
		}
		if gap := p.AIPublic - p.AIReading; p.AIReading >= 60 && gap <= 3 && gap >= -3 {
			out = append(out, AIBadge{"ai-general", "Mô hình khái quát", "Điểm bộ công khai và bộ ẩn lệch nhau không quá 3 điểm.", "accent", e.Name})
		}
	}
	if h.Tournaments != nil {
		for tid, raw := range h.Tournaments.GetAllTournaments() {
			t, _ := raw.(map[string]interface{})
			if tournamentTrack(t) != "AI" {
				continue
			}
			name := fmt.Sprint(t["name"])
			if _, in := tournamentTeam(t, sid); in {
				out = append(out, AIBadge{"ai-main", "Vào giải chính AI", "Vượt vòng loại AI vào giải loại trực tiếp.", "info", name})
			}
			for _, p := range placementsOf(t) {
				if !strings.EqualFold(p.StudentID, sid) {
					continue
				}
				switch p.Rank {
				case 1:
					out = append(out, AIBadge{"ai-champion", "Vô địch Giải AI", "Quán quân giải chính AI.", "warning", name})
				case 2:
					out = append(out, AIBadge{"ai-runner-up", "Á quân Giải AI", "Vào chung kết giải chính AI.", "accent", name})
				default:
					out = append(out, AIBadge{"ai-third", "Đồng hạng Ba Giải AI", "Vào bán kết giải chính AI.", "accent", name})
				}
			}
			if h.Tech != nil {
				if _, winner, _, ok := h.Tech(tid); ok && strings.EqualFold(winner, sid) {
					out = append(out, AIBadge{"ai-tech", "Giải Kỹ thuật", "Báo cáo kỹ thuật điểm cao nhất giải chính AI.", "warning", name})
				}
			}
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	c.JSON(200, gin.H{"student_id": sid, "items": out})
}

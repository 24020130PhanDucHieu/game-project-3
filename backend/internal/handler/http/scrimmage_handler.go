package http

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/qualifier"
	"project-tuan3/internal/repository"
	"project-tuan3/internal/service"
)

// StatelessRunner chạy một tác vụ không gắn giải trên worker (giao hữu, thử thách).
type StatelessRunner interface {
	RunStateless(action string, params map[string]interface{}) (map[string]interface{}, error)
}

// ScrimmageHandler: đội thách đấu đội khác bằng bot hợp lệ mới nhất của vòng loại. Không tính ELO,
// không ảnh hưởng giải. Mã nguồn đối thủ chỉ chạy trong sandbox, không bao giờ được trả về.
type ScrimmageHandler struct {
	Store   *repository.QualifierRecords
	Engine  StatelessRunner
	mu      sync.Mutex
	lastRun map[string]time.Time
}

type ScrimSide struct {
	StudentID string `json:"student_id"`
	TeamName  string `json:"team_name"`
	Language  string `json:"language"`
	Source    string `json:"source"`
}

type Scrimmage struct {
	ID          string    `json:"id"`
	QualifierID string    `json:"qualifier_id"`
	RuleID      string    `json:"rule_id"`
	Red         ScrimSide `json:"red"`
	Blue        ScrimSide `json:"blue"`
	Winner      string    `json:"winner_side,omitempty"`
	WinReason   string    `json:"win_reason,omitempty"`
	RedAlive    int       `json:"final_red_alive"`
	BlueAlive   int       `json:"final_blue_alive"`
	CreatedAt   time.Time `json:"created_at"`
}

const scrimCooldown = 20 * time.Second

func scrimOptOutKey(sid string) string { return "scrim-optout:" + strings.ToUpper(sid) }

func (h *ScrimmageHandler) accepts(sid string) bool {
	var v struct {
		Accept bool `json:"accept"`
	}
	if err := h.Store.Get(scrimOptOutKey(sid), &v); err != nil {
		return true // mặc định nhận lời giao hữu
	}
	return v.Accept
}

func (h *ScrimmageHandler) participant(qid, sid string) (qualifier.Participant, error) {
	var p qualifier.Participant
	err := h.Store.Get("participant:"+qid+":"+strings.ToUpper(sid), &p)
	if errors.Is(err, sql.ErrNoRows) {
		err = h.Store.Get("participant:"+qid+":"+sid, &p)
	}
	return p, err
}

// throttle trả false nếu đội vừa chạy tác vụ trong khoảng cooldown.
func throttle(mu *sync.Mutex, last *map[string]time.Time, key string, cooldown time.Duration) bool {
	mu.Lock()
	defer mu.Unlock()
	if *last == nil {
		*last = map[string]time.Time{}
	}
	if at, ok := (*last)[key]; ok && time.Since(at) < cooldown {
		return false
	}
	(*last)[key] = time.Now()
	return true
}

func (h *ScrimmageHandler) Create(c *gin.Context) {
	session := requestSession(c)
	if session.Role != "TEAM" || session.StudentID == "" {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Chỉ tài khoản đội được thách đấu giao hữu."})
		return
	}
	var req struct {
		QualifierID string `json:"qualifier_id"`
		Opponent    string `json:"opponent_student_id"`
		RuleID      string `json:"rule_id"`
		Code        string `json:"code"`
		Language    string `json:"language"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 100000)
	if c.ShouldBindJSON(&req) != nil || req.QualifierID == "" || req.Opponent == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Chọn vòng loại và đội đối thủ."})
		return
	}
	if strings.EqualFold(req.Opponent, session.StudentID) {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Không thể thách đấu chính đội mình — hãy dùng Đấu thử boss."})
		return
	}
	if req.RuleID == "" {
		req.RuleID = "STAGE_1_STANDARD"
	}
	if !service.ValidStageRule(req.RuleID) {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Luật không hợp lệ."})
		return
	}
	if len(req.Code) > 65536 || (req.Language != "" && req.Language != "PYTHON" && req.Language != "CPP") {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Mã tối đa 64 KB, ngôn ngữ Python hoặc C++."})
		return
	}

	me, err := h.participant(req.QualifierID, session.StudentID)
	if err != nil || me.SID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Đội bạn chưa đăng ký vòng loại này."})
		return
	}
	opp, err := h.participant(req.QualifierID, req.Opponent)
	if err != nil || opp.SID == "" || opp.Code == "" || opp.ValidID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Đội đối thủ chưa có bài hợp lệ trong vòng loại này."})
		return
	}
	// Bot thử nghiệm của BTC luôn nhận giao hữu để các đội luyện tập.
	if !opp.TestBot && !h.accepts(opp.SID) {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Đội này đang tắt nhận lời thách đấu giao hữu."})
		return
	}
	mySource, myCode, myLang := "draft", strings.TrimSpace(req.Code), req.Language
	if myCode == "" {
		mySource, myCode, myLang = "latest", me.Code, me.Language
	}
	if myCode == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Đội bạn chưa có bài hợp lệ; hãy nộp bài hoặc dùng mã đang soạn."})
		return
	}
	if myLang == "" {
		myLang = "PYTHON"
	}
	if !throttle(&h.mu, &h.lastRun, session.StudentID, scrimCooldown) {
		c.Header("Retry-After", "20")
		c.JSON(http.StatusTooManyRequests, gin.H{"detail": "Mỗi đội chỉ được thách đấu 1 trận mỗi 20 giây."})
		return
	}

	id := time.Now().UTC().Format("20060102T150405.000") + "-" + randomID()
	result, err := h.Engine.RunStateless("friendly-match", map[string]interface{}{
		"code_a": myCode, "language_a": myLang, "code_b": opp.Code, "language_b": opp.Language, "rule_id": req.RuleID, "seed": id,
	})
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Máy chấm đang bận hoặc lỗi; hãy thử lại sau ít phút."})
		return
	}
	scrim := Scrimmage{
		ID: id, QualifierID: req.QualifierID, RuleID: req.RuleID, CreatedAt: time.Now().UTC(),
		Red:  ScrimSide{StudentID: me.SID, TeamName: me.Name, Language: myLang, Source: mySource},
		Blue: ScrimSide{StudentID: opp.SID, TeamName: opp.Name, Language: opp.Language, Source: "latest"},
	}
	scrim.Winner, _ = result["winner_side"].(string)
	scrim.WinReason, _ = result["win_reason"].(string)
	if n, ok := result["final_red_alive"].(float64); ok {
		scrim.RedAlive = int(n)
	}
	if n, ok := result["final_blue_alive"].(float64); ok {
		scrim.BlueAlive = int(n)
	}
	// Chỉ trả lỗi bot của phía mình: thông báo lỗi có thể chứa đoạn mã nguồn của đối thủ.
	myError := ""
	if errs, ok := result["bot_errors"].(map[string]interface{}); ok {
		myError, _ = errs["team_a"].(string)
	}
	replay := gin.H{"board_steps": result["board_steps"], "mystery_tiles": result["mystery_tiles"]}
	if err := h.Store.Batch(map[string]interface{}{"scrim:" + id: scrim, "scrimreplay:" + id: replay}); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Đã đấu xong nhưng chưa lưu được kết quả."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "scrimmage": scrim, "board_steps": result["board_steps"], "my_bot_error": myError})
}

func (h *ScrimmageHandler) List(c *gin.Context) {
	session := requestSession(c)
	rows, err := h.Store.List("scrim:")
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Không tải được lịch sử giao hữu."})
		return
	}
	items := []Scrimmage{}
	for _, raw := range rows {
		var s Scrimmage
		if json.Unmarshal(raw, &s) != nil || s.ID == "" {
			continue
		}
		if session.Role == "ADMIN" || strings.EqualFold(s.Red.StudentID, session.StudentID) || strings.EqualFold(s.Blue.StudentID, session.StudentID) {
			items = append(items, s)
		}
	}
	sort.Slice(items, func(i, j int) bool { return items[i].CreatedAt.After(items[j].CreatedAt) })
	if len(items) > 30 {
		items = items[:30]
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"items": items, "accept": h.accepts(session.StudentID)})
}

func (h *ScrimmageHandler) Replay(c *gin.Context) {
	session := requestSession(c)
	id := c.Param("scrimId")
	var s Scrimmage
	if err := h.Store.Get("scrim:"+id, &s); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Không tìm thấy trận giao hữu."})
		return
	}
	if session.Role != "ADMIN" && !strings.EqualFold(s.Red.StudentID, session.StudentID) && !strings.EqualFold(s.Blue.StudentID, session.StudentID) {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Bạn không tham gia trận giao hữu này."})
		return
	}
	var replay map[string]interface{}
	if err := h.Store.Get("scrimreplay:"+id, &replay); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Replay đã bị xóa."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"scrimmage": s, "board_steps": replay["board_steps"], "mystery_tiles": replay["mystery_tiles"]})
}

func (h *ScrimmageHandler) Settings(c *gin.Context) {
	session := requestSession(c)
	if session.Role != "TEAM" {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Chỉ đội thi có cài đặt này."})
		return
	}
	var req struct {
		Accept bool `json:"accept"`
	}
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Cài đặt không hợp lệ."})
		return
	}
	if err := h.Store.Batch(map[string]interface{}{scrimOptOutKey(session.StudentID): gin.H{"accept": req.Accept}}); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Chưa lưu được cài đặt."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "accept": req.Accept})
}

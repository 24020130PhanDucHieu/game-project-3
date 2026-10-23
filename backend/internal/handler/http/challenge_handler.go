package http

import (
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/repository"
)

// Challenge là một thử thách luyện tập đấu boss. Chỉ server chạy trận và quyết định đạt/không đạt.
type Challenge struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Boss     string `json:"boss"`
	RuleID   string `json:"rule_id"`
	Runs     int    `json:"runs"`
	NeedWins int    `json:"need_wins"`
	Badge    string `json:"badge"`
	Tier     string `json:"tier"`
}

// Thứ tự là thứ tự mở khóa: phải vượt thử thách trước mới thử được thử thách sau.
var Challenges = []Challenge{
	{"c01", "Khởi động: hạ Boss ngẫu nhiên", "RANDOM", "STAGE_1_STANDARD", 1, 1, "🌱", "Đồng"},
	{"c02", "Chặn đứng Boss tấn công", "AGGRESSIVE", "STAGE_1_STANDARD", 1, 1, "🛡️", "Đồng"},
	{"c03", "Qua mặt Boss thích ứng", "ADAPTIVE", "STAGE_1_STANDARD", 1, 1, "🧠", "Đồng"},
	{"c04", "Thế giới đảo ngược I", "RANDOM", "COMBO_2", 1, 1, "🔄", "Bạc"},
	{"c05", "Thế giới đảo ngược II", "AGGRESSIVE", "COMBO_2", 1, 1, "🌀", "Bạc"},
	{"c06", "Thế giới đảo ngược III", "ADAPTIVE", "COMBO_2", 1, 1, "♾️", "Bạc"},
	{"c07", "Trong màn sương I", "RANDOM", "COMBO_4", 1, 1, "🌫️", "Vàng"},
	{"c08", "Trong màn sương II", "AGGRESSIVE", "COMBO_4", 1, 1, "👁️", "Vàng"},
	{"c09", "Trong màn sương III", "ADAPTIVE", "COMBO_4", 1, 1, "🦉", "Vàng"},
	{"c10", "Ổn định: thắng 4/5 ván Boss thích ứng", "ADAPTIVE", "STAGE_1_STANDARD", 5, 4, "📈", "Bạch kim"},
	{"c11", "Hỗn loạn: thắng 3/5 ván với cả ba luật", "ADAPTIVE", "COMBO_7", 5, 3, "🔥", "Bạch kim"},
	{"c12", "Huyền thoại: thắng 4/5 ván trộn quân + sương mù", "AGGRESSIVE", "COMBO_5", 5, 4, "👑", "Kim cương"},
}

type ChallengeBadge struct {
	ChallengeID string    `json:"challenge_id"`
	At          time.Time `json:"at"`
	Attempts    int       `json:"attempts"`
}

type challengeStat struct {
	Attempts int `json:"attempts"`
	BestWins int `json:"best_wins"`
}

type ChallengeHandler struct {
	Store    *repository.QualifierRecords
	Accounts *repository.Accounts
	Engine   StatelessRunner
	mu       sync.Mutex
	last     map[string]time.Time
}

func challengeByID(id string) (int, *Challenge) {
	for i := range Challenges {
		if Challenges[i].ID == id {
			return i, &Challenges[i]
		}
	}
	return -1, nil
}

func (h *ChallengeHandler) badges(sid string) (map[string]ChallengeBadge, error) {
	rows, err := h.Store.List("badge:" + strings.ToUpper(sid) + ":")
	if err != nil {
		return nil, err
	}
	out := map[string]ChallengeBadge{}
	for _, raw := range rows {
		var b ChallengeBadge
		if json.Unmarshal(raw, &b) == nil && b.ChallengeID != "" {
			out[b.ChallengeID] = b
		}
	}
	return out, nil
}

func (h *ChallengeHandler) List(c *gin.Context) {
	session := requestSession(c)
	passed := map[string]ChallengeBadge{}
	stats := map[string]challengeStat{}
	if session.Role == "TEAM" {
		var err error
		if passed, err = h.badges(session.StudentID); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Không tải được tiến độ thử thách."})
			return
		}
		rows, _ := h.Store.List("chalstat:" + strings.ToUpper(session.StudentID) + ":")
		for key, raw := range rows {
			var s challengeStat
			if json.Unmarshal(raw, &s) == nil {
				stats[key[strings.LastIndex(key, ":")+1:]] = s
			}
		}
	}
	items := make([]gin.H, 0, len(Challenges))
	unlocked := true
	for _, ch := range Challenges {
		badge, done := passed[ch.ID]
		item := gin.H{"challenge": ch, "passed": done, "unlocked": unlocked || done, "attempts": stats[ch.ID].Attempts, "best_wins": stats[ch.ID].BestWins}
		if done {
			item["passed_at"] = badge.At
		}
		items = append(items, item)
		unlocked = done
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"items": items, "passed": len(passed), "total": len(Challenges)})
}

func (h *ChallengeHandler) Attempt(c *gin.Context) {
	session := requestSession(c)
	if session.Role != "TEAM" || session.StudentID == "" {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Chỉ tài khoản đội được làm thử thách."})
		return
	}
	index, ch := challengeByID(c.Param("challengeId"))
	if ch == nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Không có thử thách này."})
		return
	}
	var req struct {
		Code     string `json:"code"`
		Language string `json:"language"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 100000)
	if c.ShouldBindJSON(&req) != nil || strings.TrimSpace(req.Code) == "" || len(req.Code) > 65536 {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Cần mã nguồn bot (tối đa 64 KB)."})
		return
	}
	if req.Language != "CPP" {
		req.Language = "PYTHON"
	}
	sid := strings.ToUpper(session.StudentID)
	passed, err := h.badges(sid)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Không tải được tiến độ thử thách."})
		return
	}
	if index > 0 {
		if _, ok := passed[Challenges[index-1].ID]; !ok {
			c.JSON(http.StatusForbidden, gin.H{"detail": "Hãy vượt thử thách trước để mở khóa thử thách này."})
			return
		}
	}
	cooldown := 10 * time.Second
	if ch.Runs > 1 {
		cooldown = 30 * time.Second
	}
	if !throttle(&h.mu, &h.last, sid, cooldown) {
		c.Header("Retry-After", "10")
		c.JSON(http.StatusTooManyRequests, gin.H{"detail": "Bạn vừa thử thách xong, hãy đợi giây lát rồi thử lại."})
		return
	}

	wins := 0
	runs := []gin.H{}
	var lastSteps interface{}
	myError := ""
	for run := 0; run < ch.Runs; run++ {
		res, err := h.Engine.RunStateless("practice-match", map[string]interface{}{
			"code_content": req.Code, "language": req.Language, "side": "team_a", "boss": ch.Boss, "rule_id": ch.RuleID,
		})
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Máy chấm đang bận hoặc lỗi; lượt thử không được tính."})
			return
		}
		won := res["winner"] == "team_a"
		if won {
			wins++
		}
		reason, _ := res["win_reason"].(string)
		runs = append(runs, gin.H{"won": won, "win_reason": reason})
		lastSteps = res["board_steps"]
		if errs, ok := res["bot_errors"].(map[string]interface{}); ok && myError == "" {
			myError, _ = errs["team_a"].(string)
		}
		// Dừng sớm khi đã chắc chắn đạt hoặc chắc chắn trượt.
		if wins >= ch.NeedWins || wins+(ch.Runs-run-1) < ch.NeedWins {
			break
		}
	}
	success := wins >= ch.NeedWins

	statKey := "chalstat:" + sid + ":" + ch.ID
	var stat challengeStat
	_ = h.Store.Get(statKey, &stat)
	stat.Attempts++
	if wins > stat.BestWins {
		stat.BestWins = wins
	}
	writes := map[string]interface{}{statKey: stat}
	_, already := passed[ch.ID]
	if success && !already {
		writes["badge:"+sid+":"+ch.ID] = ChallengeBadge{ChallengeID: ch.ID, At: time.Now().UTC(), Attempts: stat.Attempts}
	}
	if err := h.Store.Batch(writes); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Chưa lưu được kết quả thử thách."})
		return
	}
	if success && !already && h.Accounts != nil {
		_ = h.Accounts.CreateNotification(repository.Notification{RecipientID: sid, EventType: "BADGE", Title: "Nhận huy hiệu " + ch.Badge, Message: "Bạn đã vượt thử thách “" + ch.Title + "”.", LinkTab: "qualifier", CreatedAt: time.Now().UTC()})
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "passed": success, "new_badge": success && !already, "wins": wins, "runs": runs, "need_wins": ch.NeedWins, "board_steps": lastSteps, "my_bot_error": myError, "attempts": stat.Attempts})
}

// Badges trả huy hiệu thử thách đã đạt của một đội (công khai).
func (h *ChallengeHandler) Badges(c *gin.Context) {
	passed, err := h.badges(c.Param("studentId"))
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Không tải được huy hiệu."})
		return
	}
	items := []gin.H{}
	for _, ch := range Challenges {
		if b, ok := passed[ch.ID]; ok {
			items = append(items, gin.H{"id": ch.ID, "badge": ch.Badge, "title": ch.Title, "tier": ch.Tier, "at": b.At})
		}
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i]["at"].(time.Time).Before(items[j]["at"].(time.Time)) })
	c.JSON(http.StatusOK, gin.H{"items": items})
}

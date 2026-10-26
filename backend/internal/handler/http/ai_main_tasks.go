package http

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"project-tuan3/internal/qualifier"
	"project-tuan3/internal/service"
)

// Giải chính AI chế độ hiệp đề ML: BTC bốc đề ngẫu nhiên từ kho cho từng hiệp của từng vòng, xem trước, bốc lại, rồi khóa.
// Kế hoạch (kèm hạt giống) nằm trong JSON giải dưới khóa ai_task_plan; người ngoài BTC không bao giờ nhận được nó (xem redactTournament).

const roundsPerMatch = 5

type AIMainTaskHandler struct {
	Service *service.TournamentService
	Bank    qualifier.BankSource
	data    taskDataCache
}

func (h *AIMainTaskHandler) aiTask(c *gin.Context) (map[string]interface{}, bool) {
	t, err := h.Service.GetTournamentByID(c.Param("tid"))
	if err != nil || tournamentTrack(t) != "AI" || t["round_mode"] != "TASK" {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Không tìm thấy giải chính AI dùng hiệp đề ML."})
		return nil, false
	}
	return t, true
}

func levelCount(t map[string]interface{}) int {
	top := 0
	matches, _ := t["matches"].(map[string]interface{})
	for _, raw := range matches {
		if m, ok := raw.(map[string]interface{}); ok && int(num(m["round_level"])) > top {
			top = int(num(m["round_level"]))
		}
	}
	return top
}

func planOf(t map[string]interface{}) map[string]interface{} {
	plan, _ := t["ai_task_plan"].(map[string]interface{})
	if plan == nil {
		plan = map[string]interface{}{"locked": false}
	}
	if _, ok := plan["levels"].(map[string]interface{}); !ok {
		plan["levels"] = map[string]interface{}{}
	}
	return plan
}

func publicLevels(plan map[string]interface{}) gin.H {
	out := gin.H{}
	levels, _ := plan["levels"].(map[string]interface{})
	for key, raw := range levels {
		list := []interface{}{}
		items, _ := raw.([]interface{})
		for _, it := range items {
			entry, _ := it.(map[string]interface{})
			list = append(list, entry["public"])
		}
		out[key] = list
	}
	return out
}

func (h *AIMainTaskHandler) view(t map[string]interface{}) gin.H {
	plan := planOf(t)
	return gin.H{"locked": plan["locked"] == true, "levels": publicLevels(plan), "level_count": levelCount(t), "rounds": roundsPerMatch}
}

// Tasks: GET /api/ai-main/:tid/tasks (quản trị) — kế hoạch đề công khai theo vòng.
func (h *AIMainTaskHandler) Tasks(c *gin.Context) {
	t, ok := h.aiTask(c)
	if !ok {
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, h.view(t))
}

func (h *AIMainTaskHandler) bankInputs() ([]interface{}, []string, error) {
	if h.Bank == nil {
		return []interface{}{}, []string{}, nil
	}
	return h.Bank.BankInputs()
}

func ids(items []interface{}) []string {
	out := []string{}
	for _, it := range items {
		if e, _ := it.(map[string]interface{}); e != nil {
			if item, _ := e["item"].(map[string]interface{}); item != nil {
				if id, _ := item["entry_id"].(string); id != "" {
					out = append(out, id)
				}
			}
		}
	}
	return out
}

// Roll: POST /api/ai-main/:tid/tasks/roll {tags, difficulties, level, index} — bốc cả giải, hoặc bốc lại đề ở (level, index).
func (h *AIMainTaskHandler) Roll(c *gin.Context) {
	t, ok := h.aiTask(c)
	if !ok {
		return
	}
	var req struct {
		Tags         []string `json:"tags"`
		Difficulties []int    `json:"difficulties"`
		Level        int      `json:"level"`
		Index        *int     `json:"index"`
	}
	_ = c.ShouldBindJSON(&req)
	if planOf(t)["locked"] == true {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Bộ đề đã khóa. Hãy mở khóa trước khi bốc lại."})
		return
	}
	levels := levelCount(t)
	if levels == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Giải chưa có sơ đồ trận."})
		return
	}
	custom, disabled, err := h.bankInputs()
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Không đọc được kho đề."})
		return
	}
	params := map[string]interface{}{"seed": strconv.FormatInt(time.Now().UnixNano(), 36), "custom": custom, "disabled": disabled, "ramp": true}
	if len(req.Tags) > 0 {
		params["tags"] = req.Tags
	}
	if len(req.Difficulties) > 0 {
		params["difficulties"] = req.Difficulties
	}
	single := req.Index != nil
	if single {
		if req.Level < 1 || req.Level > levels || *req.Index < 0 || *req.Index >= roundsPerMatch {
			c.JSON(http.StatusBadRequest, gin.H{"detail": "Vòng hoặc hiệp không hợp lệ."})
			return
		}
		existing, _ := planOf(t)["levels"].(map[string]interface{})[strconv.Itoa(req.Level)].([]interface{})
		if *req.Index >= len(existing) {
			c.JSON(http.StatusBadRequest, gin.H{"detail": "Hãy bốc cả bộ trước."})
			return
		}
		params["count"], params["ramp"], params["exclude"] = 1, false, ids(existing)
	} else {
		params["count"] = levels * roundsPerMatch
	}
	result, err := h.Service.Engine().Mutate(nil, "ai-task-roll", params)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	rawPlan, _ := result["plan"].([]interface{})
	rawPublic, _ := result["public"].([]interface{})
	if len(rawPlan) != len(rawPublic) || len(rawPlan) == 0 {
		c.JSON(http.StatusBadGateway, gin.H{"detail": "Máy chấm trả về bộ đề không hợp lệ."})
		return
	}
	pair := func(i, slot int) map[string]interface{} {
		item, _ := rawPlan[i].(map[string]interface{})
		spec, _ := rawPublic[i].(map[string]interface{})
		item["n"], spec["n"] = float64(slot), float64(slot+1)
		return map[string]interface{}{"item": item, "public": spec}
	}
	updated, err := h.Service.UpdateTournament(c.Param("tid"), func(tt map[string]interface{}) error {
		plan := planOf(tt)
		if plan["locked"] == true {
			return errors.New("Bộ đề đã khóa.")
		}
		lv, _ := plan["levels"].(map[string]interface{})
		if single {
			key := strconv.Itoa(req.Level)
			items, _ := lv[key].([]interface{})
			if *req.Index >= len(items) {
				return errors.New("Hãy bốc cả bộ trước.")
			}
			next := append([]interface{}{}, items...)
			next[*req.Index] = pair(0, *req.Index)
			lv[key] = next
		} else {
			lv = map[string]interface{}{}
			for level := 1; level <= levels; level++ {
				items := []interface{}{}
				for slot := 0; slot < roundsPerMatch; slot++ {
					items = append(items, pair((level-1)*roundsPerMatch+slot, slot))
				}
				lv[strconv.Itoa(level)] = items
			}
		}
		plan["levels"], plan["locked"], plan["updated_at"] = lv, false, float64(time.Now().UnixMilli())/1000
		tt["ai_task_plan"] = plan
		return nil
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	h.data.purge()
	c.JSON(http.StatusOK, h.view(updated))
}

func (h *AIMainTaskHandler) Lock(c *gin.Context)   { h.setLock(c, true) }
func (h *AIMainTaskHandler) Unlock(c *gin.Context) { h.setLock(c, false) }

func (h *AIMainTaskHandler) setLock(c *gin.Context, lock bool) {
	if _, ok := h.aiTask(c); !ok {
		return
	}
	updated, err := h.Service.UpdateTournament(c.Param("tid"), func(t map[string]interface{}) error {
		plan := planOf(t)
		levels := levelCount(t)
		lv, _ := plan["levels"].(map[string]interface{})
		if lock {
			for level := 1; level <= levels; level++ {
				if items, _ := lv[strconv.Itoa(level)].([]interface{}); len(items) != roundsPerMatch {
					return fmt.Errorf("Cần bốc đủ %d đề cho mỗi vòng (vòng %d chưa đủ).", roundsPerMatch, level)
				}
			}
		} else {
			matches, _ := t["matches"].(map[string]interface{})
			for _, raw := range matches {
				if m, _ := raw.(map[string]interface{}); m != nil {
					if h, _ := m["rounds_history"].([]interface{}); len(h) > 0 {
						return errors.New("Đã có hiệp đấu theo bộ đề này nên không mở khóa được.")
					}
				}
			}
		}
		plan["locked"] = lock
		t["ai_task_plan"] = plan
		return nil
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	h.data.purge()
	c.JSON(http.StatusOK, h.view(updated))
}

// MatchTask: GET /api/ai-main/:tid/matches/:mid/task — đề và dữ liệu huấn luyện của hiệp hiện tại; chỉ hai đội trong trận và BTC.
func (h *AIMainTaskHandler) MatchTask(c *gin.Context) {
	t, ok := h.aiTask(c)
	if !ok {
		return
	}
	matches, _ := t["matches"].(map[string]interface{})
	match, _ := matches[c.Param("mid")].(map[string]interface{})
	if match == nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Không tìm thấy trận đấu."})
		return
	}
	session := requestSession(c)
	allowed := session.Role == "ADMIN"
	for _, side := range []string{"team_a", "team_b"} {
		team, _ := match[side].(map[string]interface{})
		if team != nil && session.StudentID != "" && strings.EqualFold(strings.TrimSpace(fmt.Sprint(team["student_id"])), strings.TrimSpace(session.StudentID)) {
			allowed = true
		}
	}
	if !allowed {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Chỉ hai đội trong trận và ban tổ chức tải được dữ liệu đề của hiệp."})
		return
	}
	plan := planOf(t)
	if plan["locked"] != true {
		c.JSON(http.StatusConflict, gin.H{"detail": "Ban tổ chức chưa khóa bộ đề."})
		return
	}
	level, index := int(num(match["round_level"])), int(num(match["current_round_idx"]))-1
	lv, _ := plan["levels"].(map[string]interface{})
	items, _ := lv[strconv.Itoa(level)].([]interface{})
	if index < 0 || index >= len(items) {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Chưa có đề cho hiệp này."})
		return
	}
	key := fmt.Sprintf("%s:%d:%d", c.Param("tid"), level, index)
	cached, hit := h.data.get(key)
	if !hit {
		entry, _ := items[index].(map[string]interface{})
		result, err := h.Service.Engine().Mutate(nil, "ai-task-data", map[string]interface{}{"item": entry["item"]})
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Máy chấm chưa sẵn sàng. Hãy thử lại sau ít phút."})
			return
		}
		raw, err := json.Marshal(result)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"detail": "Không tạo được dữ liệu."})
			return
		}
		cached = raw
		h.data.put(key, raw)
	}
	// Cùng một địa chỉ trả dữ liệu của hiệp hiện tại; đổi hiệp thì nội dung đổi nên không được đệm.
	c.Header("Cache-Control", "no-store")
	c.Header("Content-Disposition", `attachment; filename="de-hiep-`+strconv.Itoa(level)+`-`+strconv.Itoa(index+1)+`.json"`)
	c.Data(http.StatusOK, "application/json; charset=utf-8", cached)
}

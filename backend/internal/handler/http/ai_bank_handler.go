package http

import (
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"

	"project-tuan3/internal/adapter"
)

// Kho đề của Giải AI: đề dựng sẵn nằm trong mã máy chấm; đề do admin thêm lưu ở khóa `aibank:<id>` (chỉ thông số, không có dữ liệu).
// Mọi mục đều được máy chấm kiểm tra và chuẩn hóa (mẫu hợp lệ, thông số trong trần) trước khi lưu.

type AIBankStore interface {
	Get(key string, target interface{}) error
	List(prefix string) (map[string]json.RawMessage, error)
	Batch(values map[string]interface{}) error
	DeleteKey(key string) error
}

type AIBankHandler struct {
	Store  AIBankStore
	Engine adapter.BotRunnerAdapter
	mu     sync.Mutex
}

type aiBankConfig struct {
	Disabled []string `json:"disabled"`
}

const aiBankConfigKey = "aibankcfg"

func (h *AIBankHandler) config() aiBankConfig {
	var cfg aiBankConfig
	_ = h.Store.Get(aiBankConfigKey, &cfg)
	return cfg
}

func (h *AIBankHandler) custom() ([]interface{}, error) {
	rows, err := h.Store.List("aibank:")
	if err != nil {
		return nil, err
	}
	keys := make([]string, 0, len(rows))
	for k := range rows {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := []interface{}{}
	for _, k := range keys {
		var entry map[string]interface{}
		if json.Unmarshal(rows[k], &entry) == nil {
			out = append(out, entry)
		}
	}
	return out, nil
}

// BankInputs cho vòng loại/giải bốc đề biết kho hiện tại (đề của admin và các đề dựng sẵn đang tắt).
func (h *AIBankHandler) BankInputs() ([]interface{}, []string, error) {
	custom, err := h.custom()
	return custom, h.config().Disabled, err
}

func (h *AIBankHandler) fail(c *gin.Context, status int, message string, errs interface{}) {
	c.JSON(status, gin.H{"detail": message, "errors": errs})
}

func (h *AIBankHandler) List(c *gin.Context) {
	custom, disabled, err := h.BankInputs()
	if err != nil {
		h.fail(c, http.StatusServiceUnavailable, "Không đọc được kho đề.", nil)
		return
	}
	result, err := h.Engine.Mutate(nil, "ai-task-bank", map[string]interface{}{"custom": custom, "disabled": disabled})
	if err != nil {
		h.fail(c, http.StatusServiceUnavailable, "Máy chấm chưa sẵn sàng.", nil)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"entries": result["entries"], "templates": aiBankTemplates, "policies": aiBankPolicies})
}

var aiBankTemplates = []gin.H{
	{"id": "winner", "name": "Đoán bên thắng", "kind": "phân loại"},
	{"id": "nextcard", "name": "Đoán lá bài bên đi sẽ ra", "kind": "phân loại"},
	{"id": "plies_left", "name": "Đoán số nước còn lại", "kind": "hồi quy"},
	{"id": "material", "name": "Đoán chênh lệch số quân", "kind": "hồi quy"},
	{"id": "capture_next", "name": "Đoán lượt này có ăn quân không", "kind": "phân loại"},
}

var aiBankPolicies = []string{"random", "aggressive", "counter", "majority", "hunter"}

func (h *AIBankHandler) normalize(entry map[string]interface{}) (map[string]interface{}, []interface{}, error) {
	result, err := h.Engine.Mutate(nil, "ai-task-probe", map[string]interface{}{"entry": entry, "reference": false})
	if err != nil {
		return nil, nil, err
	}
	errs, _ := result["errors"].([]interface{})
	if ok, _ := result["ok"].(bool); !ok {
		return nil, errs, nil
	}
	normalized, _ := result["entry"].(map[string]interface{})
	return normalized, nil, nil
}

func (h *AIBankHandler) existingIDs() (map[string]bool, error) {
	custom, disabled, err := h.BankInputs()
	if err != nil {
		return nil, err
	}
	result, err := h.Engine.Mutate(nil, "ai-task-bank", map[string]interface{}{"custom": custom, "disabled": disabled})
	if err != nil {
		return nil, err
	}
	ids := map[string]bool{}
	list, _ := result["entries"].([]interface{})
	for _, raw := range list {
		if e, ok := raw.(map[string]interface{}); ok {
			if id, _ := e["id"].(string); id != "" {
				ids[id] = true
			}
		}
	}
	return ids, nil
}

// Create: POST /api/ai-bank — thêm đề của admin.
func (h *AIBankHandler) Create(c *gin.Context) {
	var entry map[string]interface{}
	if c.ShouldBindJSON(&entry) != nil {
		h.fail(c, http.StatusBadRequest, "Dữ liệu đề không hợp lệ.", nil)
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	normalized, errs, err := h.normalize(entry)
	if err != nil {
		h.fail(c, http.StatusServiceUnavailable, "Máy chấm chưa sẵn sàng.", nil)
		return
	}
	if normalized == nil {
		h.fail(c, http.StatusBadRequest, "Đề chưa hợp lệ.", errs)
		return
	}
	id, _ := normalized["id"].(string)
	ids, err := h.existingIDs()
	if err != nil {
		h.fail(c, http.StatusServiceUnavailable, "Không đọc được kho đề.", nil)
		return
	}
	if ids[id] {
		h.fail(c, http.StatusConflict, "Mã đề đã tồn tại trong kho.", nil)
		return
	}
	normalized["builtin"] = false
	if err := h.Store.Batch(map[string]interface{}{"aibank:" + id: normalized}); err != nil {
		h.fail(c, http.StatusServiceUnavailable, "Chưa lưu được đề.", nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "entry": normalized})
}

// Update: PUT /api/ai-bank/:id — sửa đề của admin, hoặc bật/tắt đề dựng sẵn (body {"enabled": bool}).
func (h *AIBankHandler) Update(c *gin.Context) {
	id := strings.ToLower(strings.TrimSpace(c.Param("id")))
	var body map[string]interface{}
	if c.ShouldBindJSON(&body) != nil {
		h.fail(c, http.StatusBadRequest, "Dữ liệu đề không hợp lệ.", nil)
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	var existing map[string]interface{}
	if h.Store.Get("aibank:"+id, &existing) != nil {
		// Đề dựng sẵn: chỉ bật/tắt.
		ids, err := h.existingIDs()
		if err != nil || !ids[id] {
			h.fail(c, http.StatusNotFound, "Không tìm thấy đề trong kho.", nil)
			return
		}
		enabled, ok := body["enabled"].(bool)
		if !ok {
			h.fail(c, http.StatusBadRequest, "Đề dựng sẵn chỉ bật hoặc tắt được; muốn sửa hãy nhân bản thành đề mới.", nil)
			return
		}
		cfg := h.config()
		next := []string{}
		for _, d := range cfg.Disabled {
			if d != id {
				next = append(next, d)
			}
		}
		if !enabled {
			next = append(next, id)
		}
		if err := h.Store.Batch(map[string]interface{}{aiBankConfigKey: aiBankConfig{Disabled: next}}); err != nil {
			h.fail(c, http.StatusServiceUnavailable, "Chưa lưu được.", nil)
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "SUCCESS"})
		return
	}
	merged := map[string]interface{}{}
	for k, v := range existing {
		merged[k] = v
	}
	for k, v := range body {
		merged[k] = v
	}
	merged["id"] = id
	normalized, errs, err := h.normalize(merged)
	if err != nil {
		h.fail(c, http.StatusServiceUnavailable, "Máy chấm chưa sẵn sàng.", nil)
		return
	}
	if normalized == nil {
		h.fail(c, http.StatusBadRequest, "Đề chưa hợp lệ.", errs)
		return
	}
	normalized["builtin"] = false
	if err := h.Store.Batch(map[string]interface{}{"aibank:" + id: normalized}); err != nil {
		h.fail(c, http.StatusServiceUnavailable, "Chưa lưu được đề.", nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "entry": normalized})
}

// Delete: DELETE /api/ai-bank/:id — chỉ xóa đề của admin (kế hoạch đã khóa vẫn giữ bản sao thông số của đề).
func (h *AIBankHandler) Delete(c *gin.Context) {
	id := strings.ToLower(strings.TrimSpace(c.Param("id")))
	h.mu.Lock()
	defer h.mu.Unlock()
	var existing map[string]interface{}
	if h.Store.Get("aibank:"+id, &existing) != nil {
		h.fail(c, http.StatusNotFound, "Chỉ xóa được đề do admin thêm; đề dựng sẵn thì tắt đi.", nil)
		return
	}
	if err := h.Store.DeleteKey("aibank:" + id); err != nil {
		h.fail(c, http.StatusServiceUnavailable, "Chưa xóa được đề.", nil)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS"})
}

// Probe: POST /api/ai-bank/probe — thử một đề chưa lưu (hoặc đã có, kèm mã đề) để biết thời gian sinh, kích thước và điểm mô hình tham chiếu.
func (h *AIBankHandler) Probe(c *gin.Context) {
	var entry map[string]interface{}
	if c.ShouldBindJSON(&entry) != nil {
		h.fail(c, http.StatusBadRequest, "Dữ liệu đề không hợp lệ.", nil)
		return
	}
	result, err := h.Engine.Mutate(nil, "ai-task-probe", map[string]interface{}{"entry": entry, "reference": true})
	if err != nil {
		h.fail(c, http.StatusServiceUnavailable, "Máy chấm chưa sẵn sàng hoặc đề quá nặng.", nil)
		return
	}
	c.JSON(http.StatusOK, result)
}

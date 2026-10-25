package http

import (
	"encoding/json"
	"net/http"
	"strconv"
	"sync"

	"github.com/gin-gonic/gin"

	"project-tuan3/internal/qualifier"
)

// Vòng loại AI chế độ TASKS: xem đề, tải dữ liệu từng đề, và (quản trị) bốc/khóa bộ đề.

type taskDataCache struct {
	mu    sync.Mutex
	order []string
	items map[string]json.RawMessage
}

const taskDataCacheLimit = 12

func (c *taskDataCache) get(key string) (json.RawMessage, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	v, ok := c.items[key]
	return v, ok
}

func (c *taskDataCache) purge() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items, c.order = nil, nil
}

func (c *taskDataCache) put(key string, value json.RawMessage) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.items == nil {
		c.items = map[string]json.RawMessage{}
	}
	if _, ok := c.items[key]; !ok {
		c.order = append(c.order, key)
		for len(c.order) > taskDataCacheLimit {
			delete(c.items, c.order[0])
			c.order = c.order[1:]
		}
	}
	c.items[key] = value
}

func (h *AICupHandler) tasksEvent(c *gin.Context) (qualifier.Event, bool) {
	e, ok := h.aiEvent(c)
	if !ok {
		return e, false
	}
	if e.Mode != qualifier.ModeTasks {
		c.JSON(http.StatusConflict, gin.H{"detail": "Vòng loại này dùng đề oẳn tù tì, không dùng kho đề."})
		return e, false
	}
	return e, true
}

// Tasks: GET /api/ai-cup/:qid/tasks — bộ đề công khai (không có hạt giống); đội chỉ thấy sau khi BTC khóa đề.
func (h *AICupHandler) Tasks(c *gin.Context) {
	e, ok := h.tasksEvent(c)
	if !ok {
		return
	}
	organizer := requestSession(c).Role == "ADMIN"
	list, locked, err := h.Service.PublicTasks(e.ID, organizer)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Chưa đọc được bộ đề. Hãy thử lại."})
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"tasks": list, "locked": locked, "count": e.TaskCount})
}

// TaskData: GET /api/ai-cup/:qid/tasks/:n/data — đề + dữ liệu huấn luyện có nhãn của đề thứ n (n bắt đầu từ 1).
func (h *AICupHandler) TaskData(c *gin.Context) {
	e, ok := h.tasksEvent(c)
	if !ok {
		return
	}
	n, err := strconv.Atoi(c.Param("n"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Số thứ tự đề không hợp lệ."})
		return
	}
	key := e.ID + ":" + c.Param("n")
	cached, hit := h.taskData.get(key)
	if !hit {
		item, err := h.Service.TaskItem(e.ID, n-1)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"detail": err.Error()})
			return
		}
		result, err := h.Service.Engine.Mutate(nil, "ai-task-data", map[string]interface{}{"item": item})
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
		h.taskData.put(key, raw)
	}
	c.Header("Cache-Control", "public, max-age=300")
	c.Header("Content-Disposition", `attachment; filename="giai-ai-de-`+c.Param("n")+`.json"`)
	c.Data(http.StatusOK, "application/json; charset=utf-8", cached)
}

// RollTasks: POST /api/ai-cup/:qid/tasks/roll {tags, difficulties, index} — bốc cả bộ (index < 0 hoặc thiếu) hoặc bốc lại một đề.
func (h *AICupHandler) RollTasks(c *gin.Context) {
	e, ok := h.tasksEvent(c)
	if !ok {
		return
	}
	var req struct {
		Tags         []string `json:"tags"`
		Difficulties []int    `json:"difficulties"`
		Index        *int     `json:"index"`
	}
	_ = c.ShouldBindJSON(&req)
	index := -1
	if req.Index != nil {
		index = *req.Index
	}
	if _, err := h.Service.RollTasks(e.ID, req.Tags, req.Difficulties, index); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	h.taskData.purge()
	list, locked, err := h.Service.PublicTasks(e.ID, true)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Đã bốc đề nhưng chưa đọc lại được. Hãy tải lại trang."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"tasks": list, "locked": locked})
}

func (h *AICupHandler) LockTasks(c *gin.Context) { h.setLock(c, true) }

func (h *AICupHandler) UnlockTasks(c *gin.Context) { h.setLock(c, false) }

func (h *AICupHandler) setLock(c *gin.Context, lock bool) {
	e, ok := h.tasksEvent(c)
	if !ok {
		return
	}
	var err error
	if lock {
		err = h.Service.LockTasks(e.ID)
	} else {
		err = h.Service.UnlockTasks(e.ID)
	}
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	h.taskData.purge()
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "locked": lock})
}

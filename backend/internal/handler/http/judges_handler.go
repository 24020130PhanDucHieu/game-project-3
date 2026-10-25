package http

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/repository"
)

// JudgesHandler quản lý tài khoản giám khảo; chỉ tài khoản chủ (ADMIN_PASSWORD) được dùng.
type JudgesHandler struct{ Judges *repository.Judges }

func requireOwner(c *gin.Context) bool {
	if !requestSession(c).IsOwner() {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Chỉ tài khoản chủ của ban tổ chức được quản lý giám khảo."})
		return false
	}
	return true
}

func judgeError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, repository.ErrJudgeMissing):
		c.JSON(http.StatusNotFound, gin.H{"detail": err.Error()})
	case errors.Is(err, repository.ErrJudgeExists):
		c.JSON(http.StatusConflict, gin.H{"detail": err.Error()})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
	}
}

func (h *JudgesHandler) List(c *gin.Context) {
	if !requireOwner(c) {
		return
	}
	items, err := h.Judges.List()
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Không đọc được danh sách giám khảo."})
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (h *JudgesHandler) Create(c *gin.Context) {
	if !requireOwner(c) {
		return
	}
	var req struct {
		Username    string `json:"username"`
		DisplayName string `json:"display_name"`
		Password    string `json:"password"`
		Email       string `json:"email"`
	}
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Dữ liệu giám khảo không hợp lệ."})
		return
	}
	judge, err := h.Judges.CreateWithEmail(req.Username, req.DisplayName, req.Password, req.Email, requestSession(c).Actor())
	if err != nil {
		judgeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "judge": judge})
}

// SetEmail: PUT /api/admin/judges/:username/email — chủ đặt email nhận mã xác thực cho giám khảo.
func (h *JudgesHandler) SetEmail(c *gin.Context) {
	if !requireOwner(c) {
		return
	}
	var req struct {
		Email string `json:"email"`
	}
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Thiếu email."})
		return
	}
	judge, err := h.Judges.SetEmail(c.Param("username"), req.Email)
	if err != nil {
		judgeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "judge": judge})
}

func (h *JudgesHandler) Action(c *gin.Context) {
	if !requireOwner(c) {
		return
	}
	username := c.Param("username")
	var (
		judge repository.JudgeView
		err   error
	)
	switch c.Param("action") {
	case "disable":
		judge, err = h.Judges.SetDisabled(username, true)
	case "enable":
		judge, err = h.Judges.SetDisabled(username, false)
	case "reset-password":
		var req struct {
			Password string `json:"password"`
		}
		if c.ShouldBindJSON(&req) != nil {
			c.JSON(http.StatusBadRequest, gin.H{"detail": "Thiếu mật khẩu mới."})
			return
		}
		judge, err = h.Judges.ResetPassword(username, req.Password)
	default:
		c.JSON(http.StatusNotFound, gin.H{"detail": "Không có thao tác này."})
		return
	}
	if err != nil {
		judgeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "judge": judge})
}

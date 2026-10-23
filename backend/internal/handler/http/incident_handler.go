package http

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"project-tuan3/internal/service"
)

func (h *TournamentHandler) CorrectMatch(c *gin.Context) {
	if requestSession(c).Role != "ADMIN" {
		c.JSON(403, gin.H{"detail": "Chỉ ban tổ chức được sửa kết quả."})
		return
	}
	var req service.MatchCorrection
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(400, gin.H{"detail": "Thông tin sửa kết quả không hợp lệ."})
		return
	}
	result, err := h.service.CorrectMatch(c.Param("id"), c.Param("matchId"), req)
	if err != nil {
		c.JSON(409, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(200, result)
}

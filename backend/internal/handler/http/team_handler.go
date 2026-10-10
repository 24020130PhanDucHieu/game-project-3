package http

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/service"
)

type TeamHandler struct {
	service *service.TournamentService
}

func NewTeamHandler(service *service.TournamentService) *TeamHandler {
	return &TeamHandler{service: service}
}

func (h *TeamHandler) AddTeam(c *gin.Context) {
	id := c.Param("id")
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}

	res, err := h.service.MutateTournament(id, "add-team", req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

func (h *TeamHandler) QuickFill(c *gin.Context) {
	id := c.Param("id")
	res, err := h.service.MutateTournament(id, "quick-fill", map[string]interface{}{})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

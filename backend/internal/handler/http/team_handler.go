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

func (h *TeamHandler) RotateCredential(c *gin.Context) {
	id := c.Param("id")
	studentID := c.Param("studentId")
	res, err := h.service.MutateTournament(id, "rotate-team-credential", map[string]interface{}{
		"student_id": studentID,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	// The service already persisted the worker's tournament snapshot. Never
	// include that snapshot in this response because it contains credential hashes.
	delete(res, "tournament")
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

func (h *TeamHandler) RemoveTeam(c *gin.Context) {
	id := c.Param("id")
	studentID := c.Param("studentId")
	res, err := h.service.MutateTournament(id, "remove-team", map[string]interface{}{
		"student_id": studentID,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

func (h *TeamHandler) GetTeams(c *gin.Context) {
	id := c.Param("id")
	t, err := h.service.GetTournamentByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": err.Error()})
		return
	}
	teams, ok := t["teams"]
	if !ok || teams == nil {
		c.JSON(http.StatusOK, []interface{}{})
		return
	}
	if items, ok := teams.([]interface{}); ok {
		for _, raw := range items {
			if team, ok := raw.(map[string]interface{}); ok {
				delete(team, "credential_hash")
				delete(team, "code_content")
			}
		}
	}
	c.JSON(http.StatusOK, teams)
}

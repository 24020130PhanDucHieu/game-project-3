package http

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/service"
)

type TournamentHandler struct {
	service *service.TournamentService
}

func NewTournamentHandler(service *service.TournamentService) *TournamentHandler {
	return &TournamentHandler{service: service}
}

func (h *TournamentHandler) GetAll(c *gin.Context) {
	tournaments := h.service.GetAllTournaments()
	c.JSON(http.StatusOK, tournaments)
}

func (h *TournamentHandler) GetList(c *gin.Context) {
	list := h.service.GetTournamentList()
	c.JSON(http.StatusOK, list)
}

func (h *TournamentHandler) GetByID(c *gin.Context) {
	id := c.Param("id")
	t, err := h.service.GetTournamentByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, t)
}

func (h *TournamentHandler) Create(c *gin.Context) {
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Dữ liệu không hợp lệ"})
		return
	}

	name, _ := req["name"].(string)
	if name == "" {
		name = "Giải Đấu Oẳn Tù Tì V2"
	}

	numTeams := 8
	if nt, ok := req["num_teams"].(float64); ok && nt > 0 {
		numTeams = int(nt)
	}

	res, err := h.service.CreateTournament(name, numTeams)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
		return
	}

	c.JSON(http.StatusOK, res)
}

func (h *TournamentHandler) AutoSchedule(c *gin.Context) {
	id := c.Param("id")
	res, err := h.service.MutateTournament(id, "auto-schedule", map[string]interface{}{})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

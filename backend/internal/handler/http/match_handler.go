package http

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/service"
)

type MatchHandler struct {
	service *service.TournamentService
}

func NewMatchHandler(service *service.TournamentService) *MatchHandler {
	return &MatchHandler{service: service}
}

func (h *MatchHandler) Login(c *gin.Context) {
	id := c.Param("id")
	matchID := c.Param("matchId")
	var req map[string]interface{}
	_ = c.ShouldBindJSON(&req)
	if req == nil {
		req = make(map[string]interface{})
	}
	req["match_id"] = matchID

	res, err := h.service.MutateTournament(id, "login", req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

func (h *MatchHandler) SubmitDraftCode(c *gin.Context) {
	id := c.Param("id")
	matchID := c.Param("matchId")
	var req map[string]interface{}
	_ = c.ShouldBindJSON(&req)
	if req == nil {
		req = make(map[string]interface{})
	}
	req["match_id"] = matchID

	res, err := h.service.MutateTournament(id, "submit-draft", req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

func (h *MatchHandler) SubmitCode(c *gin.Context) {
	id := c.Param("id")
	matchID := c.Param("matchId")
	var req map[string]interface{}
	_ = c.ShouldBindJSON(&req)
	if req == nil {
		req = make(map[string]interface{})
	}
	req["match_id"] = matchID

	res, err := h.service.MutateTournament(id, "submit-code", req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

func (h *MatchHandler) PlayRound(c *gin.Context) {
	id := c.Param("id")
	matchID := c.Param("matchId")

	res, err := h.service.MutateTournament(id, "play-round", map[string]interface{}{"match_id": matchID})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

func (h *MatchHandler) NextRound(c *gin.Context) {
	id := c.Param("id")
	matchID := c.Param("matchId")

	res, err := h.service.MutateTournament(id, "next-round", map[string]interface{}{"match_id": matchID})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

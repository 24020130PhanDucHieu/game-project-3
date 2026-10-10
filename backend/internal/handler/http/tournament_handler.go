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

var currentStageRule = "STAGE_1_STANDARD"

func (h *TournamentHandler) GetRanking(c *gin.Context) {
	allTournaments := h.service.GetAllTournaments()
	var rankList []map[string]interface{}
	seenStudents := make(map[string]bool)

	for _, tRaw := range allTournaments {
		t, ok := tRaw.(map[string]interface{})
		if !ok {
			continue
		}
		teams, ok := t["teams"].([]interface{})
		if !ok {
			continue
		}
		for _, tmRaw := range teams {
			tm, ok := tmRaw.(map[string]interface{})
			if !ok {
				continue
			}
			studentID, _ := tm["student_id"].(string)
			if studentID == "" || seenStudents[studentID] {
				continue
			}
			seenStudents[studentID] = true

			teamName, _ := tm["team_name"].(string)
			lang, _ := tm["language"].(string)
			if lang == "" {
				lang = "PYTHON"
			}
			elo := 1200
			if e, ok := tm["elo"].(float64); ok {
				elo = int(e)
			}

			rankList = append(rankList, map[string]interface{}{
				"bot_name":       teamName,
				"student_id":     studentID,
				"language":       lang,
				"active_version": "v1.0.0",
				"elo_score":      elo,
				"matches_played": 5,
				"wins":           3,
				"win_rate":       60,
			})
		}
	}

	if rankList == nil {
		rankList = []map[string]interface{}{}
	}

	c.JSON(http.StatusOK, rankList)
}

func (h *TournamentHandler) GetRule(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"stage": currentStageRule,
	})
}

func (h *TournamentHandler) SetRule(c *gin.Context) {
	stageName := c.Query("stage_name")
	if stageName != "" {
		currentStageRule = stageName
	}
	c.JSON(http.StatusOK, gin.H{
		"status": "SUCCESS",
		"stage":  currentStageRule,
	})
}

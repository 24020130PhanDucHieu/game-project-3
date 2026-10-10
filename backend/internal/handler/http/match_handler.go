package http

import (
	"net/http"
	"strconv"

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

func (h *MatchHandler) Auth(c *gin.Context) {
	id := c.Param("id")
	matchID := c.Param("matchId")
	var req map[string]interface{}
	_ = c.ShouldBindJSON(&req)
	if req == nil {
		req = make(map[string]interface{})
	}
	req["match_id"] = matchID

	res, err := h.service.MutateTournament(id, "auth", req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

func (h *MatchHandler) DemoFill(c *gin.Context) {
	id := c.Param("id")
	matchID := c.Param("matchId")

	res, err := h.service.MutateTournament(id, "demo-fill", map[string]interface{}{"match_id": matchID})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

func (h *MatchHandler) Reset(c *gin.Context) {
	id := c.Param("id")
	matchID := c.Param("matchId")

	res, err := h.service.MutateTournament(id, "reset", map[string]interface{}{"match_id": matchID})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

func (h *MatchHandler) GetSubmissions(c *gin.Context) {
	id := c.Param("id")
	matchID := c.Param("matchId")
	t, err := h.service.GetTournamentByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": err.Error()})
		return
	}
	if matches, ok := t["matches"].(map[string]interface{}); ok {
		if m, ok := matches[matchID].(map[string]interface{}); ok {
			subs := m["submissions_history"]
			if subs == nil {
				subs = []interface{}{}
			}
			c.JSON(http.StatusOK, subs)
			return
		}
	}
	c.JSON(http.StatusOK, []interface{}{})
}

func (h *MatchHandler) GetRoundReplay(c *gin.Context) {
	id := c.Param("id")
	matchID := c.Param("matchId")
	roundStr := c.Param("roundNumber")
	roundNum, err := strconv.Atoi(roundStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Mã hiệp không hợp lệ"})
		return
	}

	t, err := h.service.GetTournamentByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": err.Error()})
		return
	}

	if matches, ok := t["matches"].(map[string]interface{}); ok {
		if m, ok := matches[matchID].(map[string]interface{}); ok {
			if rounds, ok := m["rounds_history"].([]interface{}); ok {
				for _, rRaw := range rounds {
					if r, ok := rRaw.(map[string]interface{}); ok {
						if rn, ok := r["round_number"].(float64); ok && int(rn) == roundNum {
							c.JSON(http.StatusOK, r)
							return
						}
					}
				}
				if roundNum >= 1 && roundNum <= len(rounds) {
					c.JSON(http.StatusOK, rounds[roundNum-1])
					return
				}
			}
		}
	}

	c.JSON(http.StatusNotFound, gin.H{"detail": "Không tìm thấy dữ liệu xem lại hiệp đấu"})
}

func (h *MatchHandler) PracticeMatch(c *gin.Context) {
	id := c.Param("id")
	var req map[string]interface{}
	_ = c.ShouldBindJSON(&req)
	if req == nil {
		req = make(map[string]interface{})
	}
	res, err := h.service.MutateTournament(id, "practice-match", req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

func (h *MatchHandler) GetMatchHistory(c *gin.Context) {
	allTournaments := h.service.GetAllTournaments()
	var historyList []map[string]interface{}

	for tID, tRaw := range allTournaments {
		t, ok := tRaw.(map[string]interface{})
		if !ok {
			continue
		}
		matches, ok := t["matches"].(map[string]interface{})
		if !ok {
			continue
		}
		for mID, mRaw := range matches {
			m, ok := mRaw.(map[string]interface{})
			if !ok {
				continue
			}
			roundsHist, ok := m["rounds_history"].([]interface{})
			if !ok || len(roundsHist) == 0 {
				continue
			}

			var botNames []string
			if teamA, ok := m["team_a"].(map[string]interface{}); ok {
				if name, ok := teamA["team_name"].(string); ok {
					botNames = append(botNames, name)
				}
			}
			if teamB, ok := m["team_b"].(map[string]interface{}); ok {
				if name, ok := teamB["team_name"].(string); ok {
					botNames = append(botNames, name)
				}
			}
			if len(botNames) < 2 {
				botNames = []string{"Đội Đỏ", "Đội Xanh"}
			}

			timestamp := float64(0)
			if lastRound, ok := roundsHist[len(roundsHist)-1].(map[string]interface{}); ok {
				if ts, ok := lastRound["timestamp"].(float64); ok {
					timestamp = ts
				}
			}

			winnerName := "Hòa"
			if wn, ok := m["winner_name"].(string); ok && wn != "" {
				winnerName = wn
			}

			historyList = append(historyList, map[string]interface{}{
				"match_id":     tID + "_" + mID,
				"timestamp":    timestamp,
				"stage":        m["round_name"],
				"bot_names":    botNames,
				"total_rounds": len(roundsHist),
				"winner_name":  winnerName,
			})
		}
	}

	if historyList == nil {
		historyList = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, historyList)
}

package http

import (
	"encoding/json"
	"math"
	"net/http"
	"sort"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/auth"
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
	public := make(map[string]interface{}, len(tournaments))
	for id, raw := range tournaments {
		if tournament, ok := raw.(map[string]interface{}); ok {
			public[id] = redactTournament(tournament, auth.Session{})
		} else {
			public[id] = raw
		}
	}
	c.JSON(http.StatusOK, public)
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
	session := requestSession(c)
	if session.Role != "ADMIN" && session.TournamentID != id {
		session = auth.Session{}
	}
	c.JSON(http.StatusOK, redactTournament(t, session))
}

func requestSession(c *gin.Context) auth.Session {
	value, ok := c.Get("session")
	if !ok {
		return auth.Session{}
	}
	session, _ := value.(auth.Session)
	return session
}

// Public match data must never expose credentials or executable source. A team
// session can see only its own current and draft code; officials can see both.
func redactTournament(value map[string]interface{}, session auth.Session) map[string]interface{} {
	copyTournament := cloneJSONMap(value)
	if teams, ok := copyTournament["teams"].([]interface{}); ok {
		for _, raw := range teams {
			if team, ok := raw.(map[string]interface{}); ok {
				delete(team, "credential_hash")
				delete(team, "code_content")
			}
		}
	}
	matches, ok := copyTournament["matches"].(map[string]interface{})
	if !ok {
		return copyTournament
	}
	for matchID, raw := range matches {
		match, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		for _, side := range []string{"team_a", "team_b"} {
			team, ok := match[side].(map[string]interface{})
			if !ok {
				continue
			}
			delete(team, "credential_hash")
			isTeamSession := session.Role == "TEAM" || session.Role == "TEAM_A" || session.Role == "TEAM_B"
			if session.Role != "ADMIN" && (!isTeamSession || session.MatchID != matchID || session.Side != side) {
				delete(team, "current_code")
				delete(team, "draft_code")
			}
		}
		if rounds, ok := match["rounds_history"].([]interface{}); ok && session.Role != "ADMIN" {
			for _, roundRaw := range rounds {
				if round, ok := roundRaw.(map[string]interface{}); ok {
					delete(round, "team_a_code")
					delete(round, "team_b_code")
				}
			}
		}
		if submissions, ok := match["submissions_history"].([]interface{}); ok && session.Role != "ADMIN" {
			visible := make([]interface{}, 0, len(submissions))
			if session.Role == "TEAM" || session.Role == "TEAM_A" || session.Role == "TEAM_B" {
				for _, rawSubmission := range submissions {
					if submission, ok := rawSubmission.(map[string]interface{}); ok && submission["side"] == session.Side {
						visible = append(visible, submission)
					}
				}
			}
			match["submissions_history"] = visible
		}
	}
	return copyTournament
}

func cloneJSONMap(value map[string]interface{}) map[string]interface{} {
	encoded, err := json.Marshal(value)
	if err != nil {
		return value
	}
	var cloned map[string]interface{}
	if json.Unmarshal(encoded, &cloned) != nil {
		return value
	}
	return cloned
}

func redactMatch(value map[string]interface{}, matchID string, session auth.Session) map[string]interface{} {
	wrapped := map[string]interface{}{"matches": map[string]interface{}{matchID: value}}
	cleaned := redactTournament(wrapped, session)
	return cleaned["matches"].(map[string]interface{})[matchID].(map[string]interface{})
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
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}

	c.JSON(http.StatusOK, res)
}

func (h *TournamentHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	if err := h.service.DeleteTournament(id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "tournament_id": id})
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

func (h *TournamentHandler) GetRanking(c *gin.Context) {
	allTournaments := h.service.GetAllTournaments()
	// Track stats per student across all tournaments
	type teamStats struct {
		BotName       string
		StudentID     string
		Language      string
		ELO           int
		MatchesPlayed int
		Wins          int
	}
	statsMap := make(map[string]*teamStats)

	for _, tRaw := range allTournaments {
		t, ok := tRaw.(map[string]interface{})
		if !ok {
			continue
		}
		// Seed base ELO from team registration
		teams, _ := t["teams"].([]interface{})
		for _, tmRaw := range teams {
			tm, ok := tmRaw.(map[string]interface{})
			if !ok {
				continue
			}
			studentID, _ := tm["student_id"].(string)
			if studentID == "" {
				continue
			}
			if _, exists := statsMap[studentID]; !exists {
				teamName, _ := tm["team_name"].(string)
				lang, _ := tm["language"].(string)
				if lang == "" {
					lang = "PYTHON"
				}
				elo := 1200
				if e, ok := tm["elo"].(float64); ok {
					elo = int(e)
				}
				statsMap[studentID] = &teamStats{
					BotName:   teamName,
					StudentID: studentID,
					Language:  lang,
					ELO:       elo,
				}
			}
		}

		// Compute actual match results from completed matches
		matches, ok := t["matches"].(map[string]interface{})
		if !ok {
			continue
		}
		for _, mRaw := range matches {
			m, ok := mRaw.(map[string]interface{})
			if !ok {
				continue
			}
			roundsHist, ok := m["rounds_history"].([]interface{})
			if !ok || len(roundsHist) == 0 {
				continue
			}
			// This match has been played - count participation and wins
			winnerName, _ := m["winner_name"].(string)
			for _, side := range []string{"team_a", "team_b"} {
				if team, ok := m[side].(map[string]interface{}); ok {
					sid, _ := team["student_id"].(string)
					tname, _ := team["team_name"].(string)
					if sid == "" {
						continue
					}
					st, exists := statsMap[sid]
					if !exists {
						st = &teamStats{
							BotName:   tname,
							StudentID: sid,
							Language:  "PYTHON",
							ELO:       1200,
						}
						statsMap[sid] = st
					}
					st.MatchesPlayed++
					if winnerName != "" && winnerName == tname {
						st.Wins++
					}
				}
			}
		}
	}

	var rankList []map[string]interface{}
	for _, st := range statsMap {
		winRate := 0.0
		if st.MatchesPlayed > 0 {
			winRate = math.Round((float64(st.Wins)/float64(st.MatchesPlayed)*100.0)*10) / 10
		}
		losses := st.MatchesPlayed - st.Wins
		if losses < 0 {
			losses = 0
		}
		currentElo := st.ELO + (st.Wins * 30) - (losses * 15)
		if currentElo < 800 {
			currentElo = 800
		}
		rankList = append(rankList, map[string]interface{}{
			"bot_name":       st.BotName,
			"student_id":     st.StudentID,
			"language":       st.Language,
			"active_version": "v1.0.0",
			"elo_score":      currentElo,
			"matches_played": st.MatchesPlayed,
			"wins":           st.Wins,
			"win_rate":       winRate,
		})
	}

	sort.Slice(rankList, func(i, j int) bool {
		eloI, _ := rankList[i]["elo_score"].(int)
		eloJ, _ := rankList[j]["elo_score"].(int)
		if eloI != eloJ {
			return eloI > eloJ
		}
		winsI, _ := rankList[i]["wins"].(int)
		winsJ, _ := rankList[j]["wins"].(int)
		if winsI != winsJ {
			return winsI > winsJ
		}
		wrI, _ := rankList[i]["win_rate"].(float64)
		wrJ, _ := rankList[j]["win_rate"].(float64)
		if wrI != wrJ {
			return wrI > wrJ
		}
		botI, _ := rankList[i]["bot_name"].(string)
		botJ, _ := rankList[j]["bot_name"].(string)
		return botI < botJ
	})

	if rankList == nil {
		rankList = []map[string]interface{}{}
	}

	c.JSON(http.StatusOK, rankList)
}

func (h *TournamentHandler) GetRule(c *gin.Context) {
	tournamentID := c.Query("tournament_id")
	t, err := h.service.GetTournamentByID(tournamentID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": err.Error()})
		return
	}
	stage, _ := t["stage_rule"].(string)
	if stage == "" {
		stage = "STAGE_1_STANDARD"
	}
	c.JSON(http.StatusOK, gin.H{
		"stage": stage,
	})
}

func (h *TournamentHandler) SetRule(c *gin.Context) {
	tournamentID := c.Query("tournament_id")
	stageName := c.Query("stage_name")
	if tournamentID == "" || stageName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "tournament_id and stage_name are required"})
		return
	}
	res, err := h.service.MutateTournament(tournamentID, "set-rule", map[string]interface{}{"stage_name": stageName})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status": "SUCCESS",
		"stage":  res["tournament"].(map[string]interface{})["stage_rule"],
	})
}

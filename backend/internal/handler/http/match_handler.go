package http

import (
	"crypto/subtle"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/auth"
	"project-tuan3/internal/service"
)

type MatchHandler struct {
	service  *service.TournamentService
	sessions *auth.Manager
}

func NewMatchHandler(service *service.TournamentService, sessions *auth.Manager) *MatchHandler {
	return &MatchHandler{service: service, sessions: sessions}
}

func (h *MatchHandler) AdminLogin(c *gin.Context) {
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Invalid login request"})
		return
	}
	username, _ := req["username"].(string)
	password, _ := req["password"].(string)
	if username != "" && !isAdminUsername(username) {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Invalid organizer credentials"})
		return
	}
	configured := os.Getenv("ADMIN_PASSWORD")
	if configured == "" || subtle.ConstantTimeCompare([]byte(password), []byte(configured)) != 1 {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Invalid organizer credentials"})
		return
	}
	token, err := h.sessions.Create(auth.Session{Role: "ADMIN"})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "Could not create session"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "role": "ADMIN", "session_token": token})
}

func isAdminUsername(username string) bool {
	switch strings.ToLower(strings.TrimSpace(username)) {
	case "admin", "bquantri", "btc", "trongtai", "referee":
		return true
	default:
		return false
	}
}

func (h *MatchHandler) issueSession(tournamentID, matchID, role, side, studentID string, result map[string]interface{}) {
	token, err := h.sessions.Create(auth.Session{TournamentID: tournamentID, MatchID: matchID, Role: role, Side: side, StudentID: studentID})
	if err == nil {
		result["session_token"] = token
	}
}

func (h *MatchHandler) Login(c *gin.Context) {
	id := c.Param("id")
	matchID := c.Param("matchId")
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Invalid login request"})
		return
	}
	if req == nil {
		req = make(map[string]interface{})
	}
	username, _ := req["username"].(string)
	if username == "" {
		username, _ = req["student_id"].(string)
	}
	if isAdminUsername(username) {
		password, _ := req["password"].(string)
		configured := os.Getenv("ADMIN_PASSWORD")
		if configured == "" || subtle.ConstantTimeCompare([]byte(password), []byte(configured)) != 1 {
			c.JSON(http.StatusUnauthorized, gin.H{"detail": "Invalid organizer credentials"})
			return
		}
		result := map[string]interface{}{"status": "SUCCESS", "role": "ADMIN", "message": "Organizer login successful"}
		h.issueSession(id, matchID, "ADMIN", "", "", result)
		if result["session_token"] == nil {
			c.JSON(http.StatusInternalServerError, gin.H{"detail": "Could not create session"})
			return
		}
		c.JSON(http.StatusOK, result)
		return
	}
	req["match_id"] = matchID

	res, err := h.service.MutateTournament(id, "login", req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	role, _ := res["role"].(string)
	side, _ := res["side"].(string)
	studentID, _ := req["student_id"].(string)
	if team, ok := res["team"].(map[string]interface{}); ok {
		delete(team, "credential_hash")
		studentID, _ = team["student_id"].(string)
	}
	h.issueSession(id, matchID, role, side, studentID, res)
	if res["session_token"] == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "Could not create session"})
		return
	}
	if tournament, ok := res["tournament"].(map[string]interface{}); ok && role != "ADMIN" {
		res["tournament"] = redactTournament(tournament, auth.Session{Role: "TEAM", Side: side, TournamentID: id, MatchID: matchID})
	}
	c.JSON(http.StatusOK, res)
}

func (h *MatchHandler) TeamLogin(c *gin.Context) {
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil || req == nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Invalid login request"})
		return
	}
	username, _ := req["username"].(string)
	password, _ := req["password"].(string)
	if strings.TrimSpace(username) == "" || password == "" || isAdminUsername(username) {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Enter a team student ID and access code"})
		return
	}
	preferredTournament, _ := req["tournament_id"].(string)
	type loginCandidate struct {
		tournamentID string
		matchID      string
		priority     int
	}
	var candidates []loginCandidate
	for tournamentID, rawTournament := range h.service.GetAllTournaments() {
		tournament, ok := rawTournament.(map[string]interface{})
		if !ok {
			continue
		}
		tournamentPriority := 2
		if status, _ := tournament["status"].(string); status == "RUNNING" {
			tournamentPriority = 0
			if tournamentID == preferredTournament {
				tournamentPriority = -1
			}
		} else if tournamentID == preferredTournament {
			tournamentPriority = 1
		}
		matches, _ := tournament["matches"].(map[string]interface{})
		for matchID, rawMatch := range matches {
			match, ok := rawMatch.(map[string]interface{})
			if !ok {
				continue
			}
			participates := false
			for _, side := range []string{"team_a", "team_b"} {
				team, _ := match[side].(map[string]interface{})
				studentID, _ := team["student_id"].(string)
				if strings.EqualFold(strings.TrimSpace(studentID), strings.TrimSpace(username)) {
					participates = true
					break
				}
			}
			if !participates {
				continue
			}
			priority := tournamentPriority
			if status, _ := match["status"].(string); status == "COMPLETED" {
				priority += 3
			}
			candidates = append(candidates, loginCandidate{tournamentID, matchID, priority})
		}
	}
	sort.SliceStable(candidates, func(i, j int) bool { return candidates[i].priority < candidates[j].priority })
	for _, candidate := range candidates {
		params := map[string]interface{}{
			"match_id": candidate.matchID,
			"username": username,
			"password": password,
		}
		result, err := h.service.MutateTournament(candidate.tournamentID, "login", params)
		if err != nil {
			continue
		}
		role, _ := result["role"].(string)
		side, _ := result["side"].(string)
		team, _ := result["team"].(map[string]interface{})
		studentID := username
		if team != nil {
			studentID, _ = team["student_id"].(string)
			delete(team, "credential_hash")
		}
		h.issueSession(candidate.tournamentID, candidate.matchID, role, side, studentID, result)
		if result["session_token"] == nil {
			c.JSON(http.StatusInternalServerError, gin.H{"detail": "Could not create session"})
			return
		}
		delete(result, "tournament")
		result["tournament_id"] = candidate.tournamentID
		result["match_id"] = candidate.matchID
		c.JSON(http.StatusOK, result)
		return
	}
	c.JSON(http.StatusUnauthorized, gin.H{"detail": "Không tìm thấy đội trong lịch thi đấu với MSSV và mật khẩu này. Hãy kiểm tra MSSV, mã k69+MSSV và việc đội đã được thêm vào giải."})
}

func (h *MatchHandler) SelectTeamMatch(c *gin.Context) {
	session, ok := sessionFromContext(c)
	if !ok || session.Role == "ADMIN" {
		c.JSON(http.StatusForbidden, gin.H{"detail": "A team session is required"})
		return
	}
	tournamentID := c.Param("id")
	matchID := c.Param("matchId")
	tournament, err := h.service.GetTournamentByID(tournamentID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": err.Error()})
		return
	}
	matches, _ := tournament["matches"].(map[string]interface{})
	match, _ := matches[matchID].(map[string]interface{})
	if match == nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Match not found"})
		return
	}
	for _, side := range []string{"team_a", "team_b"} {
		team, _ := match[side].(map[string]interface{})
		studentID, _ := team["student_id"].(string)
		if team != nil && strings.EqualFold(strings.TrimSpace(studentID), strings.TrimSpace(session.StudentID)) {
			result := map[string]interface{}{"status": "SUCCESS", "match_id": matchID, "side": side}
			h.issueSession(tournamentID, matchID, session.Role, side, session.StudentID, result)
			if result["session_token"] == nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": "Could not create match session"})
				return
			}
			c.JSON(http.StatusOK, result)
			return
		}
	}
	c.JSON(http.StatusForbidden, gin.H{"detail": "This match does not include your team"})
}

func (h *MatchHandler) SubmitDraftCode(c *gin.Context) {
	id := c.Param("id")
	matchID := c.Param("matchId")
	var req map[string]interface{}
	_ = c.ShouldBindJSON(&req)
	if req == nil {
		req = make(map[string]interface{})
	}
	if session, ok := sessionFromContext(c); ok && session.Role != "ADMIN" {
		req["side"] = session.Side
	}
	req["match_id"] = matchID

	res, err := h.service.MutateTournament(id, "submit-draft", req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	if session, ok := sessionFromContext(c); ok && session.Role != "ADMIN" {
		if match, ok := res["match"].(map[string]interface{}); ok {
			res["match"] = redactMatch(match, matchID, session)
		}
		if team, ok := res["team"].(map[string]interface{}); ok {
			delete(team, "credential_hash")
		}
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
	if session, ok := sessionFromContext(c); ok && session.Role != "ADMIN" {
		req["side"] = session.Side
	}
	req["match_id"] = matchID

	res, err := h.service.MutateTournament(id, "submit-code", req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	if session, ok := sessionFromContext(c); ok && session.Role != "ADMIN" {
		if match, ok := res["match"].(map[string]interface{}); ok {
			res["match"] = redactMatch(match, matchID, session)
		}
		if team, ok := res["team"].(map[string]interface{}); ok {
			delete(team, "credential_hash")
		}
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
	side, _ := req["side"].(string)
	studentID, _ := req["student_id"].(string)
	h.issueSession(id, matchID, "TEAM", side, studentID, res)
	if res["session_token"] == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "Could not create session"})
		return
	}
	if tournament, ok := res["tournament"].(map[string]interface{}); ok {
		res["tournament"] = redactTournament(tournament, auth.Session{Role: "TEAM", Side: side, TournamentID: id, MatchID: matchID})
	}
	if result, ok := res["result"].(map[string]interface{}); ok {
		if team, ok := result["team"].(map[string]interface{}); ok {
			delete(team, "credential_hash")
		}
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
			if session, ok := sessionFromContext(c); ok && session.Role != "ADMIN" {
				filtered := make([]interface{}, 0)
				if items, ok := subs.([]interface{}); ok {
					for _, item := range items {
						if sub, ok := item.(map[string]interface{}); ok && sub["side"] == session.Side {
							filtered = append(filtered, sub)
						}
					}
				}
				subs = filtered
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
							c.JSON(http.StatusOK, hideOpponentCode(r, c))
							return
						}
					}
				}
				if roundNum >= 1 && roundNum <= len(rounds) {
					c.JSON(http.StatusOK, hideOpponentCode(rounds[roundNum-1], c))
					return
				}
			}
		}
	}

	c.JSON(http.StatusNotFound, gin.H{"detail": "Không tìm thấy dữ liệu xem lại hiệp đấu"})
}

func hideOpponentCode(value interface{}, c *gin.Context) interface{} {
	session, ok := sessionFromContext(c)
	if ok && session.Role == "ADMIN" {
		return value
	}
	record, ok := value.(map[string]interface{})
	if !ok {
		return value
	}
	copyRecord := make(map[string]interface{}, len(record))
	for key, val := range record {
		if key != "team_a_code" && key != "team_b_code" {
			copyRecord[key] = val
		}
	}
	return copyRecord
}

func sessionFromContext(c *gin.Context) (auth.Session, bool) {
	value, ok := c.Get("session")
	if !ok {
		return auth.Session{}, false
	}
	session, ok := value.(auth.Session)
	return session, ok
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

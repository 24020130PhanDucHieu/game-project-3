package http

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/auth"
	"project-tuan3/internal/repository"
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
	list, err := h.service.GetTournamentListChecked()
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"code": "DATABASE_UNAVAILABLE", "detail": "Không thể tải danh sách giải. Vui lòng thử lại."})
		return
	}
	c.JSON(http.StatusOK, list)
}

func (h *TournamentHandler) GetByID(c *gin.Context) {
	id := c.Param("id")
	t, err := h.service.GetTournamentByID(id)
	if err != nil {
		status := http.StatusServiceUnavailable
		if errors.Is(err, repository.ErrTournamentNotFound) {
			status = http.StatusNotFound
			c.JSON(status, gin.H{"code": "TOURNAMENT_NOT_FOUND", "tournament_id": id, "detail": err.Error()})
			return
		}
		c.JSON(status, gin.H{"detail": err.Error()})
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
	delete(copyTournament, "_submission_receipts")
	delete(copyTournament, "_incident_checkpoint")
	if session.Role == "ADMIN" {
		copyTournament["correction_token"] = service.CorrectionToken(value)
	} else {
		delete(copyTournament, "incident_log")
	}
	if session.Role != "ADMIN" {
		rules, _ := copyTournament["stage_rules"].(map[string]interface{})
		for key, raw := range rules {
			rule, _ := raw.(map[string]interface{})
			publishAt, _ := rule["publish_at"].(float64)
			if publishAt > float64(time.Now().UnixMilli())/1000 {
				rules[key] = map[string]interface{}{"publish_at": publishAt, "hidden": true}
			}
		}
	}
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
		if session.Role != "ADMIN" {
			delete(match, "tie_break_seed")
		}
		ownsMatch := false
		for _, side := range []string{"team_a", "team_b"} {
			team, ok := match[side].(map[string]interface{})
			if !ok {
				continue
			}
			delete(team, "credential_hash")
			isTeamSession := session.Role == "TEAM" || session.Role == "TEAM_A" || session.Role == "TEAM_B"
			studentID, _ := team["student_id"].(string)
			ownsSide := isTeamSession && session.MatchID == matchID && session.Side == side && session.StudentID != "" && strings.EqualFold(strings.TrimSpace(studentID), strings.TrimSpace(session.StudentID))
			ownsMatch = ownsMatch || ownsSide
			if session.Role != "ADMIN" && !ownsSide {
				delete(team, "current_code")
				delete(team, "draft_code")
			}
		}
		if rounds, ok := match["rounds_history"].([]interface{}); ok && session.Role != "ADMIN" {
			for _, roundRaw := range rounds {
				if round, ok := roundRaw.(map[string]interface{}); ok {
					if !ownsMatch || session.Side != "team_a" {
						delete(round, "team_a_code")
					}
					if !ownsMatch || session.Side != "team_b" {
						delete(round, "team_b_code")
					}
					visibleSide := ""
					if ownsMatch {
						visibleSide = session.Side
					}
					redactFogRound(round, visibleSide)
				}
			}
		}
		if submissions, ok := match["submissions_history"].([]interface{}); ok && session.Role != "ADMIN" {
			visible := make([]interface{}, 0, len(submissions))
			if ownsMatch {
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

// Hide fog information in every public representation, including logs and replay.
// Guests see both sides masked; only officials receive the complete board.
func redactFogRound(round map[string]interface{}, ownSide string) {
	rules, _ := round["rules"].(map[string]interface{})
	id, _ := round["stage_rule"].(string)
	mask, _ := strconv.Atoi(strings.TrimPrefix(id, "COMBO_"))
	fog := rules["fog"] == true || id == "RULE_FOG" || id == "RULE_MUTATED_FOG" || id == "STAGE_3_REVERSE_FOG" || id == "STAGE_4_FINALS" || (strings.HasPrefix(id, "COMBO_") && mask&4 != 0)
	if !fog {
		return
	}
	delete(round, "tie_break_seed")
	for _, side := range []string{"team_a", "team_b"} {
		if side != ownSide {
			delete(round, side+"_move")
		}
	}
	var scrub func(interface{})
	scrub = func(value interface{}) {
		switch node := value.(type) {
		case []interface{}:
			for _, child := range node {
				scrub(child)
			}
		case map[string]interface{}:
			for key, child := range node {
				if (key == "red_pieces" && ownSide != "team_a") || (key == "blue_pieces" && ownSide != "team_b") {
					if pieces, ok := child.([]interface{}); ok {
						for _, item := range pieces {
							if piece, ok := item.(map[string]interface{}); ok {
								piece["type"] = "UNKNOWN"
							}
						}
					}
				}
				if key == "winner_type" || key == "loser_type" || key == "preferred_move" {
					delete(node, key)
					continue
				}
				if key == "log" {
					if text, ok := child.(string); ok {
						node[key] = strings.NewReplacer("ROCK", "?", "PAPER", "?", "SCISSORS", "?").Replace(text)
					}
				}
				scrub(child)
			}
		}
	}
	for _, key := range []string{"board_steps", "move_logs", "bot_logs"} {
		scrub(round[key])
	}
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

	name = strings.TrimSpace(name)
	if utf8.RuneCountInString(name) > 120 {
		c.JSON(400, gin.H{"detail": "Tên giải tối đa 120 ký tự."})
		return
	}
	numTeams := 8
	value, supplied := req["num_teams"]
	if !supplied {
		value, supplied = req["team_count"]
	}
	if !supplied {
		value, supplied = req["teams"]
	}
	if supplied {
		nt, ok := value.(float64)
		if !ok || nt != math.Trunc(nt) || nt < 4 || nt > 128 || int(nt)&(int(nt)-1) != 0 {
			c.JSON(400, gin.H{"detail": "Số đội phải là 4, 8, 16, 32, 64 hoặc 128."})
			return
		}
		numTeams = int(nt)
	}

	track := ""
	if t, _ := req["track"].(string); strings.EqualFold(strings.TrimSpace(t), "AI") {
		track = "AI"
	}
	res, err := h.service.CreateTournament(name, numTeams, track)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}

	c.JSON(http.StatusOK, res)
}

func (h *TournamentHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	if err := h.service.DeleteTournament(id); err != nil {
		status := http.StatusServiceUnavailable
		if errors.Is(err, repository.ErrTournamentNotFound) {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"detail": err.Error()})
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

func (h *TournamentHandler) SetStageSchedule(c *gin.Context) {
	var req struct {
		Windows []service.StageWindow `json:"windows"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16384)
	if c.ShouldBindJSON(&req) != nil || req.Windows == nil {
		c.JSON(400, gin.H{"detail": "Dữ liệu lịch không hợp lệ."})
		return
	}
	result, err := h.service.SetStageSchedule(c.Param("id"), req.Windows)
	if err != nil {
		c.JSON(400, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(200, result)
}

func (h *TournamentHandler) GetRanking(c *gin.Context) {
	track := trackParam(c)
	cacheKey := "ranking" + map[bool]string{false: "", true: ":ai"}[track == "AI"]
	if cached, ok := derivedGet(cacheKey); ok {
		c.JSON(http.StatusOK, cached)
		return
	}
	version := derivedVersion()
	allTournaments := filterTrack(h.service.GetAllTournaments(), track)
	// ELO giải chính: tính chuẩn từ các trận đã kết thúc, mọi đội bắt đầu từ 1200 (độc lập với ELO vòng loại).
	elo := ComputeMainElo(allTournaments)
	// Ngôn ngữ lấy theo lần ghi danh giải gần nhất của đội.
	langAt := map[string]float64{}
	lang := map[string]string{}
	for _, tRaw := range allTournaments {
		t, ok := tRaw.(map[string]interface{})
		if !ok {
			continue
		}
		at, _ := t["created_at"].(float64)
		teams, _ := t["teams"].([]interface{})
		for _, tmRaw := range teams {
			tm, ok := tmRaw.(map[string]interface{})
			if !ok {
				continue
			}
			sid := strings.ToUpper(strings.TrimSpace(fmt.Sprint(tm["student_id"])))
			if l, _ := tm["language"].(string); l != "" && at >= langAt[sid] {
				lang[sid], langAt[sid] = l, at
			}
		}
	}

	var rankList []map[string]interface{}
	for _, st := range elo {
		winRate := 0.0
		if st.Played > 0 {
			winRate = math.Round((float64(st.Wins)/float64(st.Played)*100.0)*10) / 10
		}
		language := lang[st.StudentID]
		if language == "" {
			language = "PYTHON"
		}
		rankList = append(rankList, map[string]interface{}{
			"bot_name":       st.TeamName,
			"student_id":     st.StudentID,
			"language":       language,
			"active_version": "v1.0.0",
			"elo_score":      int(math.Round(st.Rating)),
			"matches_played": st.Played,
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
		if botI != botJ {
			return botI < botJ
		}
		return rankList[i]["student_id"].(string) < rankList[j]["student_id"].(string)
	})

	if rankList == nil {
		rankList = []map[string]interface{}{}
	}

	derivedSet(cacheKey, version, rankList)
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
		"stage":       stage,
		"stage_rules": redactTournament(t, requestSession(c))["stage_rules"],
	})
}

func (h *TournamentHandler) SetStageRules(c *gin.Context) {
	var req struct {
		Rules      []service.StageRule `json:"rules"`
		Correction bool                `json:"correction"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16384)
	if c.ShouldBindJSON(&req) != nil || req.Rules == nil {
		c.JSON(400, gin.H{"detail": "Cấu hình luật không hợp lệ."})
		return
	}
	result, err := h.service.SetStageRulesWithCorrection(c.Param("id"), req.Rules, req.Correction)
	if err != nil {
		c.JSON(400, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(200, result)
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

func (h *TournamentHandler) SwapBracket(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Team1 string `json:"team_1"`
		Team2 string `json:"team_2"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Team1 == "" || req.Team2 == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Vui lòng chọn 2 đội cần hoán đổi cặp đấu."})
		return
	}
	res, err := h.service.MutateTournament(id, "swap-bracket", map[string]interface{}{
		"team_1": req.Team1,
		"team_2": req.Team2,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

func (h *TournamentHandler) DisqualifyTeam(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		StudentID string `json:"student_id"`
		Reason    string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.StudentID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Vui lòng cung cấp mã sinh viên đội cần loại."})
		return
	}
	if req.Reason == "" {
		req.Reason = "Vi phạm quy chế"
	}
	res, err := h.service.MutateTournament(id, "disqualify-team", map[string]interface{}{
		"student_id": req.StudentID,
		"reason":     req.Reason,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

// GetEloHistory: GET /api/ranking/elo-history?student_id= — ELO giải chính của một đội sau từng trận (công khai như kết quả trận).
func (h *TournamentHandler) GetEloHistory(c *gin.Context) {
	sid := strings.ToUpper(strings.TrimSpace(c.Query("student_id")))
	if sid == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Thiếu mã sinh viên."})
		return
	}
	team, ok := ComputeMainElo(filterTrack(h.service.GetAllTournaments(), trackParam(c)))[sid]
	if !ok {
		c.JSON(http.StatusOK, gin.H{"student_id": sid, "start": mainEloStart, "rating": mainEloStart, "played": 0, "wins": 0, "events": []EloEvent{}})
		return
	}
	events := team.History
	if events == nil {
		events = []EloEvent{}
	}
	c.JSON(http.StatusOK, gin.H{"student_id": sid, "team_name": team.TeamName, "start": mainEloStart, "rating": round1(team.Rating), "played": team.Played, "wins": team.Wins, "k_factor": mainEloK, "events": events})
}

package http

import (
	"crypto/sha256"
	"crypto/subtle"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/auth"
	"project-tuan3/internal/humancheck"
	"project-tuan3/internal/repository"
	"project-tuan3/internal/service"
)

type MatchHandler struct {
	Human       *humancheck.Guard
	adminMu     sync.Mutex
	adminFails  map[string]adminFailure
	Accounts    *repository.Accounts
	Judges      *repository.Judges
	AccountSync func() error
	service     *service.TournamentService
	sessions    *auth.Manager
}

func NewMatchHandler(service *service.TournamentService, sessions *auth.Manager) *MatchHandler {
	return &MatchHandler{service: service, sessions: sessions}
}

type adminFailure struct {
	count int
	until time.Time
}

const (
	adminMaxFailures = 5
	adminLockout     = 15 * time.Minute
)

// localRequest: request do chính máy gateway gửi (watchdog), không đi qua Caddy.
func localRequest(c *gin.Context) bool {
	ip := net.ParseIP(c.RemoteIP())
	return ip != nil && ip.IsLoopback() && c.GetHeader("X-Forwarded-For") == ""
}

// adminLocked cho biết IP đang bị khóa đăng nhập ban tổ chức và còn bao lâu.
func (h *MatchHandler) adminLocked(ip string) time.Duration {
	h.adminMu.Lock()
	defer h.adminMu.Unlock()
	if f, ok := h.adminFails[ip]; ok && time.Now().Before(f.until) {
		return time.Until(f.until)
	}
	return 0
}

func (h *MatchHandler) adminResult(ip string, ok bool) {
	h.adminMu.Lock()
	defer h.adminMu.Unlock()
	if h.adminFails == nil {
		h.adminFails = map[string]adminFailure{}
	}
	if ok {
		delete(h.adminFails, ip)
		return
	}
	f := h.adminFails[ip]
	if !f.until.IsZero() && time.Now().After(f.until) {
		f = adminFailure{}
	}
	f.count++
	if f.count >= adminMaxFailures {
		f.until = time.Now().Add(adminLockout)
	}
	h.adminFails[ip] = f
}

func (h *MatchHandler) AdminLogin(c *gin.Context) {
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Invalid login request"})
		return
	}
	username, _ := req["username"].(string)
	password, _ := req["password"].(string)
	ip := c.ClientIP()
	if wait := h.adminLocked(ip); wait > 0 {
		c.Header("Retry-After", strconv.Itoa(int(wait.Seconds())+1))
		c.JSON(http.StatusTooManyRequests, gin.H{"detail": fmt.Sprintf("Đăng nhập ban tổ chức sai quá %d lần. Thử lại sau %d phút.", adminMaxFailures, int(wait.Minutes())+1)})
		return
	}
	if !localRequest(c) {
		challenge, _ := req["human_challenge"].(string)
		solution, _ := req["human_solution"].(string)
		if err := h.Human.Check(challenge, solution); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error(), "human_check": true})
			return
		}
	}
	if username != "" && !isAdminUsername(username) {
		if h.Judges == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"detail": "Invalid organizer credentials"})
			return
		}
		judge, err := h.Judges.Authenticate(username, password)
		if errors.Is(err, repository.ErrJudgeCredentials) {
			h.adminResult(ip, false)
			c.JSON(http.StatusUnauthorized, gin.H{"detail": err.Error()})
			return
		}
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Chưa kiểm tra được tài khoản giám khảo. Hãy thử lại."})
			return
		}
		token, err := h.sessions.Create(auth.Session{Role: "ADMIN", Judge: judge.Username, DisplayName: judge.DisplayName})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"detail": "Could not create session"})
			return
		}
		h.adminResult(ip, true)
		c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "role": "ADMIN", "judge": judge.Username, "display_name": judge.DisplayName, "session_token": token})
		return
	}
	configured := os.Getenv("ADMIN_PASSWORD")
	if configured == "" || subtle.ConstantTimeCompare([]byte(password), []byte(configured)) != 1 {
		h.adminResult(ip, false)
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Invalid organizer credentials"})
		return
	}
	h.adminResult(ip, true)
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
	teamName := ""
	if team, ok := result["team"].(map[string]interface{}); ok {
		teamName, _ = team["team_name"].(string)
	}
	token, err := h.sessions.Create(auth.Session{TournamentID: tournamentID, MatchID: matchID, Role: role, Side: side, StudentID: studentID, TeamName: teamName})
	if err == nil {
		result["session_token"] = token
	}
}

func (h *MatchHandler) CurrentSession(c *gin.Context) {
	session, ok := sessionFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."})
		return
	}
	session.Nonce = ""
	c.JSON(http.StatusOK, gin.H{
		"role": session.Role, "side": session.Side, "tournament_id": session.TournamentID, "match_id": session.MatchID,
		"student_id": session.StudentID, "team_name": session.TeamName, "judge": session.Judge, "display_name": session.DisplayName,
		"owner": session.IsOwner(), "expires_at": session.ExpiresAt, "issued_at": session.IssuedAt,
	})
}

func (h *MatchHandler) Logout(c *gin.Context) {
	token := strings.TrimSpace(strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer "))
	h.sessions.Revoke(token)
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS"})
}

func (h *MatchHandler) ValidateCode(c *gin.Context) {
	var req map[string]interface{}
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Mã lệnh không hợp lệ"})
		return
	}
	if !validBotPayload(c, req, false) {
		return
	}
	result, err := h.service.ValidateCode(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
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
	if !h.accountPassword(c, req) {
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
	if username == "" {
		username, _ = req["student_id"].(string)
	}
	password, _ := req["password"].(string)
	if strings.TrimSpace(username) == "" || password == "" || isAdminUsername(username) {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Nhập Mã sinh viên hoặc email cùng mật khẩu của đội."})
		return
	}
	challenge, _ := req["human_challenge"].(string)
	solution, _ := req["human_solution"].(string)
	if err := h.Human.Check(challenge, solution); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error(), "human_check": true})
		return
	}
	// Đăng nhập bằng email: đổi sang MSSV của đội đã đăng ký email đó.
	if strings.Contains(username, "@") && h.Accounts != nil {
		id, err := h.Accounts.IDByEmail(username)
		if err != nil {
			c.JSON(401, gin.H{"detail": "Email hoặc mật khẩu không đúng. Nếu đội chưa có email, hãy đăng nhập bằng Mã sinh viên."})
			return
		}
		username = id
	}
	preferredTournament, _ := req["tournament_id"].(string)
	originalPassword := password
	if h.Accounts != nil {
		if h.AccountSync != nil {
			if err := h.AccountSync(); err != nil {
				c.JSON(503, gin.H{"detail": "Không thể tải tài khoản."})
				return
			}
		}
		a, err := h.Accounts.Authenticate(username, password)
		if err != nil {
			c.JSON(401, gin.H{"detail": "Mã sinh viên hoặc mật khẩu không đúng, hoặc tài khoản đã bị xóa."})
			return
		}
		username = a.StudentID
		password = "k69" + a.StudentID
	}
	type loginCandidate struct {
		tournamentID string
		matchID      string
		priority     int
	}
	var candidates []loginCandidate
	var rosterTeam map[string]interface{}
	rosterTournament := ""
	rosterPriority := 100
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
		if teams, ok := tournament["teams"].([]interface{}); ok {
			for _, rawTeam := range teams {
				team, _ := rawTeam.(map[string]interface{})
				sid, _ := team["student_id"].(string)
				if strings.EqualFold(strings.TrimSpace(sid), strings.TrimSpace(username)) && tournamentPriority < rosterPriority {
					rosterTeam, rosterTournament, rosterPriority = team, tournamentID, tournamentPriority
				}
			}
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
	if rosterTeam != nil {
		sid, _ := rosterTeam["student_id"].(string)
		if subtle.ConstantTimeCompare([]byte(password), []byte("k69"+strings.TrimSpace(sid))) == 1 {
			name, _ := rosterTeam["team_name"].(string)
			result := map[string]interface{}{"status": "SUCCESS", "role": "TEAM", "tournament_id": rosterTournament, "match_id": "", "team": map[string]interface{}{"student_id": sid, "team_name": name}}
			h.issueSession(rosterTournament, "", "TEAM", "", sid, result)
			if result["session_token"] == nil {
				c.JSON(http.StatusInternalServerError, gin.H{"detail": "Could not create session"})
				return
			}
			c.JSON(http.StatusOK, result)
			return
		}
	}
	if h.Accounts != nil {
		h.accountLogin(c, username, originalPassword)
		return
	}
	c.JSON(http.StatusUnauthorized, gin.H{"detail": "Không tìm thấy đội với MSSV và mật khẩu này."})
}

func (h *MatchHandler) SelectTeamMatch(c *gin.Context) {
	session, ok := sessionFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Phiên đăng nhập đã hết hạn."})
		return
	}
	if session.Role != "TEAM" {
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
			result := map[string]interface{}{"status": "SUCCESS", "match_id": matchID, "side": side, "team": team}
			params := map[string]interface{}{"match_id": matchID, "side": side, "student_id": studentID, "password": "k69" + strings.TrimSpace(studentID)}
			if _, err := h.service.MutateTournament(tournamentID, "auth", params); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
				return
			}
			h.issueSession(tournamentID, matchID, session.Role, side, session.StudentID, result)
			result["team_name"] = team["team_name"]
			delete(result, "team")
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

func (h *MatchHandler) authorizeCurrentTeam(c *gin.Context, tournamentID, matchID string) bool {
	session, ok := sessionFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Cần đăng nhập để nộp mã lệnh."})
		return false
	}
	if session.Role == "ADMIN" {
		return true
	}
	tournament, err := h.service.GetTournamentByID(tournamentID)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": err.Error()})
		return false
	}
	matches, _ := tournament["matches"].(map[string]interface{})
	match, _ := matches[matchID].(map[string]interface{})
	if match == nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Trận đấu không tồn tại."})
		return false
	}

	matchedSide := ""
	for _, side := range []string{"team_a", "team_b"} {
		team, _ := match[side].(map[string]interface{})
		if team != nil {
			studentID, _ := team["student_id"].(string)
			if session.StudentID != "" && strings.EqualFold(strings.TrimSpace(studentID), strings.TrimSpace(session.StudentID)) {
				matchedSide = side
				break
			}
		}
	}

	if matchedSide == "" {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Đội của bạn không tham gia trận đấu này."})
		return false
	}

	// Cập nhật session vào context với đúng nhánh và trận để các bước sau không bị lỗi
	session.TournamentID = tournamentID
	session.MatchID = matchID
	session.Side = matchedSide
	c.Set("session", session)
	return true
}

func (h *MatchHandler) SubmitDraftCode(c *gin.Context) {
	id := c.Param("id")
	matchID := c.Param("matchId")
	if !h.authorizeCurrentTeam(c, id, matchID) {
		return
	}
	var req map[string]interface{}
	if c.ShouldBindJSON(&req) != nil || req == nil {
		c.JSON(400, gin.H{"detail": "Dữ liệu nộp bài không hợp lệ."})
		return
	}
	if !validBotPayload(c, req, true) {
		return
	}
	if session, ok := sessionFromContext(c); ok && session.Role != "ADMIN" {
		req["side"] = session.Side
	}
	req["session_authenticated"] = true
	req["match_id"] = matchID

	res, err := h.service.MutateTournament(id, "submit-draft", req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	if session, ok := sessionFromContext(c); ok && session.Role != "ADMIN" {
		if tournament, ok := res["tournament"].(map[string]interface{}); ok {
			res["tournament"] = redactTournament(tournament, session)
		}
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
	if !h.authorizeCurrentTeam(c, id, matchID) {
		return
	}
	var req map[string]interface{}
	if c.ShouldBindJSON(&req) != nil || req == nil {
		c.JSON(400, gin.H{"detail": "Dữ liệu nộp bài không hợp lệ."})
		return
	}
	if !validBotPayload(c, req, false) {
		return
	}
	if session, ok := sessionFromContext(c); ok && session.Role != "ADMIN" {
		req["side"] = session.Side
	}
	req["session_authenticated"] = true
	req["match_id"] = matchID
	delete(req, "_receipt_key")
	if session, ok := sessionFromContext(c); ok && session.Role == "TEAM" {
		if requestID := c.GetHeader("X-Submission-Id"); requestID != "" {
			if len(requestID) > 80 {
				c.JSON(400, gin.H{"detail": "Invalid submission ID"})
				return
			}
			req["_receipt_key"] = fmt.Sprintf("%x", sha256.Sum256([]byte(session.StudentID+"\x00"+requestID)))
		}
	}

	res, err := h.service.MutateTournament(id, "submit-code", req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	if session, ok := sessionFromContext(c); ok && session.Role != "ADMIN" {
		if tournament, ok := res["tournament"].(map[string]interface{}); ok {
			res["tournament"] = redactTournament(tournament, session)
		}
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
	if !h.accountPassword(c, req) {
		return
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
	if !h.authorizeCurrentTeam(c, id, matchID) {
		return
	}
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
				side := session.Side
				if side == "" || session.MatchID != matchID {
					for _, s := range []string{"team_a", "team_b"} {
						team, _ := m[s].(map[string]interface{})
						if team != nil {
							sid, _ := team["student_id"].(string)
							if session.StudentID != "" && strings.EqualFold(strings.TrimSpace(sid), strings.TrimSpace(session.StudentID)) {
								side = s
								break
							}
						}
					}
				}
				filtered := make([]interface{}, 0)
				if items, ok := subs.([]interface{}); ok {
					for _, item := range items {
						if sub, ok := item.(map[string]interface{}); ok && sub["side"] == side {
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
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Dữ liệu chạy thử không hợp lệ."})
		return
	}
	if !validBotPayload(c, req, false) {
		return
	}
	res, err := h.service.PracticeMatch(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, res)
}

func (h *MatchHandler) GetMatchHistory(c *gin.Context) {
	if cached, ok := derivedGet("history"); ok {
		c.JSON(http.StatusOK, cached)
		return
	}
	version := derivedVersion()
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
	derivedSet("history", version, historyList)
	c.JSON(http.StatusOK, historyList)
}

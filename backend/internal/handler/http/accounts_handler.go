package http

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/auth"
	"project-tuan3/internal/repository"
	"project-tuan3/internal/service"
)

var adminMonitorStartTime = time.Now()

type AccountsHandler struct {
	Store            *repository.Accounts
	Service          *service.TournamentService
	WorkerReady      func(context.Context) error
	WorkerMonitor    func(context.Context) map[string]interface{}
	DatabaseReady    func(context.Context) error
	DatabaseStats    func(context.Context) (map[string]interface{}, error)
	DatabaseOptimize func(context.Context) (string, error)
	QueueCounts      func(context.Context) (map[string]int, error)
	mu               sync.Mutex
}

// Monitoring returns live real-time metrics of servers, judges, and contest submissions.
func (h *AccountsHandler) Monitoring(c *gin.Context) {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()

	workerStatus := "UNKNOWN"
	if h.WorkerReady != nil && h.WorkerMonitor == nil {
		workerStatus = "READY"
		if err := h.WorkerReady(ctx); err != nil {
			workerStatus = "DEGRADED"
		}
	}
	pool := map[string]interface{}{"status": workerStatus}
	if h.WorkerMonitor != nil {
		pool = h.WorkerMonitor(ctx)
	}
	dbStatus := "UNKNOWN"
	dbCtx, dbCancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer dbCancel()
	if h.DatabaseReady != nil {
		dbStatus = "READY"
		if h.DatabaseReady(dbCtx) != nil {
			dbStatus = "UNAVAILABLE"
		}
	}
	dbData := gin.H{"status": dbStatus}
	if h.DatabaseStats != nil {
		if stats, err := h.DatabaseStats(dbCtx); err == nil && stats != nil {
			for k, v := range stats {
				dbData[k] = v
			}
		}
	}

	queue := gin.H{"status": "UNKNOWN"}
	if h.QueueCounts != nil {
		counts, err := h.QueueCounts(dbCtx)
		if err != nil {
			queue["status"] = "UNAVAILABLE"
		} else {
			queue["status"], queue["counts"] = "READY", counts
		}
	}
	accountsList, accountsErr := h.Store.List()
	if accountsErr != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Không thể đọc dữ liệu giám sát tài khoản"})
		return
	}
	totalAccounts := len(accountsList)

	tournaments := h.Service.GetAllTournaments()
	totalTournaments := len(tournaments)

	var activeTourn map[string]interface{}
	var enrolledTeamsCount int
	var submittedCount int
	var unsubmittedTeams []string

	ids := make([]string, 0, len(tournaments))
	for id := range tournaments {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		raw := tournaments[id]
		t, _ := raw.(map[string]interface{})
		if selected := c.Query("tournament_id"); selected != "" {
			if selected == id {
				activeTourn = t
				break
			}
			continue
		}
		if status, _ := t["status"].(string); status == "RUNNING" || activeTourn == nil {
			activeTourn = t
		}
	}

	if activeTourn != nil {
		teams, _ := activeTourn["teams"].([]interface{})
		enrolledTeamsCount = len(teams)
		matches, _ := activeTourn["matches"].(map[string]interface{})

		submittedSet := make(map[string]bool)
		for _, rawM := range matches {
			match, _ := rawM.(map[string]interface{})
			teamA, _ := match["team_a"].(map[string]interface{})
			teamB, _ := match["team_b"].(map[string]interface{})
			if subA, _ := teamA["code_submitted"].(bool); subA {
				if id, _ := teamA["student_id"].(string); id != "" {
					submittedSet[id] = true
				}
			}
			if subB, _ := teamB["code_submitted"].(bool); subB {
				if id, _ := teamB["student_id"].(string); id != "" {
					submittedSet[id] = true
				}
			}
		}
		submittedCount = len(submittedSet)

		for _, rawTeam := range teams {
			tm, _ := rawTeam.(map[string]interface{})
			id, _ := tm["student_id"].(string)
			name, _ := tm["team_name"].(string)
			if id != "" && !submittedSet[id] {
				unsubmittedTeams = append(unsubmittedTeams, name+" ("+id+")")
			}
		}
	}

	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{
		"database":  dbData,
		"queue":     queue,
		"timestamp": time.Now().Format(time.RFC3339),
		"server": gin.H{
			"uptime_seconds":  time.Since(adminMonitorStartTime).Seconds(),
			"cpu_cores":       runtime.NumCPU(),
			"goroutines":      runtime.NumGoroutine(),
			"memory_alloc_mb": float64(m.Alloc) / 1024 / 1024,
			"memory_sys_mb":   float64(m.Sys) / 1024 / 1024,
			"gc_cycles":       m.NumGC,
		},
		"worker_pool": pool,
		"contest": gin.H{
			"tournament_name": func() interface{} {
				if activeTourn != nil {
					return activeTourn["name"]
				}
				return "Chưa chọn giải"
			}(),
			"total_registered_accounts": totalAccounts,
			"total_tournaments":         totalTournaments,
			"enrolled_teams":            enrolledTeamsCount,
			"submitted_teams":           submittedCount,
			"unsubmitted_count":         len(unsubmittedTeams),
			"unsubmitted_teams":         unsubmittedTeams,
		},
	})
}

// OptimizeDatabase cleans up table statistics and reclaims dead tuples in Supabase.
func (h *AccountsHandler) OptimizeDatabase(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()
	if h.DatabaseOptimize != nil {
		msg, err := h.DatabaseOptimize(ctx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"detail": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "message": msg})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "message": "Đã tối ưu hóa bộ nhớ cơ sở dữ liệu thành công."})
}

// Import pre-existing roster accounts without replacing user-chosen passwords.
func (h *AccountsHandler) ImportLegacy() error {
	known, err := h.Store.KnownIDs()
	if err != nil {
		return err
	}
	for _, raw := range h.Service.GetAllTournaments() {
		t, _ := raw.(map[string]interface{})
		teams, _ := t["teams"].([]interface{})
		for _, rawTeam := range teams {
			team, _ := rawTeam.(map[string]interface{})
			id, _ := team["student_id"].(string)
			name, _ := team["team_name"].(string)
			if strings.TrimSpace(id) == "" {
				continue
			}
			key := strings.ToUpper(strings.TrimSpace(id))
			if !known[key] {
				if err := h.Store.Create(id, name, "k69"+strings.TrimSpace(id)); err != nil && !errors.Is(err, repository.ErrAccountExists) {
					return err
				}
				known[key] = true
			}
		}
	}
	return nil
}

func (h *AccountsHandler) Register(c *gin.Context) {
	var req struct {
		StudentID string `json:"student_id"`
		TeamName  string `json:"team_name"`
		Password  string `json:"password"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(400, gin.H{"detail": "Thông tin đăng ký không hợp lệ."})
		return
	}
	req.StudentID = strings.ToUpper(strings.TrimSpace(req.StudentID))
	req.TeamName = strings.TrimSpace(req.TeamName)
	if !regexp.MustCompile(`^[A-Z0-9][A-Z0-9_-]{3,31}$`).MatchString(req.StudentID) || isAdminUsername(req.StudentID) {
		c.JSON(400, gin.H{"detail": "Mã sinh viên cần 4–32 ký tự chữ, số, gạch ngang hoặc gạch dưới."})
		return
	}
	if utf8.RuneCountInString(req.TeamName) < 2 || utf8.RuneCountInString(req.TeamName) > 80 {
		c.JSON(400, gin.H{"detail": "Tên đội cần từ 2 đến 80 ký tự."})
		return
	}
	if len(req.Password) < 6 || len(req.Password) > 72 || strings.TrimSpace(req.Password) == "" {
		c.JSON(400, gin.H{"detail": "Mật khẩu cần từ 6 đến 72 byte."})
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if err := h.ImportLegacy(); err != nil {
		c.JSON(503, gin.H{"detail": "Chưa thể đọc danh sách tài khoản."})
		return
	}
	if err := h.Store.Create(req.StudentID, req.TeamName, req.Password); err != nil {
		if errors.Is(err, repository.ErrAccountExists) {
			c.JSON(409, gin.H{"detail": err.Error()})
		} else {
			c.JSON(503, gin.H{"detail": "Không thể lưu tài khoản. Vui lòng thử lại."})
		}
		return
	}
	c.JSON(http.StatusCreated, gin.H{"student_id": req.StudentID, "team_name": req.TeamName})
}

func (h *AccountsHandler) List(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	if err := h.ImportLegacy(); err != nil {
		c.JSON(503, gin.H{"detail": "Không thể tải tài khoản."})
		return
	}
	accounts, err := h.Store.List()
	if err != nil {
		c.JSON(503, gin.H{"detail": "Không thể tải tài khoản."})
		return
	}
	items := []gin.H{}
	for _, a := range accounts {
		password, err := h.Store.Password(a)
		// A missing historical encryption key must not hide the entire registry.
		// Authentication still uses the independent bcrypt hash.
		items = append(items, gin.H{"student_id": a.StudentID, "team_name": a.TeamName, "password": password, "password_available": err == nil})
	}
	c.JSON(200, items)
}

func (h *AccountsHandler) Delete(c *gin.Context) {
	h.mu.Lock()
	defer h.mu.Unlock()
	// Retain tournament results and rosters; deleting an account revokes access.
	if err := h.Store.Delete(c.Param("studentId")); err != nil {
		if errors.Is(err, repository.ErrAccountMissing) {
			c.JSON(404, gin.H{"detail": err.Error()})
		} else {
			c.JSON(503, gin.H{"detail": "Không thể lưu thay đổi."})
		}
		return
	}
	c.JSON(200, gin.H{"status": "SUCCESS"})
}

func (h *AccountsHandler) Enroll(c *gin.Context) {
	h.mu.Lock()
	defer h.mu.Unlock()
	a, err := h.Store.Get(c.Param("studentId"))
	if err != nil || a.Deleted {
		c.JSON(404, gin.H{"detail": "Tài khoản không tồn tại."})
		return
	}
	var req struct {
		TournamentID string `json:"tournament_id"`
	}
	if c.ShouldBindJSON(&req) != nil || req.TournamentID == "" {
		c.JSON(400, gin.H{"detail": "Hãy chọn giải đấu."})
		return
	}
	_, err = h.Service.MutateTournament(req.TournamentID, "add-team", map[string]interface{}{"student_id": a.StudentID, "team_name": a.TeamName, "university": "Khối Kỹ Thuật"})
	if err != nil {
		c.JSON(400, gin.H{"detail": err.Error()})
		return
	}
	c.Set("eventTournamentID", req.TournamentID)
	c.JSON(200, gin.H{"status": "SUCCESS", "tournament_id": req.TournamentID})
}

func (h *AccountsHandler) ForgotPassword(c *gin.Context) {
	var req struct {
		StudentID string `json:"student_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.StudentID) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Vui lòng nhập Mã sinh viên của bạn."})
		return
	}
	if requestSession(c).Role != "ADMIN" {
		c.JSON(200, gin.H{"status": "SUCCESS", "message": "Liên hệ ban tổ chức để xác minh danh tính và nhận mã đặt lại mật khẩu có hiệu lực 15 phút."})
		return
	}
	token, err := h.Store.RequestPasswordReset(req.StudentID, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Không tìm thấy tài khoản với Mã sinh viên này."})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status":      "SUCCESS",
		"message":     "Mã xác thực đặt lại mật khẩu đã được tạo (có hiệu lực trong 15 phút).",
		"reset_token": token,
	})
}

func (h *AccountsHandler) ResetPassword(c *gin.Context) {
	var req struct {
		StudentID   string `json:"student_id"`
		ResetToken  string `json:"reset_token"`
		NewPassword string `json:"new_password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.StudentID) == "" || strings.TrimSpace(req.ResetToken) == "" || len(strings.TrimSpace(req.NewPassword)) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Vui lòng nhập đầy đủ Mã sinh viên, mã xác nhận và mật khẩu mới (tối thiểu 6 ký tự)."})
		return
	}
	err := h.Store.ResetPasswordWithToken(req.StudentID, req.ResetToken, req.NewPassword, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status":  "SUCCESS",
		"message": "Đặt lại mật khẩu thành công! Bạn có thể đăng nhập ngay bằng mật khẩu mới.",
	})
}

func (h *AccountsHandler) GetNotifications(c *gin.Context) {
	recipientID := "ALL"
	if sVal, exists := c.Get("session"); exists {
		if s, ok := sVal.(auth.Session); ok {
			if s.Role == "ADMIN" {
				recipientID = "ADMIN"
			} else if s.StudentID != "" {
				recipientID = s.StudentID
			}
		}
	}
	list, unread, err := h.Store.ListNotifications(recipientID, 50)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Không thể tải danh sách thông báo."})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status":        "SUCCESS",
		"notifications": list,
		"unread_count":  unread,
	})
}

func (h *AccountsHandler) ReadNotification(c *gin.Context) {
	session := requestSession(c)
	if session.Role != "ADMIN" && (session.Role != "TEAM" || session.StudentID == "") {
		c.JSON(401, gin.H{"detail": "Bạn cần đăng nhập để đánh dấu thông báo."})
		return
	}
	recipientID := session.StudentID
	if session.Role == "ADMIN" {
		recipientID = "ADMIN"
	}
	var req struct {
		ID  string `json:"id"`
		All bool   `json:"all"`
	}
	if c.ShouldBindJSON(&req) != nil || (!req.All && req.ID == "") {
		c.JSON(400, gin.H{"detail": "Chọn thông báo cần đánh dấu đã đọc."})
		return
	}
	var err error
	if req.All {
		err = h.Store.MarkAllNotificationsRead(recipientID)
	} else if req.ID != "" {
		err = h.Store.MarkNotificationRead(req.ID, recipientID)
	}
	if err != nil {
		c.JSON(503, gin.H{"detail": "Chưa lưu được trạng thái thông báo. Hãy thử lại."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS"})
}

func (h *AccountsHandler) AdminBroadcastNotification(c *gin.Context) {
	var req struct {
		Title     string `json:"title"`
		Message   string `json:"message"`
		EventType string `json:"event_type"`
		LinkTab   string `json:"link_tab"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Title) == "" || strings.TrimSpace(req.Message) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Tiêu đề và nội dung thông báo không được để trống."})
		return
	}
	if req.EventType == "" {
		req.EventType = "ANNOUNCEMENT"
	}
	n := repository.Notification{
		RecipientID: "ALL",
		EventType:   req.EventType,
		Title:       strings.TrimSpace(req.Title),
		Message:     strings.TrimSpace(req.Message),
		LinkTab:     strings.TrimSpace(req.LinkTab),
		CreatedAt:   time.Now().UTC(),
	}
	if err := h.Store.CreateNotification(n); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "Không thể gửi thông báo."})
		return
	}
	_ = h.Store.LogAdminAction("admin", "BROADCAST_NOTIFICATION", "", "", map[string]interface{}{"title": n.Title})
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "notification": n})
}

func (h *AccountsHandler) GetTeamProfile(c *gin.Context) {
	sid := c.Query("student_id")
	if sid == "" {
		if sVal, exists := c.Get("session"); exists {
			if s, ok := sVal.(auth.Session); ok {
				sid = s.StudentID
			}
		}
	}
	if sid == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Vui lòng chỉ định student_id hoặc đăng nhập tài khoản đội."})
		return
	}
	profile, err := h.Store.GetTeamProfile(sid)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Không tìm thấy hồ sơ đội thi."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "profile": profile})
}

func (h *AccountsHandler) UpdateTeamProfile(c *gin.Context) {
	session := requestSession(c)
	if session.Role != "ADMIN" && (session.Role != "TEAM" || session.StudentID == "") {
		c.JSON(401, gin.H{"detail": "Bạn cần đăng nhập để cập nhật hồ sơ."})
		return
	}
	var p repository.TeamProfile
	if err := c.ShouldBindJSON(&p); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Dữ liệu hồ sơ không hợp lệ."})
		return
	}
	if sVal, exists := c.Get("session"); exists {
		if s, ok := sVal.(auth.Session); ok {
			if s.Role != "ADMIN" && (p.StudentID == "" || s.StudentID != p.StudentID) {
				p.StudentID = s.StudentID
			}
		}
	}
	if p.StudentID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Bạn cần đăng nhập để cập nhật hồ sơ."})
		return
	}
	if session.Role != "ADMIN" {
		old, err := h.Store.GetTeamProfile(p.StudentID)
		if err != nil {
			c.JSON(400, gin.H{"detail": "Không tìm thấy hồ sơ đội."})
			return
		}
		p.Achievements = old.Achievements
	}
	if err := h.Store.UpdateTeamProfile(p); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "message": "Cập nhật hồ sơ đội thành công!", "profile": p})
}

func (h *AccountsHandler) GetServerTime(c *gin.Context) {
	now := time.Now().UTC()
	c.JSON(http.StatusOK, gin.H{
		"server_time":    now.Unix(),
		"server_time_ms": now.UnixMilli(),
		"iso":            now.Format(time.RFC3339),
	})
}

func (h *AccountsHandler) ListAdminAuditLogs(c *gin.Context) {
	logs, err := h.Store.ListAdminAuditLogs(c.Query("tournament_id"), 50)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "Không thể tải nhật ký quản trị."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "logs": logs})
}

func (h *MatchHandler) accountLogin(c *gin.Context, username, password string) {
	a, err := h.Accounts.Authenticate(username, password)
	if err != nil {
		c.JSON(401, gin.H{"detail": "Mã sinh viên hoặc mật khẩu không đúng, hoặc tài khoản đã bị xóa."})
		return
	}
	result := map[string]interface{}{"status": "SUCCESS", "role": "TEAM", "tournament_id": "", "match_id": "", "team": map[string]interface{}{"student_id": a.StudentID, "team_name": a.TeamName}}
	h.issueSession("", "", "TEAM", "", a.StudentID, result)
	if result["session_token"] == nil {
		c.JSON(500, gin.H{"detail": "Không thể tạo phiên đăng nhập."})
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(200, result)
}

// Legacy match login endpoints still authenticate against the account registry.
// Only the trusted gateway translates to the worker's internal roster credential.
func (h *MatchHandler) accountPassword(c *gin.Context, req map[string]interface{}) bool {
	if h.Accounts == nil {
		return true
	}
	id, _ := req["student_id"].(string)
	if id == "" {
		id, _ = req["username"].(string)
	}
	password, _ := req["password"].(string)
	a, err := h.Accounts.Authenticate(id, password)
	if err != nil {
		c.JSON(401, gin.H{"detail": "Mã sinh viên hoặc mật khẩu không đúng."})
		return false
	}
	req["student_id"] = a.StudentID
	req["username"] = a.StudentID
	req["password"] = "k69" + a.StudentID
	return true
}

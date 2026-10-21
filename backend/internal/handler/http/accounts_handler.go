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
	"project-tuan3/internal/repository"
	"project-tuan3/internal/service"
)

var adminMonitorStartTime = time.Now()

type AccountsHandler struct {
	Store         *repository.Accounts
	Service       *service.TournamentService
	WorkerReady   func(context.Context) error
	WorkerMonitor func(context.Context) map[string]interface{}
	DatabaseReady func(context.Context) error
	QueueCounts   func(context.Context) (map[string]int, error)
	mu            sync.Mutex
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
		"database":  gin.H{"status": dbStatus},
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

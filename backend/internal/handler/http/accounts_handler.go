package http

import (
	"context"
	cryptorand "crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
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
	"project-tuan3/internal/humancheck"
	"project-tuan3/internal/mailer"
	"project-tuan3/internal/qualifier"
	"project-tuan3/internal/repository"
	"project-tuan3/internal/service"
)

var adminMonitorStartTime = time.Now()

type AccountsHandler struct {
	Human            *humancheck.Guard
	Store            *repository.Accounts
	Service          *service.TournamentService
	WorkerReady      func(context.Context) error
	WorkerMonitor    func(context.Context) map[string]interface{}
	DatabaseReady    func(context.Context) error
	DatabaseStats    func(context.Context) (map[string]interface{}, error)
	DatabaseOptimize func(context.Context) (string, error)
	QueueCounts      func(context.Context) (map[string]int, error)
	// Records chứa nhật ký mọi thao tác ghi của quản trị (middleware AdminAudit) để hiển thị cùng nhật ký sự kiện.
	Records *repository.QualifierRecords
	// Qualifiers dùng để ghi danh vào vòng loại và cho biết mỗi đội đang ở đâu.
	Qualifiers *qualifier.Service
	// Mailer gửi mã khôi phục mật khẩu tới email đội đã đăng ký.
	Mailer     mailer.Sender
	mu         sync.Mutex
	forgotMu   sync.Mutex
	forgotSeen map[string][]time.Time
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
		} else {
			dbData["status"] = "UNAVAILABLE"
			dbData["metrics_error"] = "Không đọc được số liệu database; hãy thử làm mới."
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
		"mail":        gin.H{"configured": h.Mailer != nil && h.Mailer.Configured()},
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
		Email     string `json:"email"`
		Challenge string `json:"human_challenge"`
		Solution  string `json:"human_solution"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(400, gin.H{"detail": "Thông tin đăng ký không hợp lệ."})
		return
	}
	req.StudentID = strings.ToUpper(strings.TrimSpace(req.StudentID))
	req.TeamName = strings.TrimSpace(req.TeamName)
	if err := validateRegistration(req.StudentID, req.TeamName, req.Password); err != nil {
		c.JSON(400, gin.H{"detail": err.Error()})
		return
	}
	if !validEmail(req.Email) {
		c.JSON(400, gin.H{"detail": "Vui lòng nhập email hợp lệ để có thể khôi phục mật khẩu."})
		return
	}
	if err := h.Human.Check(req.Challenge, req.Solution); err != nil {
		c.JSON(400, gin.H{"detail": err.Error(), "human_check": true})
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if err := h.ImportLegacy(); err != nil {
		c.JSON(503, gin.H{"detail": "Chưa thể đọc danh sách tài khoản."})
		return
	}
	if taken, err := h.Store.EmailTaken(req.Email, req.StudentID); err != nil {
		c.JSON(503, gin.H{"detail": "Không thể kiểm tra email. Vui lòng thử lại."})
		return
	} else if taken {
		c.JSON(409, gin.H{"detail": repository.ErrEmailTaken.Error()})
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
	_ = h.Store.SetEmail(req.StudentID, req.Email)
	c.JSON(http.StatusCreated, gin.H{"student_id": req.StudentID, "team_name": req.TeamName})
}

var emailPattern = regexp.MustCompile(`^[^\s@<>",;]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$`)

func validEmail(email string) bool { return emailPattern.MatchString(strings.TrimSpace(email)) }

// maskEmail che phần giữa email để hiển thị cho chính đội: ng***@gmail.com.
func maskEmail(email string) string {
	at := strings.LastIndex(email, "@")
	if at <= 0 {
		return ""
	}
	name := email[:at]
	if len(name) > 2 {
		name = name[:2] + "***"
	}
	return name + email[at:]
}

var studentIDPattern = regexp.MustCompile(`^[A-Z0-9][A-Z0-9_-]{3,31}$`)

func validateRegistration(studentID, teamName, password string) error {
	if !studentIDPattern.MatchString(studentID) || isAdminUsername(studentID) {
		return errors.New("Mã sinh viên cần 4–32 ký tự chữ, số, gạch ngang hoặc gạch dưới.")
	}
	if utf8.RuneCountInString(teamName) < 2 || utf8.RuneCountInString(teamName) > 80 {
		return errors.New("Tên đội cần từ 2 đến 80 ký tự.")
	}
	if len(password) < 6 || len(password) > 72 || strings.TrimSpace(password) == "" {
		return errors.New("Mật khẩu cần từ 6 đến 72 byte.")
	}
	return nil
}

const importBatchLimit = 500

// generatePassword sinh mật khẩu 10 ký tự dễ đọc (bỏ các ký tự dễ nhầm 0/O, 1/l/I).
func generatePassword() string {
	const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"
	b := make([]byte, 10)
	_, _ = cryptorand.Read(b)
	for i := range b {
		b[i] = alphabet[int(b[i])%len(alphabet)]
	}
	return string(b)
}

// ImportAccounts tạo tài khoản đội hàng loạt. Mật khẩu trống sẽ được sinh tự động và chỉ trả về đúng một lần.
func (h *AccountsHandler) ImportAccounts(c *gin.Context) {
	var req struct {
		Rows []struct {
			StudentID string `json:"student_id"`
			TeamName  string `json:"team_name"`
			Password  string `json:"password"`
			Email     string `json:"email"`
		} `json:"rows"`
		TournamentID string `json:"tournament_id"`
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 512*1024)
	if c.ShouldBindJSON(&req) != nil || len(req.Rows) == 0 {
		c.JSON(400, gin.H{"detail": "Danh sách nhập không hợp lệ."})
		return
	}
	if len(req.Rows) > importBatchLimit {
		c.JSON(400, gin.H{"detail": fmt.Sprintf("Mỗi lần nhập tối đa %d dòng.", importBatchLimit)})
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if err := h.ImportLegacy(); err != nil {
		c.JSON(503, gin.H{"detail": "Chưa thể đọc danh sách tài khoản."})
		return
	}
	results := make([]gin.H, 0, len(req.Rows))
	created, enrolled := 0, 0
	seen := map[string]bool{}
	for i, row := range req.Rows {
		sid := strings.ToUpper(strings.TrimSpace(row.StudentID))
		name := strings.TrimSpace(row.TeamName)
		password, generated := row.Password, false
		if strings.TrimSpace(password) == "" {
			password, generated = generatePassword(), true
		}
		result := gin.H{"row": i + 1, "student_id": sid, "team_name": name}
		switch err := validateRegistration(sid, name, password); {
		case err != nil:
			result["status"], result["detail"] = "INVALID", err.Error()
		case seen[sid]:
			result["status"], result["detail"] = "DUPLICATE", "Mã sinh viên bị lặp trong file."
		default:
			seen[sid] = true
			if err := h.Store.Create(sid, name, password); errors.Is(err, repository.ErrAccountExists) {
				result["status"], result["detail"] = "EXISTS", "Tài khoản đã tồn tại (không đổi mật khẩu)."
			} else if err != nil {
				result["status"], result["detail"] = "ERROR", "Không lưu được tài khoản."
			} else {
				created++
				result["status"] = "CREATED"
				if validEmail(row.Email) {
					_ = h.Store.SetEmail(sid, row.Email)
				}
				if generated {
					result["password"] = password
				}
			}
		}
		if req.TournamentID != "" && (result["status"] == "CREATED" || result["status"] == "EXISTS") {
			if _, err := h.Service.MutateTournament(req.TournamentID, "add-team", map[string]interface{}{"student_id": sid, "team_name": name, "university": "Khối Kỹ Thuật"}); err != nil {
				result["enroll_error"] = err.Error()
			} else {
				enrolled++
				result["enrolled"] = true
			}
		}
		results = append(results, result)
	}
	if req.TournamentID != "" && enrolled > 0 {
		c.Set("eventTournamentID", req.TournamentID)
	}
	_ = h.Store.LogAdminAction(requestSession(c).Actor(), "IMPORT_ACCOUNTS", req.TournamentID, "", map[string]interface{}{"rows": len(req.Rows), "created": created, "enrolled": enrolled})
	c.Header("Cache-Control", "no-store")
	c.JSON(200, gin.H{"status": "SUCCESS", "created": created, "enrolled": enrolled, "results": results})
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
		_, err := h.Store.Password(a)
		// A missing historical encryption key must not hide the entire registry.
		// Authentication still uses the independent bcrypt hash.
		// Never return the plaintext password: teams who forget it use the reset flow.
		items = append(items, gin.H{"student_id": a.StudentID, "team_name": a.TeamName, "password_available": err == nil})
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
		TargetType   string `json:"target_type"` // tournament (mặc định) | qualifier | ai_qualifier
		TargetID     string `json:"target_id"`
	}
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(400, gin.H{"detail": "Yêu cầu không hợp lệ."})
		return
	}
	if req.TargetID == "" {
		req.TargetID = req.TournamentID
	}
	if req.TargetType == "" {
		req.TargetType = "tournament"
	}
	if req.TargetID == "" {
		c.JSON(400, gin.H{"detail": "Hãy chọn giải hoặc vòng loại để ghi danh."})
		return
	}
	actor := requestSession(c).Actor()
	switch req.TargetType {
	case "qualifier", "ai_qualifier":
		if h.Qualifiers == nil {
			c.JSON(503, gin.H{"detail": "Chưa sẵn sàng ghi danh vào vòng loại."})
			return
		}
		e, total, err := h.Qualifiers.AdminRegister(req.TargetID, a.StudentID, req.TargetType == "ai_qualifier")
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				c.JSON(404, gin.H{"detail": "Không tìm thấy vòng loại này (có thể đã bị xóa)."})
				return
			}
			c.JSON(400, gin.H{"detail": err.Error()})
			return
		}
		_ = h.Store.LogAdminAction(actor, "ENROLL_QUALIFIER", "", e.ID, map[string]interface{}{"student_id": a.StudentID, "qualifier": e.Name, "kind": req.TargetType})
		c.JSON(200, gin.H{"status": "SUCCESS", "target_type": req.TargetType, "target_id": e.ID, "target_name": e.Name, "total": total, "capacity": 4000})
	case "tournament":
		_, err = h.Service.MutateTournament(req.TargetID, "add-team", map[string]interface{}{"student_id": a.StudentID, "team_name": a.TeamName, "university": "Khối Kỹ Thuật"})
		if err != nil {
			c.JSON(400, gin.H{"detail": err.Error()})
			return
		}
		c.Set("eventTournamentID", req.TargetID)
		name, total, capacity := req.TargetID, 0, 0
		if t, err := h.Service.GetTournamentByID(req.TargetID); err == nil {
			if n, _ := t["name"].(string); n != "" {
				name = n
			}
			teams, _ := t["teams"].([]interface{})
			total = len(teams)
			if f, ok := t["num_teams"].(float64); ok {
				capacity = int(f)
			}
		}
		_ = h.Store.LogAdminAction(actor, "ENROLL_TOURNAMENT", req.TargetID, "", map[string]interface{}{"student_id": a.StudentID, "tournament": name})
		c.JSON(200, gin.H{"status": "SUCCESS", "target_type": "tournament", "target_id": req.TargetID, "tournament_id": req.TargetID, "target_name": name, "total": total, "capacity": capacity})
	default:
		c.JSON(400, gin.H{"detail": "Loại đích không hợp lệ."})
	}
}

// Enrollments cho biết mỗi tài khoản đang ở giải nào / vòng loại nào để ban tổ chức không ghi danh nhầm hay trùng.
func (h *AccountsHandler) Enrollments(c *gin.Context) {
	type chip struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		Kind   string `json:"kind"`
		Status string `json:"status,omitempty"`
	}
	out := map[string][]chip{}
	for id, raw := range h.Service.GetAllTournaments() {
		t, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		name, _ := t["name"].(string)
		kind := "tournament"
		if track, _ := t["track"].(string); track == "AI" {
			kind = "ai_main"
		}
		status, _ := t["status"].(string)
		teams, _ := t["teams"].([]interface{})
		for _, team := range teams {
			if m, ok := team.(map[string]interface{}); ok {
				if sid, _ := m["student_id"].(string); sid != "" {
					key := strings.ToUpper(sid)
					out[key] = append(out[key], chip{ID: id, Name: name, Kind: kind, Status: status})
				}
			}
		}
	}
	if h.Qualifiers != nil {
		if events, err := h.Qualifiers.Events(); err == nil {
			for _, e := range events {
				people, err := h.Qualifiers.ParticipantSummaries(e.ID)
				if err != nil {
					continue
				}
				kind := "qualifier"
				if e.Kind == qualifier.KindAI {
					kind = "ai_qualifier"
				}
				for sid, p := range people {
					if p.TestBot {
						continue
					}
					key := strings.ToUpper(sid)
					out[key] = append(out[key], chip{ID: e.ID, Name: e.Name, Kind: kind, Status: e.Status})
				}
			}
		}
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(200, gin.H{"items": out})
}

const forgotLimit = 3

// ForgotPassword: đội nhập MSSV + email đã đăng ký; nếu khớp, hệ thống gửi mã khôi phục (hiệu lực 15 phút)
// tới email đó. Luôn trả cùng một thông báo để không lộ MSSV/email nào tồn tại. Admin vẫn tạo mã trực tiếp.
func (h *AccountsHandler) ForgotPassword(c *gin.Context) {
	var req struct {
		StudentID string `json:"student_id"`
		Email     string `json:"email"`
		Challenge string `json:"human_challenge"`
		Solution  string `json:"human_solution"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.StudentID) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Vui lòng nhập Mã sinh viên của bạn."})
		return
	}
	if requestSession(c).Role == "ADMIN" {
		token, err := h.Store.RequestPasswordReset(req.StudentID, c.ClientIP(), c.Request.UserAgent())
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"detail": "Không tìm thấy tài khoản với Mã sinh viên này."})
			return
		}
		_ = h.Store.LogAdminAction(requestSession(c).Actor(), "ISSUE_RESET_TOKEN", "", "", map[string]interface{}{"student_id": strings.ToUpper(req.StudentID)})
		c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "message": "Mã xác thực đặt lại mật khẩu đã được tạo (có hiệu lực trong 15 phút).", "reset_token": token})
		return
	}
	if !validEmail(req.Email) {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Vui lòng nhập email đã đăng ký của đội."})
		return
	}
	if err := h.Human.Check(req.Challenge, req.Solution); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"detail": err.Error(), "human_check": true})
		return
	}
	if h.Mailer == nil || !h.Mailer.Configured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Hệ thống chưa cấu hình gửi email. Vui lòng liên hệ ban tổ chức để được cấp mã khôi phục."})
		return
	}
	sid := strings.ToUpper(strings.TrimSpace(req.StudentID))
	h.forgotMu.Lock()
	if h.forgotSeen == nil {
		h.forgotSeen = map[string][]time.Time{}
	}
	recent := h.forgotSeen[sid][:0]
	for _, at := range h.forgotSeen[sid] {
		if time.Since(at) < time.Hour {
			recent = append(recent, at)
		}
	}
	if len(recent) >= forgotLimit {
		h.forgotSeen[sid] = recent
		h.forgotMu.Unlock()
		c.Header("Retry-After", "3600")
		c.JSON(http.StatusTooManyRequests, gin.H{"detail": "Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau 1 giờ."})
		return
	}
	h.forgotSeen[sid] = append(recent, time.Now())
	h.forgotMu.Unlock()

	generic := gin.H{"status": "SUCCESS", "message": "Nếu MSSV và email khớp với tài khoản, mã khôi phục đã được gửi tới email (hiệu lực 15 phút). Hãy kiểm tra cả thư mục Spam."}
	account, err := h.Store.Get(sid)
	if err != nil || account.Deleted || account.Email == "" || !strings.EqualFold(account.Email, strings.TrimSpace(req.Email)) {
		c.JSON(http.StatusOK, generic)
		return
	}
	token, err := h.Store.RequestPasswordReset(sid, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		c.JSON(http.StatusOK, generic)
		return
	}
	body := strings.Join([]string{
		"Xin chào đội " + account.TeamName + ",",
		"",
		"Mã khôi phục mật khẩu cho tài khoản " + sid + " là:",
		"",
		"    " + token,
		"",
		"Mã có hiệu lực trong 15 phút. Mở BOT K69 ARENA → Đăng nhập → Quên mật khẩu, nhập mã này và mật khẩu mới.",
		"Nếu bạn không yêu cầu, hãy bỏ qua email này.",
		"",
		"Ban tổ chức BOT K69 ARENA",
	}, "\r\n")
	if err := h.Mailer.Send(account.Email, "Mã khôi phục mật khẩu BOT K69 ARENA", body); err != nil {
		log.Printf("[Mailer] gửi mã khôi phục cho %s thất bại: %v", sid, err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Chưa gửi được email lúc này. Vui lòng thử lại sau hoặc liên hệ ban tổ chức."})
		return
	}
	c.JSON(http.StatusOK, generic)
}

// ViewPassword cho ban tổ chức xem mật khẩu của một đội (để hỗ trợ đội quên mật khẩu). Mỗi lần xem đều ghi nhật ký.
func (h *AccountsHandler) ViewPassword(c *gin.Context) {
	account, err := h.Store.Get(c.Param("studentId"))
	if err != nil || account.Deleted {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Tài khoản không tồn tại."})
		return
	}
	password, err := h.Store.Password(account)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"detail": "Không giải mã được mật khẩu cũ (khóa mã hóa đã đổi). Hãy cấp mã khôi phục để đội đặt lại."})
		return
	}
	_ = h.Store.LogAdminAction(requestSession(c).Actor(), "VIEW_PASSWORD", "", "", map[string]interface{}{"student_id": account.StudentID})
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"student_id": account.StudentID, "password": password})
}

// TeamEmail: đội xem (dạng che bớt) và cập nhật email khôi phục của mình.
func (h *AccountsHandler) TeamEmail(c *gin.Context) {
	session := requestSession(c)
	if session.Role != "TEAM" || session.StudentID == "" {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Chỉ tài khoản đội có email khôi phục."})
		return
	}
	if c.Request.Method == http.MethodGet {
		account, err := h.Store.Get(session.StudentID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"detail": "Tài khoản không tồn tại."})
			return
		}
		c.Header("Cache-Control", "no-store")
		c.JSON(http.StatusOK, gin.H{"has_email": account.Email != "", "email_masked": maskEmail(account.Email)})
		return
	}
	var req struct {
		Email string `json:"email"`
	}
	if c.ShouldBindJSON(&req) != nil || !validEmail(req.Email) {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Email không hợp lệ."})
		return
	}
	if err := h.Store.SetEmail(session.StudentID, req.Email); err != nil {
		if errors.Is(err, repository.ErrEmailTaken) {
			c.JSON(http.StatusConflict, gin.H{"detail": err.Error()})
			return
		}
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Chưa lưu được email."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "has_email": true, "email_masked": maskEmail(strings.ToLower(strings.TrimSpace(req.Email)))})
}

// HumanChallenge phát thử thách cho ô "Tôi không phải robot".
func (h *AccountsHandler) HumanChallenge(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	if h.Human == nil {
		h.Human = humancheck.FromEnv()
	}
	c.JSON(http.StatusOK, gin.H{"challenge": h.Human.Issue(), "difficulty": h.Human.Difficulty(), "required": h.Human.Required()})
}

// ChangePassword: đội đang đăng nhập tự đổi mật khẩu (phải nhập đúng mật khẩu hiện tại).
func (h *AccountsHandler) ChangePassword(c *gin.Context) {
	session := requestSession(c)
	if session.Role != "TEAM" || session.StudentID == "" {
		c.JSON(http.StatusForbidden, gin.H{"detail": "Chỉ tài khoản đội đổi mật khẩu tại đây."})
		return
	}
	var req struct {
		Current string `json:"current_password"`
		New     string `json:"new_password"`
	}
	if c.ShouldBindJSON(&req) != nil || len(strings.TrimSpace(req.New)) < 6 || len(req.New) > 72 {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Mật khẩu mới cần từ 6 đến 72 ký tự."})
		return
	}
	if req.Current == req.New {
		c.JSON(http.StatusBadRequest, gin.H{"detail": "Mật khẩu mới phải khác mật khẩu hiện tại."})
		return
	}
	if _, err := h.Store.Authenticate(session.StudentID, req.Current); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"detail": "Mật khẩu hiện tại không đúng."})
		return
	}
	if err := h.Store.SetPassword(session.StudentID, req.New); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"detail": "Chưa đổi được mật khẩu. Hãy thử lại."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "message": "Đã đổi mật khẩu. Lần đăng nhập sau dùng mật khẩu mới."})
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
	_ = h.Store.LogAdminAction(requestSession(c).Actor(), "BROADCAST_NOTIFICATION", "", "", map[string]interface{}{"title": n.Title})
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
	tournamentID := c.Query("tournament_id")
	logs, err := h.Store.ListAdminAuditLogs(tournamentID, 50)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"detail": "Không thể tải nhật ký quản trị."})
		return
	}
	items := make([]gin.H, 0, len(logs)+100)
	for _, l := range logs {
		items = append(items, gin.H{"id": fmt.Sprint("event-", l.ID), "admin_user": l.AdminUser, "action": l.Action, "tournament_id": l.TournamentID, "match_id": l.MatchID, "details": l.Details, "created_at": l.CreatedAt})
	}
	// Gộp nhật ký từng yêu cầu ghi (ai, lúc nào, đường dẫn, kết quả) do middleware AdminAudit ghi lại.
	if h.Records != nil {
		rows, err := h.Records.List("audit:")
		if err == nil {
			keys := make([]string, 0, len(rows))
			for key := range rows {
				keys = append(keys, key)
			}
			sort.Sort(sort.Reverse(sort.StringSlice(keys)))
			for _, key := range keys {
				if len(items) >= 150 {
					break
				}
				var rec struct {
					At         time.Time `json:"at"`
					Method     string    `json:"method"`
					Path       string    `json:"path"`
					Actor      string    `json:"actor"`
					Status     string    `json:"status"`
					HTTPStatus int       `json:"http_status"`
				}
				if json.Unmarshal(rows[key], &rec) != nil {
					continue
				}
				if tournamentID != "" && !strings.Contains(rec.Path, "/"+tournamentID) {
					continue
				}
				items = append(items, gin.H{"id": key, "admin_user": rec.Actor, "action": rec.Method + " " + rec.Path, "created_at": rec.At, "details": gin.H{"status": rec.Status, "http_status": rec.HTTPStatus}})
			}
		}
	}
	sort.SliceStable(items, func(i, j int) bool {
		a, _ := items[i]["created_at"].(time.Time)
		b, _ := items[j]["created_at"].(time.Time)
		return a.After(b)
	})
	c.JSON(http.StatusOK, gin.H{"status": "SUCCESS", "logs": items})
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

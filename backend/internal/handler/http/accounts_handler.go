package http

import (
	"errors"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"project-tuan3/internal/repository"
	"project-tuan3/internal/service"
)

type AccountsHandler struct {
	Store   *repository.Accounts
	Service *service.TournamentService
	mu      sync.Mutex
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

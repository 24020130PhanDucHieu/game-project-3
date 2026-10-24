package http

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/gin-gonic/gin"
	"io"
	"net/http"
	"net/url"
	"project-tuan3/internal/qualifier"
	"sort"
	"strconv"
	"strings"
	"time"
)

type QualifierHandler struct {
	Service  *qualifier.Service
	AuditLog func(actor, action string, details map[string]interface{})
}

// Results: lịch sử tính điểm của cả vòng loại (admin): mọi trận đã chấm kèm ELO trước/sau của hai đội.
func (h *QualifierHandler) Results(c *gin.Context) {
	id := c.Param("qid")
	if _, err := h.Service.Event(id); err != nil {
		qualifierError(c, err)
		return
	}
	raw, err := h.Service.Store.List("job:" + id + ":")
	if err != nil {
		qualifierError(c, err)
		return
	}
	people, err := h.Service.ParticipantSummaries(id)
	if err != nil {
		qualifierError(c, err)
		return
	}
	student := strings.ToUpper(strings.TrimSpace(c.Query("student_id")))
	items := []gin.H{}
	for _, value := range raw {
		var job qualifier.Job
		if json.Unmarshal(value, &job) != nil {
			continue
		}
		if student != "" && job.A != student && job.B != student {
			continue
		}
		items = append(items, gin.H{"id": job.ID, "round": job.Round, "status": job.Status, "a": job.A, "b": job.B,
			"a_name": people[job.A].Name, "b_name": people[job.B].Name, "winner": job.Winner, "reason": job.Reason, "error": job.Error,
			"before_a": job.BeforeA, "after_a": job.AfterA, "before_b": job.BeforeB, "after_b": job.AfterB})
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i]["round"].(int) != items[j]["round"].(int) {
			return items[i]["round"].(int) > items[j]["round"].(int)
		}
		return items[i]["id"].(string) < items[j]["id"].(string)
	})
	c.JSON(http.StatusOK, gin.H{"items": items, "total": len(items)})
}

func (h *QualifierHandler) Register(c *gin.Context) {
	session := requestSession(c)
	if session.Role != "TEAM" {
		c.JSON(403, gin.H{"detail": "Chỉ tài khoản đội được đăng ký."})
		return
	}
	if err := h.Service.Register(c.Param("qid"), session.StudentID); err != nil {
		qualifierError(c, err)
		return
	}
	c.JSON(200, gin.H{"status": "SUCCESS"})
}

func qualifierError(c *gin.Context, err error) { c.JSON(400, gin.H{"detail": err.Error()}) }
func (h *QualifierHandler) List(c *gin.Context) {
	items, err := h.Service.Events()
	if err != nil {
		qualifierError(c, err)
		return
	}
	c.JSON(200, items)
}
func (h *QualifierHandler) Configure(c *gin.Context) {
	var req qualifier.Event
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(400, gin.H{"detail": "Cấu hình không hợp lệ."})
		return
	}
	e, err := h.Service.Configure(c.Param("qid"), req)
	if err != nil {
		qualifierError(c, err)
		return
	}
	e.Seed = ""
	c.JSON(200, e)
}
func (h *QualifierHandler) Delete(c *gin.Context) {
	id := c.Param("qid")
	if err := h.Service.DeleteEvent(id); err != nil {
		qualifierError(c, err)
		return
	}
	c.JSON(200, gin.H{"status": "SUCCESS", "message": "Đã xóa vòng loại."})
}
func (h *QualifierHandler) Detail(c *gin.Context) {
	id := c.Param("qid")
	e, err := h.Service.Event(id)
	if err != nil {
		qualifierError(c, err)
		return
	}
	e.Seed = ""
	response := gin.H{"event": e}
	session := requestSession(c)
	sid := session.StudentID
	if session.Role == "ADMIN" {
		sid = c.Query("student_id")
	}
	if sid != "" {
		var participant qualifier.Participant
		err := h.Service.Store.Get("participant:"+id+":"+sid, &participant)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			qualifierError(c, err)
			return
		}
		response["participant"] = participant
		records, err := h.Service.Store.List("submission:" + id + ":" + sid + ":")
		if err != nil {
			qualifierError(c, err)
			return
		}
		history := []qualifier.Submission{}
		for _, raw := range records {
			var sub qualifier.Submission
			if err = json.Unmarshal(raw, &sub); err != nil {
				qualifierError(c, err)
				return
			}
			history = append(history, sub)
		}
		sort.Slice(history, func(i, j int) bool { return history[i].At > history[j].At })
		response["history"] = history
		jobs, err := h.Service.Store.ListMetadata("job:"+id+":", sid)
		if err != nil {
			qualifierError(c, err)
			return
		}
		results := []qualifier.Job{}
		for _, raw := range jobs {
			var job qualifier.Job
			if err = json.Unmarshal(raw, &job); err != nil {
				qualifierError(c, err)
				return
			}
			if job.A == sid || job.B == sid {
				job.Seed = ""
				results = append(results, job)
			}
		}
		sort.Slice(results, func(i, j int) bool { return results[i].Round < results[j].Round })
		response["results"] = results
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(200, response)
}
func (h *QualifierHandler) Submit(c *gin.Context) {
	session := requestSession(c)
	if session.Role != "TEAM" {
		c.JSON(403, gin.H{"detail": "Chỉ tài khoản đội được nộp bài vòng loại."})
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 100000)
	var req struct {
		Code          string `json:"code"`
		Language      string `json:"language"`
		GitRepoURL    string `json:"git_repo_url"`
		GitCommitHash string `json:"git_commit_hash"`
	}
	if c.ShouldBindJSON(&req) != nil {
		c.JSON(400, gin.H{"detail": "Bài nộp không hợp lệ hoặc quá 64 KB."})
		return
	}
	sub, err := h.Service.EnqueueSubmission(c.Param("qid"), session.StudentID, req.Code, req.Language, c.GetHeader("X-Submission-Id"), req.GitRepoURL, req.GitCommitHash)
	if err != nil {
		if errors.Is(err, qualifier.ErrSubmissionBacklog) {
			c.Header("Retry-After", "20")
			c.JSON(429, gin.H{"detail": err.Error()})
			return
		}
		var rejected *qualifier.RejectedSubmission
		if errors.As(err, &rejected) {
			c.JSON(400, gin.H{"detail": rejected.Error()})
		} else {
			c.Header("Retry-After", "15")
			c.JSON(503, gin.H{"detail": "Chưa lưu được bài. Bài trên thiết bị sẽ tự gửi lại; vui lòng giữ bản dự phòng."})
		}
		return
	}
	sub.Code = ""
	c.JSON(http.StatusAccepted, sub)
}

func parseGitHubURL(raw string, defaultBranch, defaultFile string) (owner, repo, branch, filePath string, err error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", "", "", "", errors.New("Vui lòng nhập đường dẫn GitHub Repository.")
	}
	raw = strings.TrimSuffix(raw, "/")
	raw = strings.TrimSuffix(raw, ".git")

	parts := strings.Split(raw, "/")
	if len(parts) == 2 && !strings.Contains(raw, ":") && !strings.Contains(raw, ".") {
		return parts[0], parts[1], defaultBranch, defaultFile, nil
	}

	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		u, err = url.Parse("https://" + raw)
		if err != nil {
			return "", "", "", "", errors.New("Đường dẫn GitHub không hợp lệ.")
		}
	}

	pathSegments := strings.Split(strings.Trim(u.Path, "/"), "/")
	if len(pathSegments) < 2 {
		return "", "", "", "", errors.New("Đường dẫn cần có dạng https://github.com/username/repo-name.")
	}

	owner = pathSegments[0]
	repo = pathSegments[1]
	branch = defaultBranch
	filePath = defaultFile

	if strings.Contains(u.Host, "raw.githubusercontent.com") {
		if len(pathSegments) >= 3 {
			branch = pathSegments[2]
		}
		if len(pathSegments) >= 4 {
			filePath = strings.Join(pathSegments[3:], "/")
		}
	} else if strings.Contains(u.Host, "github.com") {
		if len(pathSegments) >= 4 && (pathSegments[2] == "blob" || pathSegments[2] == "tree") {
			branch = pathSegments[3]
			if len(pathSegments) >= 5 {
				filePath = strings.Join(pathSegments[4:], "/")
			}
		}
	}

	if branch == "" {
		branch = "main"
	}
	if filePath == "" {
		filePath = "bot.py"
	}
	return owner, repo, branch, filePath, nil
}

func (h *QualifierHandler) FetchGitHub(c *gin.Context) {
	var req struct {
		RepoURL  string `json:"repo_url"`
		Branch   string `json:"branch"`
		FilePath string `json:"file_path"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"detail": "Dữ liệu yêu cầu không hợp lệ."})
		return
	}

	defBranch := strings.TrimSpace(req.Branch)
	if defBranch == "" {
		defBranch = "main"
	}
	defFile := strings.TrimSpace(req.FilePath)
	if defFile == "" {
		defFile = "bot.py"
	}

	owner, repo, branch, filePath, err := parseGitHubURL(req.RepoURL, defBranch, defFile)
	if err != nil {
		c.JSON(400, gin.H{"detail": err.Error()})
		return
	}

	client := &http.Client{Timeout: 10 * time.Second}

	fetchRaw := func(b string, f string) ([]byte, int, error) {
		rawURL := fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/%s/%s", owner, repo, b, f)
		httpReq, _ := http.NewRequestWithContext(c.Request.Context(), "GET", rawURL, nil)
		httpReq.Header.Set("User-Agent", "Freshman-Bot-Arena/1.0")
		resp, err := client.Do(httpReq)
		if err != nil {
			return nil, 0, err
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return nil, resp.StatusCode, nil
		}
		body, err := io.ReadAll(io.LimitReader(resp.Body, 65536+1024))
		return body, resp.StatusCode, err
	}

	body, status, err := fetchRaw(branch, filePath)
	actualBranch := branch
	actualFile := filePath

	if (status == 404 || len(body) == 0) && branch == "main" {
		bMaster, sMaster, _ := fetchRaw("master", filePath)
		if sMaster == http.StatusOK && len(bMaster) > 0 {
			body = bMaster
			status = sMaster
			actualBranch = "master"
		}
	}

	if (status == 404 || len(body) == 0) && filePath == "bot.py" {
		bCpp, sCpp, _ := fetchRaw(actualBranch, "bot.cpp")
		if sCpp == http.StatusOK && len(bCpp) > 0 {
			body = bCpp
			status = sCpp
			actualFile = "bot.cpp"
		}
	}

	if err != nil {
		c.JSON(502, gin.H{"detail": "Lỗi kết nối tới GitHub: " + err.Error()})
		return
	}
	if status == 404 || len(body) == 0 {
		c.JSON(404, gin.H{"detail": fmt.Sprintf("Không tìm thấy file %s trong repo %s/%s (nhánh %s). Vui lòng đảm bảo repo ở chế độ Public và đã push code lên.", actualFile, owner, repo, actualBranch)})
		return
	}
	if len(body) > 65536 {
		c.JSON(400, gin.H{"detail": "Mã nguồn vượt quá giới hạn 64 KB."})
		return
	}

	commitSHA := "latest"
	commitMsg := "Bản commit mới nhất"
	authorName := owner
	commitTime := time.Now().Format("15:04:02 02/01/2006")

	commitURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/commits/%s", owner, repo, actualBranch)
	cReq, _ := http.NewRequestWithContext(c.Request.Context(), "GET", commitURL, nil)
	cReq.Header.Set("User-Agent", "Freshman-Bot-Arena/1.0")
	cResp, cErr := client.Do(cReq)
	if cErr == nil && cResp.StatusCode == http.StatusOK {
		defer cResp.Body.Close()
		var cData struct {
			SHA    string `json:"sha"`
			Commit struct {
				Message string `json:"message"`
				Author  struct {
					Name string `json:"name"`
					Date string `json:"date"`
				} `json:"author"`
			} `json:"commit"`
		}
		if json.NewDecoder(cResp.Body).Decode(&cData) == nil && cData.SHA != "" {
			if len(cData.SHA) >= 7 {
				commitSHA = cData.SHA[:7]
			} else {
				commitSHA = cData.SHA
			}
			if cData.Commit.Message != "" {
				lines := strings.Split(cData.Commit.Message, "\n")
				commitMsg = strings.TrimSpace(lines[0])
			}
			if cData.Commit.Author.Name != "" {
				authorName = cData.Commit.Author.Name
			}
			if t, err := time.Parse(time.RFC3339, cData.Commit.Author.Date); err == nil {
				commitTime = t.Local().Format("15:04:02 02/01/2006")
			}
		}
	} else if cResp != nil {
		cResp.Body.Close()
	}

	lang := "PYTHON"
	if strings.HasSuffix(strings.ToLower(actualFile), ".cpp") {
		lang = "CPP"
	}

	c.JSON(http.StatusOK, gin.H{
		"status":         "SUCCESS",
		"code":           string(body),
		"language":       lang,
		"owner":          owner,
		"repo":           repo,
		"branch":         actualBranch,
		"file_path":      actualFile,
		"repo_url":       fmt.Sprintf("https://github.com/%s/%s", owner, repo),
		"commit_sha":     commitSHA,
		"commit_message": commitMsg,
		"author":         authorName,
		"commit_time":    commitTime,
	})
}

func (h *QualifierHandler) Action(c *gin.Context) {
	id := c.Param("qid")
	var err error
	switch c.Param("action") {
	case "reopen":
		var req struct {
			Deadline float64 `json:"deadline"`
			Reason   string  `json:"reason"`
		}
		if c.ShouldBindJSON(&req) != nil {
			c.JSON(400, gin.H{"detail": "Hạn mới hoặc lý do không hợp lệ."})
			return
		}
		err = h.Service.Reopen(id, req.Deadline, req.Reason)
	case "pause":
		err = h.Service.Pause(id)
	case "ban", "unban":
		var req struct {
			StudentID string `json:"student_id"`
			Reason    string `json:"reason"`
		}
		if c.ShouldBindJSON(&req) != nil {
			c.JSON(400, gin.H{"detail": "Thông tin đội không hợp lệ."})
			return
		}
		err = h.Service.SetBanned(id, req.StudentID, c.Param("action") == "ban", req.Reason)
		if err == nil && h.AuditLog != nil {
			h.AuditLog(requestSession(c).Actor(), "QUALIFIER_"+strings.ToUpper(c.Param("action")), map[string]interface{}{"qualifier_id": id, "student_id": strings.ToUpper(req.StudentID), "reason": req.Reason})
		}
	case "test-bots":
		var req struct {
			Count int `json:"count"`
		}
		if c.ShouldBindJSON(&req) != nil {
			c.JSON(400, gin.H{"detail": "Số bot không hợp lệ."})
			return
		}
		err = h.Service.GenerateTestBots(id, req.Count)
	case "freeze":
		err = h.Service.Freeze(id)
	case "start":
		err = h.Service.Start(id)
	case "promote":
		var req struct {
			Target string `json:"tournament_id"`
		}
		if c.ShouldBindJSON(&req) != nil || req.Target == "" {
			c.JSON(400, gin.H{"detail": "Chọn giải chính để chốt đội."})
			return
		}
		err = h.Service.Promote(id, req.Target)
	default:
		c.JSON(404, gin.H{"detail": "Không có thao tác này."})
		return
	}
	if err != nil {
		qualifierError(c, err)
		return
	}
	c.JSON(200, gin.H{"status": "SUCCESS"})
}
func (h *QualifierHandler) Teams(c *gin.Context) {
	id := c.Param("qid")
	if _, err := h.Service.Event(id); err != nil {
		qualifierError(c, err)
		return
	}
	people, err := h.Service.ParticipantSummaries(id)
	if err != nil {
		qualifierError(c, err)
		return
	}
	items := []gin.H{}
	query := strings.ToLower(strings.TrimSpace(c.Query("q")))
	filter := c.Query("filter")
	for _, p := range people {
		status := "NOT_SUBMITTED"
		if p.SubmittedAt > 0 {
			status = "INVALID"
		}
		if p.ValidID != "" {
			status = "VALID"
		}
		if p.Pending > 0 {
			status = "PENDING"
		}
		if p.LockedID != "" {
			status = "LOCKED"
		}
		if p.Banned {
			status = "BANNED"
		}
		if query != "" && !strings.Contains(strings.ToLower(p.SID+" "+p.Name), query) {
			continue
		}
		if filter != "" && filter != status {
			continue
		}
		items = append(items, gin.H{"student_id": p.SID, "team_name": p.Name, "test_bot": p.TestBot, "status": status, "elo": p.Elo, "wins": p.Wins, "played": p.Played, "submitted_at": p.SubmittedAt, "banned": p.Banned, "ban_reason": p.BanReason})
	}
	sort.Slice(items, func(i, j int) bool { return items[i]["student_id"].(string) < items[j]["student_id"].(string) })
	page := qualifierPage(c)
	size := 50
	start := (page - 1) * size
	if start > len(items) {
		start = len(items)
	}
	end := start + size
	if end > len(items) {
		end = len(items)
	}
	c.JSON(200, gin.H{"items": items[start:end], "total": len(items), "page": page, "page_size": size})
}
func qualifierPage(c *gin.Context) int {
	page, _ := strconv.Atoi(c.Query("page"))
	if page < 1 {
		page = 1
	}
	if page > 100000 {
		page = 100000
	}
	return page
}
func (h *QualifierHandler) Ranking(c *gin.Context) {
	people, err := h.Service.Ranked(c.Param("qid"))
	if err != nil {
		qualifierError(c, err)
		return
	}
	items := []gin.H{}
	for index, p := range people {
		items = append(items, gin.H{"rank": index + 1, "student_id": p.SID, "team_name": p.Name, "elo": p.Elo, "wins": p.Wins, "played": p.Played, "byes": p.Byes})
	}
	page := qualifierPage(c)
	size := 50
	start := (page - 1) * size
	if start > len(items) {
		start = len(items)
	}
	end := start + size
	if end > len(items) {
		end = len(items)
	}
	c.JSON(200, gin.H{"items": items[start:end], "total": len(items), "page": page, "page_size": size})
}

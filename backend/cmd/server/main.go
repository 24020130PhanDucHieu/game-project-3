package main

import (
	"context"
	"crypto/sha256"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"project-tuan3/internal/adapter"
	"project-tuan3/internal/ai"
	"project-tuan3/internal/auth"
	"project-tuan3/internal/config"
	httpHandler "project-tuan3/internal/handler/http"
	wsHandler "project-tuan3/internal/handler/websocket"
	"project-tuan3/internal/humancheck"
	"project-tuan3/internal/mailer"
	"project-tuan3/internal/middleware"
	"project-tuan3/internal/observability"
	"project-tuan3/internal/qualifier"
	"project-tuan3/internal/repository"
	"project-tuan3/internal/service"
)

func main() {
	cfg := config.LoadConfig()

	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	// 1. Data Repository & External Adapters (Tự động hỗ trợ PostgreSQL (Supabase compatible) trên Render hoặc JSON cục bộ)
	var tournamentRepo repository.TournamentRepository
	if cfg.DatabaseURL != "" {
		log.Println("[Database] Phát hiện cấu hình DATABASE_URL, đang kết nối PostgreSQL (Supabase compatible)...")
		pgRepo, err := repository.NewPostgresTournamentRepository(cfg.DatabaseURL)
		if err != nil {
			if cfg.Environment == "production" {
				log.Fatalf("Production database is unavailable: %v", err)
			}
			log.Printf("[Database Cảnh Báo] Lỗi kết nối PostgreSQL (%v), tự động chuyển về JSON store", err)
			tournamentRepo = repository.NewJSONTournamentRepository(cfg.DBPath)
		} else {
			log.Println("[Database] Kết nối thành công PostgreSQL (Supabase compatible) Database (Hiệu năng cao + In-memory Cache)!")
			tournamentRepo = pgRepo
		}
	} else {
		if cfg.Environment == "production" {
			log.Fatal("DATABASE_URL is required in production; refusing ephemeral JSON storage")
		}
		log.Println("[Database] Sử dụng JSON repository (Local/Fallback storage)")
		tournamentRepo = repository.NewJSONTournamentRepository(cfg.DBPath)
	}

	botRunnerAdapter := adapter.NewHTTPBotRunnerAdapter(cfg.WorkerURL)

	// 2. Service Layer
	tournamentService := service.NewTournamentService(tournamentRepo, botRunnerAdapter)

	// 3. HTTP Handlers
	tHandler := httpHandler.NewTournamentHandler(tournamentService)
	teamHandler := httpHandler.NewTeamHandler(tournamentService)
	sessions := auth.NewManager()
	mHandler := httpHandler.NewMatchHandler(tournamentService, sessions)
	accounts, err := repository.NewAccounts(tournamentRepo, filepath.Join(filepath.Dir(cfg.DBPath), "accounts_store.json"))
	if err != nil {
		log.Fatalf("Could not initialize accounts: %v", err)
	}
	aHandler := &httpHandler.AccountsHandler{Store: accounts, Service: tournamentService, WorkerReady: botRunnerAdapter.Ready, WorkerMonitor: botRunnerAdapter.Monitor}
	var judges *repository.Judges
	var adminOwner *repository.AdminOwner
	sessions.CheckSession = func(session auth.Session) (bool, error) {
		if session.Role == "ADMIN" {
			// Phiên chủ: phải được cấp sau lần đổi mật khẩu gần nhất của chủ.
			if session.Judge == "" {
				return adminOwner == nil || adminOwner.Valid(session.IssuedAt), nil
			}
			// Phiên giám khảo: tài khoản còn hoạt động và phiên được cấp sau lần đổi mật khẩu/khóa gần nhất.
			if judges == nil {
				return false, nil
			}
			return judges.Valid(session.Judge, session.IssuedAt)
		}
		account, err := accounts.Get(session.StudentID)
		if errors.Is(err, repository.ErrAccountMissing) {
			return false, nil
		}
		if err != nil {
			return false, err
		}
		return !account.Deleted && (account.PasswordChangedAt.IsZero() || session.IssuedAt.After(account.PasswordChangedAt)), nil
	}
	mHandler.Accounts = accounts
	mHandler.AccountSync = aHandler.ImportLegacy
	qualifierStore, err := repository.NewQualifierRecords(tournamentRepo, filepath.Join(filepath.Dir(cfg.DBPath), "qualifier_store"))
	if err != nil {
		log.Fatalf("Could not initialize qualifier storage: %v", err)
	}
	aHandler.DatabaseReady = qualifierStore.Ready
	aHandler.Records = qualifierStore
	aHandler.Mailer = mailer.FromEnv()
	human := humancheck.FromEnv()
	aHandler.Human, mHandler.Human = human, human
	log.Printf("Human check (ô 'Tôi không phải robot'): required=%v, độ khó %d bit", human.Required(), human.Difficulty())
	if !aHandler.Mailer.Configured() {
		log.Println("[Mailer] Chưa cấu hình SMTP_USER/SMTP_PASSWORD — khôi phục mật khẩu qua email bị tắt")
	}
	judges = repository.NewJudges(qualifierStore)
	mHandler.Judges = judges
	jHandler := &httpHandler.JudgesHandler{Judges: judges}
	adminOwner = repository.NewAdminOwner(qualifierStore)
	mHandler.Owner = adminOwner
	// Khóa HMAC cho mã xác thực email: bí mật của máy chủ (khác khóa phiên một tiền tố).
	otpSecret := os.Getenv("SESSION_SECRET")
	if otpSecret == "" {
		otpSecret = os.Getenv("ADMIN_PASSWORD")
	}
	otpKey := sha256.Sum256([]byte("arena-admin-otp-v1:" + otpSecret))
	pwHandler := &httpHandler.AdminPasswordHandler{
		Owner: adminOwner, Judges: judges, Mailer: aHandler.Mailer, Human: human, Sessions: sessions,
		OTP:        &httpHandler.OTPService{Store: qualifierStore, Key: otpKey[:]},
		Locked:     mHandler.AdminLockedFor,
		Result:     mHandler.AdminResultFor,
		AdminEmail: httpHandler.AdminEmailFromEnv,
		Audit: func(actor, action string, details map[string]interface{}) {
			_ = accounts.LogAdminAction(actor, action, "", "", details)
		},
	}
	clarHandler := &httpHandler.ClarificationHandler{Store: qualifierStore, Accounts: accounts}
	scrimHandler := &httpHandler.ScrimmageHandler{Store: qualifierStore, Engine: tournamentService}
	chalHandler := &httpHandler.ChallengeHandler{Store: qualifierStore, Accounts: accounts, Engine: tournamentService}
	aHandler.QueueCounts = qualifierStore.QueueCounts
	aHandler.DatabaseStats = qualifierStore.DatabaseStats
	aHandler.DatabaseOptimize = qualifierStore.OptimizeDatabase
	lostLease, err := qualifierStore.GatewayLease()
	if err != nil {
		log.Fatalf("Cannot acquire gateway writer lease: %v", err)
	}
	go func() { log.Fatalf("Stopping gateway: %v", <-lostLease) }()
	if err := aHandler.ImportLegacy(); err != nil {
		log.Fatalf("Could not import team accounts: %v", err)
	}
	snapHandler := &httpHandler.SnapshotHandler{Service: tournamentService, Dir: httpHandler.SnapshotDir()}
	go func() {
		for {
			snapHandler.Cleanup()
			time.Sleep(6 * time.Hour)
		}
	}()
	if err := tournamentService.RecoverInterruptedRounds(); err != nil {
		log.Fatalf("Could not recover interrupted rounds: %v", err)
	}
	qualifierService := qualifier.New(qualifierStore, accounts, tournamentService, botRunnerAdapter)
	aHandler.Qualifiers = qualifierService
	qHandler := &httpHandler.QualifierHandler{Service: qualifierService, AuditLog: func(actor, action string, details map[string]interface{}) {
		_ = accounts.LogAdminAction(actor, action, "", "", details)
	}}
	simHandler := &httpHandler.SimilarityHandler{Store: qualifierStore, Qualifiers: qualifierService, Tournaments: tournamentService}
	if err := qualifierService.Recover(); err != nil {
		log.Fatalf("Could not recover qualifiers: %v", err)
	}

	// 4. WebSocket Hub for Live Stream
	wsHub := wsHandler.NewHub()
	go wsHub.Run()
	certHandler := &httpHandler.CertificateHandler{Service: tournamentService, Accounts: accounts, Store: qualifierStore}
	// Giải AI: báo cáo kỹ thuật, Giải Kỹ thuật, huy hiệu riêng.
	aiReports := &httpHandler.AIReportHandler{Service: tournamentService, Store: qualifierStore, Accounts: accounts,
		AuditLog: func(actor, action string, details map[string]interface{}) {
			_ = accounts.LogAdminAction(actor, action, "", "", details)
		}}
	aiReports.OnPublish = func(tid string) {
		go func() {
			aiReports.NotifyPublished(tid)
			if _, err := certHandler.Issue(tid); err != nil {
				log.Printf("[AICup] issue certificates %s: %v", tid, err)
			}
		}()
	}
	certHandler.TechWinner = aiReports.TechWinner
	aiCup := &httpHandler.AICupHandler{Service: qualifierService, Tournaments: tournamentService, Tech: aiReports.TechWinner}
	aiBank := &httpHandler.AIBankHandler{Store: qualifierStore, Engine: botRunnerAdapter}
	qualifierService.Bank = aiBank
	aiMainTasks := &httpHandler.AIMainTaskHandler{Service: tournamentService, Bank: aiBank}
	// Trợ lý hỏi đáp luật bằng AI: chỉ trả lời từ tài liệu luật, cấu hình giải trong database và hỏi đáp công khai của BTC.
	aiKB, err := ai.LoadKB()
	if err != nil {
		log.Fatalf("Could not load AI knowledge base: %v", err)
	}
	// Nhà cung cấp AI: AI_PROVIDER=gemini|claude; bỏ trống thì dùng bên nào có khóa (ưu tiên Gemini).
	aiProvider := strings.ToLower(os.Getenv("AI_PROVIDER"))
	if aiProvider == "" {
		if os.Getenv("GEMINI_API_KEY") != "" {
			aiProvider = "gemini"
		} else {
			aiProvider = "claude"
		}
	}
	var aiClient ai.Completer
	var aiKey, aiModel string
	aiMaxTokens := 700
	if aiProvider == "gemini" {
		aiKey = os.Getenv("GEMINI_API_KEY")
		aiModel = os.Getenv("AI_MODEL")
		if aiModel == "" {
			aiModel = "gemini-3.5-flash-lite"
		}
		aiClient = ai.NewGeminiClient(os.Getenv("GEMINI_BASE_URL"), aiKey)
		aiMaxTokens = 1200 // mô hình Gemini tính cả token "suy nghĩ" vào giới hạn đầu ra
	} else {
		aiKey = os.Getenv("ANTHROPIC_API_KEY")
		aiModel = os.Getenv("AI_MODEL")
		if aiModel == "" {
			aiModel = "claude-haiku-5-5"
		}
		aiClient = ai.NewClient(os.Getenv("ANTHROPIC_BASE_URL"), aiKey)
	}
	aiDefaults := ai.DefaultSettings()
	if n, convErr := strconv.Atoi(os.Getenv("AI_DAILY_PER_TEAM")); convErr == nil && n > 0 {
		aiDefaults.PerTeam = n
	}
	if n, convErr := strconv.Atoi(os.Getenv("AI_DAILY_BUDGET")); convErr == nil && n > 0 {
		aiDefaults.DailyTokens = n
	}
	aiHandler := &httpHandler.AIHandler{
		KB:        aiKB,
		Quota:     &ai.Manager{Store: qualifierStore, Defaults: aiDefaults},
		Available: aiKey != "" && os.Getenv("AI_ENABLED") != "0",
		Audit: func(actor, action string, details map[string]interface{}) {
			_ = accounts.LogAdminAction(actor, action, "", "", details)
		},
	}
	aiHandler.Agent = &ai.Agent{
		C:         aiClient,
		Model:     aiModel,
		MaxTurns:  5,
		MaxTokens: aiMaxTokens,
		Tools:     &ai.Toolbox{KB: aiKB, Data: httpHandler.NewAIData(tournamentService, clarHandler), Now: time.Now},
	}
	tournamentService.OnRoundEvent = func(tournamentID, matchID, eventType string) {
		httpHandler.InvalidateDerived()
		wsHub.BroadcastTournamentJSON(tournamentID, matchID, gin.H{"type": eventType, "tournament_id": tournamentID, "match_id": matchID, "action": "play-round"})
		certHandler.IssueAsync(tournamentID)
	}
	tournamentService.OnDeleted = func(id string) {
		if err := qualifierService.ReleaseTarget(id); err != nil {
			log.Printf("[Cleanup] Không gỡ được liên kết vòng loại với giải %s: %v", id, err)
		}
		if err := qualifierStore.DeletePrefixes("aireport:"+id+":", "aiscore:"+id+":", "aireportcfg:"+id, "certcfg:"+id, "chat:"+id+"/"); err != nil {
			log.Printf("[Cleanup] Không dọn được dữ liệu của giải %s: %v", id, err)
		}
	}
	// Chấm vòng loại xong, đội nộp bài, đổi trạng thái...: báo cho mọi máy đang mở trang để tự tải lại.
	qualifierService.OnUpdate = func(string) { wsHub.BroadcastGlobal("q") }
	tournamentService.StartRoundTransitions(func(tournamentID, matchID string) {
		httpHandler.InvalidateDerived()
		wsHub.BroadcastTournamentJSON(tournamentID, matchID, gin.H{"type": "TOURNAMENT_UPDATED", "tournament_id": tournamentID, "match_id": matchID, "action": "next-round"})
		certHandler.IssueAsync(tournamentID)
	})

	// 5. Gin HTTP Engine
	r := gin.New()
	// Chỉ tin X-Forwarded-For từ Caddy chạy cùng máy; IP thật dùng cho nhật ký và giới hạn tần suất.
	if err := r.SetTrustedProxies([]string{"127.0.0.1", "::1"}); err != nil {
		log.Fatalf("trusted proxies: %v", err)
	}
	r.Use(middleware.RecoveryMiddleware())
	r.Use(middleware.LoggerMiddleware())
	r.Use(middleware.RequestBounds())
	r.Use(optionalSession(sessions))
	r.Use(middleware.CORSMiddleware(cfg.CORSOrigin))
	r.Use(middleware.RateLimitMiddleware())
	r.Use(middleware.SubmissionGate(qualifierStore, 2))
	r.Use(middleware.AdminAudit(qualifierStore))
	r.Use(func(c *gin.Context) {
		c.Next()
		if c.Request.Method == http.MethodGet || c.Writer.Status() >= http.StatusBadRequest {
			return
		}
		httpHandler.InvalidateDerived()
		parts := strings.Split(strings.Trim(c.Request.URL.Path, "/"), "/")
		if c.Request.URL.Path == "/api/teams/register" || strings.HasPrefix(c.Request.URL.Path, "/api/admin/accounts") {
			id := c.GetString("eventTournamentID")
			if id != "" {
				wsHub.BroadcastTournamentJSON(id, "", gin.H{"type": "TOURNAMENT_UPDATED", "tournament_id": id, "action": "add-team"})
			}
		}
		if c.Request.URL.Path == "/api/tournament/rule/set" {
			wsHub.BroadcastTournamentJSON(c.Query("tournament_id"), "", gin.H{"type": "TOURNAMENT_UPDATED", "tournament_id": c.Query("tournament_id"), "action": "set-rule"})
		}
		if scope := globalScope(c.Request.URL.Path); scope != "" {
			wsHub.BroadcastGlobal(scope)
		} else if c.Request.Method == http.MethodDelete && len(parts) == 3 && parts[0] == "api" && parts[1] == "tournaments" {
			wsHub.BroadcastGlobal("tl")
		}
		if len(parts) >= 3 && parts[0] == "api" && parts[1] == "tournaments" {
			tournamentID := c.Param("id")
			if tournamentID == "" {
				tournamentID = c.GetString("eventTournamentID")
			}
			wsHub.BroadcastTournamentJSON(tournamentID, c.Param("matchId"), gin.H{
				"type": "TOURNAMENT_UPDATED", "tournament_id": tournamentID, "match_id": c.Param("matchId"), "action": parts[len(parts)-1],
			})
		}
	})

	// Serve organized frontend templates and their static assets.
	if !httpHandler.RegisterFrontendRoutes(r) {
		r.GET("/", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"service": "OTTV2 Freshman AI Arena Backend API", "status": "RUNNING"})
		})
	}
	r.GET("/health", observability.HealthHandler)
	r.GET("/ready", observability.ReadinessHandler(map[string]observability.ReadinessCheck{
		"database": qualifierStore.Ready,
		"workers":  botRunnerAdapter.Ready,
	}))
	r.GET("/metrics", observability.MetricsHandler)

	// WebSocket Endpoint
	r.GET("/ws/matches/:matchId", func(c *gin.Context) {
		wsHandler.ServeWS(wsHub, c, cfg.CORSOrigin)
	})
	r.GET("/ws/tournaments/:id", func(c *gin.Context) {
		wsHandler.ServeWS(wsHub, c, cfg.CORSOrigin)
	})
	// Tín hiệu WebRTC cho webcam trong phòng trận: cần phiên (token trong ?token=); đội chỉ vào đúng trận của mình.
	rtcHub := wsHandler.NewRTCHub()
	r.GET("/ws/rtc/:id/:matchId", requireSession(sessions, false, true), func(c *gin.Context) {
		rtcHub.Serve(c, cfg.CORSOrigin)
	})
	// Chat trong trận: đội của trận + ban tổ chức; lịch sử lưu trong kho bản ghi.
	chatHub := wsHandler.NewChatHub(qualifierStore)
	r.GET("/ws/chat/:id/:matchId", requireSession(sessions, false, true), func(c *gin.Context) {
		chatHub.Serve(c, cfg.CORSOrigin)
	})

	// API Routes Group
	api := r.Group("/api")
	{
		api.GET("/capabilities", func(c *gin.Context) {
			languages := []string{"PYTHON"}
			_, wasiErr := os.Stat("/opt/wasi-sdk/bin/clang++")
			if cfg.Environment != "production" || wasiErr == nil {
				languages = append(languages, "CPP")
			}
			c.JSON(http.StatusOK, gin.H{"languages": languages})
		})
		adminOnly := requireSession(sessions, true, false)
		api.POST("/teams/register", aHandler.Register)
		api.GET("/admin/accounts", adminOnly, aHandler.List)
		api.POST("/admin/accounts/import", adminOnly, aHandler.ImportAccounts)
		api.GET("/admin/accounts/:studentId/password", adminOnly, aHandler.ViewPassword)
		api.GET("/teams/email", requireSession(sessions, false, false), aHandler.TeamEmail)
		api.PUT("/teams/email", requireSession(sessions, false, false), aHandler.TeamEmail)
		api.DELETE("/admin/accounts/:studentId", adminOnly, aHandler.Delete)
		api.POST("/admin/accounts/:studentId/enroll", adminOnly, aHandler.Enroll)
		api.GET("/admin/accounts/enrollments", adminOnly, aHandler.Enrollments)
		api.GET("/admin/monitoring", adminOnly, aHandler.Monitoring)
		api.POST("/admin/database/optimize", adminOnly, aHandler.OptimizeDatabase)
		api.GET("/admin/judges", adminOnly, jHandler.List)
		api.POST("/admin/judges", adminOnly, jHandler.Create)
		api.PUT("/admin/judges/:username/email", adminOnly, jHandler.SetEmail)
		api.POST("/admin/judges/:username/:action", adminOnly, jHandler.Action)
		// Đổi / đặt lại mật khẩu quản trị: mật khẩu hiện tại + mã email (xem admin_password_handler.go)
		api.POST("/admin/password/request", adminOnly, pwHandler.Request)
		api.POST("/admin/password/change", adminOnly, pwHandler.Change)
		api.POST("/admin/password/forgot", pwHandler.Forgot)
		api.POST("/admin/password/reset", pwHandler.Reset)
		api.GET("/clarifications", optionalSession(sessions), clarHandler.List)
		api.POST("/ai/ask", requireSession(sessions, false, false), aiHandler.Ask)
		api.GET("/ai/usage", requireSession(sessions, false, false), aiHandler.Usage)
		api.GET("/ai/settings", adminOnly, aiHandler.Settings)
		api.PUT("/ai/settings", adminOnly, aiHandler.SaveSettings)
		api.GET("/ai/log", adminOnly, aiHandler.Log)
		api.POST("/clarifications", requireSession(sessions, false, false), clarHandler.Ask)
		api.POST("/admin/clarifications/:clarId/answer", adminOnly, clarHandler.Answer)
		api.GET("/scrimmages", requireSession(sessions, false, false), scrimHandler.List)
		api.POST("/scrimmages", requireSession(sessions, false, false), scrimHandler.Create)
		api.PUT("/scrimmages/settings", requireSession(sessions, false, false), scrimHandler.Settings)
		api.GET("/scrimmages/:scrimId", requireSession(sessions, false, false), scrimHandler.Replay)
		api.GET("/challenges", optionalSession(sessions), chalHandler.List)
		api.POST("/challenges/:challengeId/attempt", requireSession(sessions, false, false), chalHandler.Attempt)
		api.GET("/badges/:studentId", chalHandler.Badges)
		api.GET("/admin/similarity", adminOnly, simHandler.Report)
		api.GET("/admin/similarity/pair", adminOnly, simHandler.Pair)
		api.POST("/admin/similarity/review", adminOnly, simHandler.Review)
		matchSession := requireSession(sessions, false, true)
		matchAdmin := requireSession(sessions, true, true)
		// Giải AI: đề bài, dữ liệu mẫu, bảng điểm công khai/riêng tư, khai báo kỹ thuật (đăng ký/nộp/chạy dùng route /qualifiers)
		api.GET("/ai-badges/:sid", aiCup.Badges)
		api.GET("/ai-main/:tid/tasks", adminOnly, aiMainTasks.Tasks)
		api.POST("/ai-main/:tid/tasks/roll", adminOnly, aiMainTasks.Roll)
		api.POST("/ai-main/:tid/tasks/lock", adminOnly, aiMainTasks.Lock)
		api.POST("/ai-main/:tid/tasks/unlock", adminOnly, aiMainTasks.Unlock)
		api.GET("/ai-main/:tid/matches/:mid/task", requireSession(sessions, false, false), aiMainTasks.MatchTask)
		api.GET("/ai-main/:tid/report", optionalSession(sessions), aiReports.Mine)
		api.PUT("/ai-main/:tid/report", requireSession(sessions, false, false), aiReports.Save)
		api.GET("/ai-main/:tid/scoreboard", aiReports.Scoreboard)
		api.GET("/ai-main/:tid/reports", adminOnly, aiReports.AdminList)
		api.PUT("/ai-main/:tid/reports/:sid/score", adminOnly, aiReports.Score)
		api.PUT("/ai-main/:tid/report-config", adminOnly, aiReports.Config)
		api.GET("/ai-bank", adminOnly, aiBank.List)
		api.POST("/ai-bank", adminOnly, aiBank.Create)
		api.POST("/ai-bank/probe", adminOnly, aiBank.Probe)
		api.PUT("/ai-bank/:id", adminOnly, aiBank.Update)
		api.DELETE("/ai-bank/:id", adminOnly, aiBank.Delete)
		api.GET("/ai-cup/:qid/tasks", optionalSession(sessions), aiCup.Tasks)
		api.GET("/ai-cup/:qid/tasks/:n/data", aiCup.TaskData)
		api.POST("/ai-cup/:qid/tasks/roll", adminOnly, aiCup.RollTasks)
		api.POST("/ai-cup/:qid/tasks/lock", adminOnly, aiCup.LockTasks)
		api.POST("/ai-cup/:qid/tasks/unlock", adminOnly, aiCup.UnlockTasks)
		api.GET("/ai-cup/events", aiCup.Events)
		api.GET("/ai-cup/:qid/problem", aiCup.Problem)
		api.GET("/ai-cup/:qid/dataset", aiCup.Dataset)
		api.GET("/ai-cup/:qid/leaderboard", optionalSession(sessions), aiCup.Leaderboard)
		api.GET("/ai-cup/:qid/mine", requireSession(sessions, false, false), aiCup.Mine)
		api.PUT("/ai-cup/:qid/model-card", requireSession(sessions, false, false), aiCup.ModelCard)
		api.GET("/qualifiers", qHandler.List)
		api.POST("/qualifiers", adminOnly, qHandler.Configure)
		api.GET("/qualifiers/:qid", qHandler.Detail)
		api.PUT("/qualifiers/:qid", adminOnly, qHandler.Configure)
		api.GET("/qualifiers/:qid/teams", adminOnly, qHandler.Teams)
		api.GET("/qualifiers/:qid/ranking", qHandler.Ranking)
		api.GET("/qualifiers/:qid/results", adminOnly, qHandler.Results)
		api.POST("/qualifiers/:qid/register", requireSession(sessions, false, false), qHandler.Register)
		api.POST("/qualifiers/:qid/submissions", requireSession(sessions, false, false), qHandler.Submit)
		api.POST("/qualifiers/:qid/actions/:action", adminOnly, qHandler.Action)
		api.DELETE("/qualifiers/:qid", adminOnly, qHandler.Delete)
		api.POST("/github/fetch", requireSession(sessions, false, false), qHandler.FetchGitHub)
		// Tournaments
		api.GET("/tournaments", tHandler.GetAll)
		api.GET("/tournaments/list", tHandler.GetList)
		api.GET("/tournaments/:id", optionalSession(sessions), tHandler.GetByID)
		api.POST("/tournaments/create", adminOnly, tHandler.Create)
		api.DELETE("/tournaments/:id", adminOnly, tHandler.Delete)
		api.POST("/tournaments/:id/auto-schedule", adminOnly, tHandler.AutoSchedule)
		api.PUT("/tournaments/:id/stage-schedule", adminOnly, tHandler.SetStageSchedule)
		api.PUT("/tournaments/:id/stage-rules", adminOnly, tHandler.SetStageRules)

		// Teams
		api.GET("/tournaments/:id/teams", optionalSession(sessions), teamHandler.GetTeams)
		api.POST("/tournaments/:id/teams", adminOnly, teamHandler.AddTeam)
		api.DELETE("/tournaments/:id/teams/:studentId", adminOnly, teamHandler.RemoveTeam)
		api.POST("/tournaments/:id/teams/quick-fill", adminOnly, teamHandler.QuickFill)

		// Matches & Submission Studio
		api.POST("/admin/login", mHandler.AdminLogin)
		api.GET("/session", optionalSession(sessions), mHandler.CurrentSession)
		api.POST("/logout", mHandler.Logout)
		api.POST("/bots/validate", requireSession(sessions, false, false), mHandler.ValidateCode)
		api.POST("/teams/login", mHandler.TeamLogin)
		api.GET("/auth/human-challenge", aHandler.HumanChallenge)
		api.POST("/tournaments/:id/matches/:matchId/login", mHandler.Login)
		api.POST("/tournaments/:id/matches/:matchId/select", optionalSession(sessions), mHandler.SelectTeamMatch)
		api.POST("/tournaments/:id/matches/:matchId/auth", mHandler.Auth)
		api.POST("/tournaments/:id/matches/:matchId/draft-code", matchSession, mHandler.SubmitDraftCode)
		api.POST("/tournaments/:id/matches/:matchId/code", matchSession, mHandler.SubmitCode)
		api.POST("/tournaments/:id/matches/:matchId/snapshots", matchSession, snapHandler.Upload)
		api.GET("/tournaments/:id/matches/:matchId/snapshots", snapHandler.List)
		api.GET("/tournaments/:id/matches/:matchId/snapshots/file", snapHandler.File)
		api.POST("/tournaments/:id/matches/:matchId/clips", matchSession, snapHandler.UploadClip)
		api.GET("/tournaments/:id/matches/:matchId/clips", snapHandler.ListClips)
		api.GET("/tournaments/:id/matches/:matchId/clips/file", snapHandler.ClipFile)
		api.POST("/tournaments/:id/matches/:matchId/play-round", matchAdmin, mHandler.PlayRound)
		api.POST("/tournaments/:id/matches/:matchId/next-round", matchAdmin, mHandler.NextRound)
		api.POST("/tournaments/:id/matches/:matchId/demo-fill", matchAdmin, mHandler.DemoFill)
		api.POST("/tournaments/:id/matches/:matchId/reset", matchAdmin, mHandler.Reset)
		api.POST("/tournaments/:id/matches/:matchId/correction", matchAdmin, tHandler.CorrectMatch, func(c *gin.Context) {
			// sửa kết quả có thể chốt chung kết: cấp giấy chứng nhận như khi đánh xong
			if c.Writer.Status() == http.StatusOK {
				certHandler.IssueAsync(c.Param("id"))
			}
		})
		api.GET("/tournaments/:id/matches/:matchId/submissions", matchSession, mHandler.GetSubmissions)
		api.GET("/tournaments/:id/matches/:matchId/replay/:roundNumber", mHandler.GetRoundReplay)
		api.POST("/tournaments/:id/practice-match", requireSession(sessions, false, false), mHandler.PracticeMatch)
		api.POST("/bots/practice", requireSession(sessions, false, false), mHandler.PracticeMatch)

		// Global Match History, Ranking & Rules
		api.GET("/time", aHandler.GetServerTime)
		api.POST("/accounts/forgot-password", aHandler.ForgotPassword)
		api.POST("/accounts/reset-password", aHandler.ResetPassword)
		api.POST("/teams/password", requireSession(sessions, false, false), aHandler.ChangePassword)
		api.GET("/notifications", optionalSession(sessions), aHandler.GetNotifications)
		api.GET("/certificates", requireSession(sessions, false, false), certHandler.List)
		api.PUT("/tournaments/:id/certificates", adminOnly, certHandler.Save)
		api.POST("/notifications/read", optionalSession(sessions), aHandler.ReadNotification)
		api.POST("/admin/notifications", adminOnly, aHandler.AdminBroadcastNotification)
		api.GET("/admin/audit-logs", adminOnly, aHandler.ListAdminAuditLogs)
		api.GET("/teams/profile", optionalSession(sessions), aHandler.GetTeamProfile)
		api.PUT("/teams/profile", requireSession(sessions, false, false), aHandler.UpdateTeamProfile)
		api.POST("/tournaments/:id/swap-bracket", adminOnly, tHandler.SwapBracket)
		api.POST("/tournaments/:id/disqualify-team", adminOnly, tHandler.DisqualifyTeam)
		api.GET("/matches/history", mHandler.GetMatchHistory)
		api.GET("/ranking", tHandler.GetRanking)
		api.GET("/ranking/elo-history", tHandler.GetEloHistory)
		api.GET("/tournament/rule", tHandler.GetRule)
		api.POST("/tournament/rule/set", adminOnly, tHandler.SetRule)
	}

	r.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{"detail": "Not found"})
	})

	log.Printf("=====================================================")
	log.Printf("  OTTV2 Freshman AI Arena Backend (Go Standard Layout)")
	listenAddress := net.JoinHostPort(os.Getenv("HOST"), cfg.Port)
	log.Printf("  Server listening on %s", listenAddress)
	log.Printf("  Game Engine Worker Target: %s", cfg.WorkerURL)
	log.Printf("  Database Storage: %s", cfg.DBPath)
	log.Printf("=====================================================")

	var listener net.Listener
	var listenErr error
	deadline := time.Now().Add(15 * time.Second)
	for {
		listener, listenErr = net.Listen("tcp", listenAddress)
		if listenErr == nil {
			break
		}
		if !strings.Contains(listenErr.Error(), "already in use") || time.Now().After(deadline) {
			log.Fatalf("Server failed to start: %v", listenErr)
		}
		log.Printf("Port %s is busy (address already in use), retrying in 250ms...", listenAddress)
		time.Sleep(250 * time.Millisecond)
	}

	srv := &http.Server{
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-quit
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
		qualifierStore.ReleaseGatewayLease()
		_ = listener.Close()
	}()

	if err := srv.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("Server exited with error: %v", err)
	}
}

func optionalSession(manager *auth.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := strings.TrimSpace(strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer "))
		if token == "" {
			token = c.Query("token")
		}
		if _, exists := c.Get("session"); exists {
			c.Next()
			return
		}
		session, ok, err := manager.GetChecked(token)
		if err != nil {
			c.AbortWithStatusJSON(503, gin.H{"code": "DATABASE_UNAVAILABLE", "detail": "Session verification temporarily unavailable"})
			return
		}
		if ok {
			c.Set("session", session)
		}
		c.Next()
	}
}

func requireSession(manager *auth.Manager, adminOnly, matchScoped bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := strings.TrimSpace(strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer "))
		if token == "" {
			token = c.Query("token")
		}
		value, exists := c.Get("session")
		session, ok := value.(auth.Session)
		if !exists || !ok {
			var err error
			session, ok, err = manager.GetChecked(token)
			if err != nil {
				c.AbortWithStatusJSON(503, gin.H{"code": "DATABASE_UNAVAILABLE", "detail": "Session verification temporarily unavailable"})
				return
			}
		}
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"detail": "A valid tournament session is required"})
			return
		}
		if adminOnly && session.Role != "ADMIN" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"detail": "Bạn không có quyền quản trị viên."})
			return
		}
		if session.Role != "ADMIN" && c.Param("id") != "" && session.TournamentID != c.Param("id") {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"detail": "This session cannot access the requested tournament"})
			return
		}
		if matchScoped && session.Role != "ADMIN" && session.MatchID != c.Param("matchId") {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"detail": "This session cannot access the requested match"})
			return
		}
		c.Set("session", session)
		c.Next()
	}
}

// globalScope cho biết một thao tác ghi thuộc khu vực dữ liệu nào để phát tín hiệu tải lại trên phòng chung.
// Trả "" khi không cần (đã có tin riêng của giải, hoặc không ảnh hưởng người khác).
func globalScope(path string) string {
	for _, rule := range []struct{ prefix, scope string }{
		{"/api/qualifiers", "q"}, {"/api/ai-cup", "q"}, {"/api/ai-main", "t:"}, {"/api/ai-bank", "ai:"},
		{"/api/clarifications", "clar:"}, {"/api/admin/clarifications", "clar:"},
		{"/api/admin/notifications", "nt:"}, {"/api/notifications", "nt:"},
		{"/api/scrimmages", "scrim:"}, {"/api/challenges", "chal:"}, {"/api/admin/accounts", "admin:"},
		{"/api/teams", "profile:"}, {"/api/tournaments/create", "tl"}, {"/api/ai-assistant", ""},
	} {
		if strings.HasPrefix(path, rule.prefix) {
			return rule.scope
		}
	}
	return ""
}

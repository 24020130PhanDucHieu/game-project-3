package main

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"project-tuan3/internal/adapter"
	"project-tuan3/internal/auth"
	"project-tuan3/internal/config"
	httpHandler "project-tuan3/internal/handler/http"
	wsHandler "project-tuan3/internal/handler/websocket"
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
	mHandler.Accounts = accounts
	mHandler.AccountSync = aHandler.ImportLegacy
	sessions.CheckStudent = func(id string) (bool, error) {
		a, err := accounts.Get(id)
		if errors.Is(err, repository.ErrAccountMissing) {
			return false, nil
		}
		return err == nil && !a.Deleted, err
	}
	qualifierStore, err := repository.NewQualifierRecords(tournamentRepo, filepath.Join(filepath.Dir(cfg.DBPath), "qualifier_store"))
	if err != nil {
		log.Fatalf("Could not initialize qualifier storage: %v", err)
	}
	aHandler.DatabaseReady = qualifierStore.Ready
	aHandler.QueueCounts = qualifierStore.QueueCounts
	lostLease, err := qualifierStore.GatewayLease()
	if err != nil {
		log.Fatalf("Cannot acquire gateway writer lease: %v", err)
	}
	go func() { log.Fatalf("Stopping gateway: %v", <-lostLease) }()
	if err := aHandler.ImportLegacy(); err != nil {
		log.Fatalf("Could not import team accounts: %v", err)
	}
	if err := tournamentService.RecoverInterruptedRounds(); err != nil {
		log.Fatalf("Could not recover interrupted rounds: %v", err)
	}
	qualifierService := qualifier.New(qualifierStore, accounts, tournamentService, botRunnerAdapter)
	qHandler := &httpHandler.QualifierHandler{Service: qualifierService}
	if err := qualifierService.Recover(); err != nil {
		log.Fatalf("Could not recover qualifiers: %v", err)
	}

	// 4. WebSocket Hub for Live Stream
	wsHub := wsHandler.NewHub()
	go wsHub.Run()
	tournamentService.OnRoundEvent = func(tournamentID, matchID, eventType string) {
		wsHub.BroadcastTournamentJSON(tournamentID, matchID, gin.H{"type": eventType, "tournament_id": tournamentID, "match_id": matchID, "action": "play-round"})
	}
	tournamentService.StartRoundTransitions(func(tournamentID, matchID string) {
		wsHub.BroadcastTournamentJSON(tournamentID, matchID, gin.H{"type": "TOURNAMENT_UPDATED", "tournament_id": tournamentID, "match_id": matchID, "action": "next-round"})
	})

	// 5. Gin HTTP Engine
	r := gin.New()
	r.Use(middleware.RecoveryMiddleware())
	r.Use(middleware.LoggerMiddleware())
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
		api.DELETE("/admin/accounts/:studentId", adminOnly, aHandler.Delete)
		api.POST("/admin/accounts/:studentId/enroll", adminOnly, aHandler.Enroll)
		api.GET("/admin/monitoring", adminOnly, aHandler.Monitoring)
		matchSession := requireSession(sessions, false, true)
		matchAdmin := requireSession(sessions, true, true)
		api.GET("/qualifiers", qHandler.List)
		api.POST("/qualifiers", adminOnly, qHandler.Configure)
		api.GET("/qualifiers/:qid", qHandler.Detail)
		api.PUT("/qualifiers/:qid", adminOnly, qHandler.Configure)
		api.GET("/qualifiers/:qid/teams", adminOnly, qHandler.Teams)
		api.GET("/qualifiers/:qid/ranking", qHandler.Ranking)
		api.POST("/qualifiers/:qid/register", requireSession(sessions, false, false), qHandler.Register)
		api.POST("/qualifiers/:qid/submissions", requireSession(sessions, false, false), qHandler.Submit)
		api.POST("/qualifiers/:qid/actions/:action", adminOnly, qHandler.Action)
		api.DELETE("/qualifiers/:qid", adminOnly, qHandler.Delete)
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
		api.POST("/tournaments/:id/matches/:matchId/login", mHandler.Login)
		api.POST("/tournaments/:id/matches/:matchId/select", optionalSession(sessions), mHandler.SelectTeamMatch)
		api.POST("/tournaments/:id/matches/:matchId/auth", mHandler.Auth)
		api.POST("/tournaments/:id/matches/:matchId/draft-code", matchSession, mHandler.SubmitDraftCode)
		api.POST("/tournaments/:id/matches/:matchId/code", matchSession, mHandler.SubmitCode)
		api.POST("/tournaments/:id/matches/:matchId/play-round", matchAdmin, mHandler.PlayRound)
		api.POST("/tournaments/:id/matches/:matchId/next-round", matchAdmin, mHandler.NextRound)
		api.POST("/tournaments/:id/matches/:matchId/demo-fill", matchAdmin, mHandler.DemoFill)
		api.POST("/tournaments/:id/matches/:matchId/reset", matchAdmin, mHandler.Reset)
		api.GET("/tournaments/:id/matches/:matchId/submissions", matchSession, mHandler.GetSubmissions)
		api.GET("/tournaments/:id/matches/:matchId/replay/:roundNumber", mHandler.GetRoundReplay)
		api.POST("/tournaments/:id/practice-match", requireSession(sessions, false, false), mHandler.PracticeMatch)
		api.POST("/bots/practice", requireSession(sessions, false, false), mHandler.PracticeMatch)

		// Global Match History, Ranking & Rules
		api.GET("/matches/history", mHandler.GetMatchHistory)
		api.GET("/ranking", tHandler.GetRanking)
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
		Handler: r,
	}

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-quit
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
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
		if (adminOnly && session.Role != "ADMIN") || (session.Role != "ADMIN" && c.Param("id") != "" && session.TournamentID != c.Param("id")) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"detail": "Bạn không có quyền thực hiện thao tác trong giải này."})
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

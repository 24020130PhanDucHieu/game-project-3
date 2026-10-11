package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"

	"project-tuan3/internal/adapter"
	"project-tuan3/internal/auth"
	"project-tuan3/internal/config"
	httpHandler "project-tuan3/internal/handler/http"
	wsHandler "project-tuan3/internal/handler/websocket"
	"project-tuan3/internal/middleware"
	"project-tuan3/internal/observability"
	"project-tuan3/internal/repository"
	"project-tuan3/internal/service"
)

func main() {
	cfg := config.LoadConfig()

	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	// 1. Data Repository & External Adapters (Tự động hỗ trợ Neon PostgreSQL trên Render hoặc JSON cục bộ)
	var tournamentRepo repository.TournamentRepository
	if cfg.DatabaseURL != "" {
		log.Println("[Database] Phát hiện cấu hình DATABASE_URL, đang kết nối Neon PostgreSQL...")
		pgRepo, err := repository.NewPostgresTournamentRepository(cfg.DatabaseURL)
		if err != nil {
			if cfg.Environment == "production" {
				log.Fatalf("Production database is unavailable: %v", err)
			}
			log.Printf("[Database Cảnh Báo] Lỗi kết nối PostgreSQL (%v), tự động chuyển về JSON store", err)
			tournamentRepo = repository.NewJSONTournamentRepository(cfg.DBPath)
		} else {
			log.Println("[Database] Kết nối thành công Neon PostgreSQL Database (Hiệu năng cao + In-memory Cache)!")
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

	// 4. WebSocket Hub for Live Stream
	wsHub := wsHandler.NewHub()
	go wsHub.Run()

	// 5. Gin HTTP Engine
	r := gin.New()
	r.Use(middleware.RecoveryMiddleware())
	r.Use(middleware.LoggerMiddleware())
	r.Use(middleware.RateLimitMiddleware())
	r.Use(middleware.CORSMiddleware(cfg.CORSOrigin))
	r.Use(func(c *gin.Context) {
		c.Next()
		parts := strings.Split(strings.Trim(c.Request.URL.Path, "/"), "/")
		if len(parts) == 6 && parts[0] == "api" && parts[1] == "tournaments" && parts[3] == "matches" && c.Writer.Status() < http.StatusBadRequest {
			wsHub.BroadcastMatchJSON(parts[4], gin.H{
				"type": "MATCH_UPDATED", "tournament_id": parts[2], "match_id": parts[4], "action": parts[5],
			})
		}
	})

	findFrontendFile := func(subpath string) string {
		cleanSubpath := filepath.Clean(subpath)
		if cleanSubpath == ".." || strings.HasPrefix(cleanSubpath, ".."+string(filepath.Separator)) || filepath.IsAbs(cleanSubpath) {
			return ""
		}
		candidates := []string{
			filepath.Join("frontend", cleanSubpath),
			filepath.Join("../frontend", cleanSubpath),
			filepath.Join("../../frontend", cleanSubpath),
		}
		for _, cand := range candidates {
			if _, err := os.Stat(cand); err == nil {
				return cand
			}
		}
		return ""
	}

	// Observability & Frontend Root
	r.GET("/", func(c *gin.Context) {
		if strings.Contains(c.GetHeader("Accept"), "text/html") || c.GetHeader("Accept") == "*/*" || c.GetHeader("Accept") == "" {
			if htmlPath := findFrontendFile("index.html"); htmlPath != "" {
				c.File(htmlPath)
				return
			}
		}
		c.JSON(http.StatusOK, gin.H{
			"service":  "OTTV2 Freshman AI Arena Backend API",
			"status":   "RUNNING",
			"frontend": "https://game-project-3.phanhieu06hungyen.workers.dev",
			"docs":     "/health",
		})
	})
	r.GET("/health", observability.HealthHandler)
	r.GET("/metrics", observability.MetricsHandler)

	// WebSocket Endpoint
	r.GET("/ws/matches/:matchId", func(c *gin.Context) {
		wsHandler.ServeWS(wsHub, c, cfg.CORSOrigin)
	})

	// API Routes Group
	api := r.Group("/api")
	{
		adminOnly := requireSession(sessions, true, false)
		matchSession := requireSession(sessions, false, true)
		matchAdmin := requireSession(sessions, true, true)
		// Tournaments
		api.GET("/tournaments", tHandler.GetAll)
		api.GET("/tournaments/list", tHandler.GetList)
		api.GET("/tournaments/:id", optionalSession(sessions), tHandler.GetByID)
		api.POST("/tournaments/create", adminOnly, tHandler.Create)
		api.POST("/tournaments/:id/auto-schedule", adminOnly, tHandler.AutoSchedule)

		// Teams
		api.GET("/tournaments/:id/teams", optionalSession(sessions), teamHandler.GetTeams)
		api.POST("/tournaments/:id/teams", adminOnly, teamHandler.AddTeam)
		api.POST("/tournaments/:id/teams/:studentId/access-code", adminOnly, teamHandler.RotateCredential)
		api.DELETE("/tournaments/:id/teams/:studentId", adminOnly, teamHandler.RemoveTeam)
		api.POST("/tournaments/:id/teams/quick-fill", adminOnly, teamHandler.QuickFill)

		// Matches & Submission Studio
		api.POST("/admin/login", mHandler.AdminLogin)
		api.POST("/tournaments/:id/matches/:matchId/login", mHandler.Login)
		api.POST("/tournaments/:id/matches/:matchId/auth", mHandler.Auth)
		api.POST("/tournaments/:id/matches/:matchId/draft-code", matchSession, mHandler.SubmitDraftCode)
		api.POST("/tournaments/:id/matches/:matchId/code", matchSession, mHandler.SubmitCode)
		api.POST("/tournaments/:id/matches/:matchId/play-round", matchAdmin, mHandler.PlayRound)
		api.POST("/tournaments/:id/matches/:matchId/next-round", matchAdmin, mHandler.NextRound)
		api.POST("/tournaments/:id/matches/:matchId/demo-fill", matchAdmin, mHandler.DemoFill)
		api.POST("/tournaments/:id/matches/:matchId/reset", matchAdmin, mHandler.Reset)
		api.GET("/tournaments/:id/matches/:matchId/submissions", matchSession, mHandler.GetSubmissions)
		api.GET("/tournaments/:id/matches/:matchId/replay/:roundNumber", mHandler.GetRoundReplay)
		api.POST("/tournaments/:id/practice-match", mHandler.PracticeMatch)

		// Global Match History, Ranking & Rules
		api.GET("/matches/history", mHandler.GetMatchHistory)
		api.GET("/ranking", tHandler.GetRanking)
		api.GET("/tournament/rule", tHandler.GetRule)
		api.POST("/tournament/rule/set", adminOnly, tHandler.SetRule)
	}

	// Serve Frontend Static assets if present
	r.NoRoute(func(c *gin.Context) {
		if c.Request.Method == http.MethodGet {
			cleanPath := strings.TrimPrefix(filepath.Clean(c.Request.URL.Path), "/")
			cleanPath = strings.TrimPrefix(cleanPath, "\\")
			if cleanPath == "" || cleanPath == "." {
				cleanPath = "index.html"
			}
			if target := findFrontendFile(cleanPath); target != "" {
				c.File(target)
				return
			}
		}
		c.JSON(http.StatusNotFound, gin.H{"detail": "Not found"})
	})

	log.Printf("=====================================================")
	log.Printf("  OTTV2 Freshman AI Arena Backend (Go Standard Layout)")
	log.Printf("  Server listening on port :%s", cfg.Port)
	log.Printf("  Game Engine Worker Target: %s", cfg.WorkerURL)
	log.Printf("  Database Storage: %s", cfg.DBPath)
	log.Printf("=====================================================")

	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}

func optionalSession(manager *auth.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := strings.TrimSpace(strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer "))
		if token == "" {
			token = c.Query("token")
		}
		if session, ok := manager.Get(token); ok {
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
		session, ok := manager.Get(token)
		if !ok || (adminOnly && session.Role != "ADMIN") || (session.Role != "ADMIN" && session.TournamentID != c.Param("id")) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"detail": "A valid tournament session is required"})
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

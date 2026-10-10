package main

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"

	"project-tuan3/internal/adapter"
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

	// 1. Data Repository & External Adapters
	tournamentRepo := repository.NewJSONTournamentRepository(cfg.DBPath)
	botRunnerAdapter := adapter.NewHTTPBotRunnerAdapter(cfg.WorkerURL)

	// 2. Service Layer
	tournamentService := service.NewTournamentService(tournamentRepo, botRunnerAdapter)

	// 3. HTTP Handlers
	tHandler := httpHandler.NewTournamentHandler(tournamentService)
	teamHandler := httpHandler.NewTeamHandler(tournamentService)
	mHandler := httpHandler.NewMatchHandler(tournamentService)

	// 4. WebSocket Hub for Live Stream
	wsHub := wsHandler.NewHub()
	go wsHub.Run()

	// 5. Gin HTTP Engine
	r := gin.New()
	r.Use(middleware.RecoveryMiddleware())
	r.Use(middleware.LoggerMiddleware())
	r.Use(middleware.CORSMiddleware(cfg.CORSOrigin))

	// Observability Endpoints
	r.GET("/", func(c *gin.Context) {
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
		wsHandler.ServeWS(wsHub, c)
	})

	// API Routes Group
	api := r.Group("/api")
	{
		// Tournaments
		api.GET("/tournaments", tHandler.GetAll)
		api.GET("/tournaments/list", tHandler.GetList)
		api.GET("/tournaments/:id", tHandler.GetByID)
		api.POST("/tournaments/create", tHandler.Create)
		api.POST("/tournaments/:id/auto-schedule", tHandler.AutoSchedule)

		// Teams
		api.GET("/tournaments/:id/teams", teamHandler.GetTeams)
		api.POST("/tournaments/:id/teams", teamHandler.AddTeam)
		api.DELETE("/tournaments/:id/teams/:studentId", teamHandler.RemoveTeam)
		api.POST("/tournaments/:id/teams/quick-fill", teamHandler.QuickFill)

		// Matches & Submission Studio
		api.POST("/tournaments/:id/matches/:matchId/login", mHandler.Login)
		api.POST("/tournaments/:id/matches/:matchId/auth", mHandler.Auth)
		api.POST("/tournaments/:id/matches/:matchId/draft-code", mHandler.SubmitDraftCode)
		api.POST("/tournaments/:id/matches/:matchId/code", mHandler.SubmitCode)
		api.POST("/tournaments/:id/matches/:matchId/play-round", mHandler.PlayRound)
		api.POST("/tournaments/:id/matches/:matchId/next-round", mHandler.NextRound)
		api.POST("/tournaments/:id/matches/:matchId/demo-fill", mHandler.DemoFill)
		api.POST("/tournaments/:id/matches/:matchId/reset", mHandler.Reset)
		api.GET("/tournaments/:id/matches/:matchId/submissions", mHandler.GetSubmissions)
		api.POST("/tournaments/:id/practice-match", mHandler.PracticeMatch)

		// Global Match History, Ranking & Rules
		api.GET("/matches/history", mHandler.GetMatchHistory)
		api.GET("/ranking", tHandler.GetRanking)
		api.GET("/tournament/rule", tHandler.GetRule)
		api.POST("/tournament/rule/set", tHandler.SetRule)
	}

	// Serve Frontend Static assets if present
	r.NoRoute(func(c *gin.Context) {
		if c.Request.Method == http.MethodGet {
			// Try serving from frontend directory
			filePath := "../../frontend" + c.Request.URL.Path
			if c.Request.URL.Path == "/" {
				c.File("../../frontend/index.html")
				return
			}
			c.File(filePath)
			return
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

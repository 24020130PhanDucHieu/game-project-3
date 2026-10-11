package config

import (
	"os"
)

type Config struct {
	Port        string
	DBPath      string
	DatabaseURL string
	WorkerURL   string
	Environment string
	CORSOrigin  string
}

func LoadConfig() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = os.Getenv("POSTGRES_URL")
	}
	if databaseURL == "" {
		databaseURL = os.Getenv("NEON_DATABASE_URL")
	}

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		if _, err := os.Stat("database/tournaments_store.json"); err == nil {
			dbPath = "database/tournaments_store.json"
		} else if _, err := os.Stat("../database/tournaments_store.json"); err == nil {
			dbPath = "../database/tournaments_store.json"
		} else if _, err := os.Stat("../../database/tournaments_store.json"); err == nil {
			dbPath = "../../database/tournaments_store.json"
		} else {
			dbPath = "tournaments_store.json"
		}
	}

	workerURL := os.Getenv("WORKER_URL")
	if workerURL == "" {
		workerURL = "http://127.0.0.1:8001/mutate-tournament"
	}

	env := os.Getenv("ENV")
	if env == "" {
		env = "development"
	}

	corsOrigin := os.Getenv("CORS_ORIGIN")
	if corsOrigin == "" {
		corsOrigin = "*"
	}

	return &Config{
		Port:        port,
		DBPath:      dbPath,
		DatabaseURL: databaseURL,
		WorkerURL:   workerURL,
		Environment: env,
		CORSOrigin:  corsOrigin,
	}
}

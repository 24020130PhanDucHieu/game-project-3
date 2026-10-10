package config

import (
	"os"
)

type Config struct {
	Port        string
	DBPath      string
	WorkerURL   string
	Environment string
	CORSOrigin  string
}

func LoadConfig() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		// Checks database folder first, then local data folder
		if _, err := os.Stat("../../database/tournaments_store.json"); err == nil {
			dbPath = "../../database/tournaments_store.json"
		} else if _, err := os.Stat("../database/tournaments_store.json"); err == nil {
			dbPath = "../database/tournaments_store.json"
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
		WorkerURL:   workerURL,
		Environment: env,
		CORSOrigin:  corsOrigin,
	}
}

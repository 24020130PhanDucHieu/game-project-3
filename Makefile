.PHONY: help frontend-build run-backend run-runner tunnel test test-unit test-security test-go test-worker test-load bench backup docker-build docker-up docker-down

help:
	@echo "Available commands:"
	@echo "  make frontend-build Build static frontend in frontend/dist"
	@echo "  make run-backend   Run the Go API gateway on port 8080"
	@echo "  make run-runner    Run the Python engine worker on port 8001"
	@echo "  make test          Run unit, security, Go and Python checks"
	@echo "  make test-unit     Run game rules and FSM tests"
	@echo "  make test-security Run sandbox security tests"
	@echo "  make test-go       Run Go tests"
	@echo "  make test-worker   Compile-check the Python worker"
	@echo "  make docker-build  Build the deployment image"
	@echo "  make docker-up     Start the Docker Compose deployment"
	@echo "  make docker-down   Stop the Docker Compose deployment"

frontend-build:
	python scripts/build_frontend.py

run-backend:
	cd backend && go run ./cmd/server

run-runner:
	cd bot-runner && python main.py

test: test-unit test-security test-go test-worker

test-unit:
	python tests/unit/test_rules.py
	python tests/unit/test_fsm.py

test-security:
	python tests/security/test_sandbox_security.py

test-go:
	cd backend && go test ./...

test-worker:
	cd bot-runner && python -m py_compile main.py app/repository/database.py app/sandbox/runner.py

test-load:
	python tests/load/test_load.py

bench:
	python scripts/benchmark_load.py

backup:
	python scripts/backup_data.py

docker-build:
	docker build -t ottv2-arena:latest -f deploy/Dockerfile .

docker-up:
	docker compose -f deploy/docker-compose.yml up -d

docker-down:
	docker compose -f deploy/docker-compose.yml down

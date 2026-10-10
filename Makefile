# ==============================================================================
# MAKEFILE - OTTV2 AI BOT ARENA AUTOMATION (CLEAN ARCHITECTURE)
# ==============================================================================

.PHONY: help run-backend run-runner run tunnel test test-unit test-security test-load bench backup docker-build docker-up docker-down

help:
	@echo "Các lệnh khả dụng:"
	@echo "  make run-backend   - Khởi chạy Go Backend API Gateway (Port 8080)"
	@echo "  make run-runner    - Khởi chạy Python Bot Runner Worker (Port 8001)"
	@echo "  make tunnel        - Kích hoạt Cloudflare Tunnel công khai ra Internet"
	@echo "  make test          - Chạy toàn bộ các bộ kiểm thử (Unit, Integration, Security)"
	@echo "  make test-unit     - Chạy kiểm thử đơn vị (Rules, FSM)"
	@echo "  make test-security - Chạy kiểm thử cô lập Sandbox và bảo mật"
	@echo "  make test-load     - Chạy kiểm thử chịu tải hàng loạt"
	@echo "  make bench         - Chạy đo đạc tải tăng dần"
	@echo "  make backup        - Sao lưu dữ liệu giải đấu thành file nén .json.gz"
	@echo "  make docker-build  - Xây dựng Docker Image an toàn"
	@echo "  make docker-up     - Khởi chạy container với Docker Compose"
	@echo "  make docker-down   - Dừng container Docker Compose"

run-backend:
	cd backend && go run cmd/server/main.go

run-runner:
	cd bot-runner && python main.py

tunnel:
	python scripts/start_cloudflare_tunnel.py 8080

test:
	python -m unittest discover -s tests -p "test_*.py"

test-unit:
	python tests/unit/test_rules.py
	python tests/unit/test_fsm.py

test-security:
	python tests/security/test_sandbox_security.py

test-load:
	python tests/load/test_load.py

bench:
	python scripts/benchmark_load.py

backup:
	python scripts/backup_data.py

docker-build:
	docker build -t ottv2-arena:latest -f deploy/Dockerfile .

docker-up:
	docker-compose -f deploy/docker-compose.yml up -d

docker-down:
	docker-compose -f deploy/docker-compose.yml down

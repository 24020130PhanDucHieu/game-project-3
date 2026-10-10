# ==============================================================================
# DOCKERFILE - CLOUD PRODUCTION DEPLOYMENT (RENDER / RAILWAY / FLY.IO)
# Multi-stage: Compile Go backend + Setup Python 3.10 sandbox & G++ compiler
# ==============================================================================

# STAGE 1: Biên dịch Go Backend API Gateway
FROM golang:alpine AS go-builder
WORKDIR /app
ENV GOTOOLCHAIN=auto
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/server ./cmd/server/main.go

# STAGE 2: Môi trường chạy chính thức (Python 3.10 + G++ cho Bot Sandbox)
FROM python:3.10-slim

WORKDIR /app

# Cài đặt g++ để biên dịch bot C++ của sinh viên và curl cho healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Cài đặt Python dependencies
COPY bot-runner/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Sao chép mã nguồn bot-runner, database, frontend
COPY bot-runner/ ./bot-runner/
COPY database/ ./database/
COPY frontend/ ./frontend/
COPY --from=go-builder /app/server ./server

# Tạo script khởi động song song cả 2 dịch vụ
RUN printf '#!/bin/sh\npython bot-runner/main.py &\n./server\n' > start.sh && chmod +x start.sh

ENV PORT=8080 \
    ENVIRONMENT=production \
    WORKER_URL=http://127.0.0.1:8001/mutate-tournament \
    DB_PATH=database/tournaments_store.json

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["./start.sh"]

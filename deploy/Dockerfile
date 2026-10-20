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
    libtinfo6 \
    libseccomp2 \
    && rm -rf /var/lib/apt/lists/*

COPY bot-runner/install-wasi.sh /tmp/install-wasi.sh
RUN sh /tmp/install-wasi.sh

# Cài đặt Python dependencies
COPY bot-runner/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Sao chép mã nguồn bot-runner, database, frontend
COPY bot-runner/ ./bot-runner/
COPY database/ ./database/
COPY frontend/ ./frontend/
COPY --from=go-builder /app/server ./server

RUN useradd --system --uid 10001 --create-home arena \
    && mkdir -p /var/lib/arena \
    && chown -R arena:arena /app /var/lib/arena

# Tạo script khởi động song song cả 2 dịch vụ
RUN printf '#!/bin/sh\nset -e\nenv -i PATH="$PATH" PYTHONIOENCODING=utf-8 ENVIRONMENT=production python bot-runner/main.py &\nfor attempt in 1 2 3 4 5 6 7 8 9 10; do curl -fsS http://127.0.0.1:8001/health >/dev/null && exec ./server; sleep 1; done\nexit 1\n' > start.sh && chmod +x start.sh

ENV PORT=8080 \
    ENVIRONMENT=production \
    WORKER_URL=http://127.0.0.1:8001/mutate-tournament \
    DB_PATH=/var/lib/arena/tournaments_store.json

USER arena

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["./start.sh"]

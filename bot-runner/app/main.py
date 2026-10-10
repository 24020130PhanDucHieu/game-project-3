# -*- coding: utf-8 -*-
"""
Hệ thống Máy chủ Trực tuyến Đấu trường OTTV2 Tân Sinh viên ICPC (FastAPI Enterprise Engine).
Kiến trúc Module hóa, chịu tải cao (5,000+ VUs), tích hợp Cache In-Memory,
Gzip Compression, Rate Limiting, và WebSocket FSM Visualizer.
"""

from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os

from backend.app.core.config import settings
from backend.app.core.rate_limit import rate_limiter
from backend.app.api.health import router as health_router
from backend.app.api.tournaments import router as tournaments_router
from backend.app.api.matches import router as matches_router
from backend.app.api.bots import router as bots_router
from backend.app.api.auth import router as auth_router
from backend.app.api.arena import router as arena_router
from app.database import db

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Khởi động: Storage worker đã tự khởi chạy trong db.__init__
    yield
    # Dừng: Ép flush toàn bộ dữ liệu xuống đĩa trước khi tắt
    if hasattr(db, "storage"):
        db.storage.flush_immediate()
        db.storage.stop()

app = FastAPI(
    title=settings.APP_NAME,
    description="Máy chủ Đấu trường Lập trình Game Oẳn Tù Tì V2 dành cho Tân sinh viên K69",
    version=settings.APP_VERSION,
    lifespan=lifespan
)

# 1. GZip Compression Middleware (Nén phản hồi > 1KB, tiết kiệm 90% băng thông)
app.add_middleware(GZipMiddleware, minimum_size=settings.GZIP_MIN_SIZE_BYTES)

# 2. CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. In-Memory Rate Limiting Middleware (Bảo vệ chống Spam/DDoS không cần Redis)
@app.middleware("http")
async def rate_limiting_middleware(request: Request, call_next):
    if settings.RATE_LIMIT_ENABLED and not request.url.path.startswith(("/static", "/health", "/metrics")):
        # Bỏ qua giới hạn tốc độ khi chạy kịch bản kiểm thử tải nội bộ
        if request.headers.get("X-Benchmark-Test") == "true":
            return await call_next(request)

        client_ip = request.client.host if request.client else "127.0.0.1"
        # Endpoint nộp code hoặc play-round giới hạn nghiêm ngặt hơn
        is_mutation = request.method in ("POST", "PUT", "DELETE") and "/code" in request.url.path
        limit = settings.RATE_LIMIT_SUBMIT_PER_MINUTE if is_mutation else settings.RATE_LIMIT_PER_MINUTE

        allowed, retry_after = rate_limiter.is_allowed(client_ip, limit=limit)
        if not allowed:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "detail": "Quá nhiều yêu cầu truy cập từ địa chỉ của bạn. Vui lòng thử lại sau.",
                    "retry_after_seconds": retry_after
                },
                headers={"Retry-After": str(retry_after)}
            )

    response = await call_next(request)
    return response

# Gắn các API Routers
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(bots_router)
app.include_router(tournaments_router)
app.include_router(matches_router)
app.include_router(arena_router)

# Mount thư mục Frontend để chạy Web trực tiếp
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host=settings.HOST, port=settings.PORT, workers=settings.WORKERS)

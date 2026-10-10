# -*- coding: utf-8 -*-
"""
Hệ thống Cấu hình Môi trường Tập trung (Application Settings & Configuration).
Hỗ trợ nạp cấu hình từ .env, biến môi trường hệ thống, và giá trị mặc định tối ưu cho Production.
"""

import os
from typing import List

class Settings:
    # Ứng dụng
    APP_NAME: str = "Freshman Bot Arena - OTTV2 ICPC Server"
    APP_VERSION: str = "2.1.0-cloud"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "production") # development / production
    DEBUG: bool = os.getenv("DEBUG", "false").lower() in ("true", "1")

    # Mạng & Máy chủ
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    WORKERS: int = int(os.getenv("WORKERS", "4"))
    
    # CORS
    ALLOWED_ORIGINS: List[str] = [
        origin.strip()
        for origin in os.getenv("ALLOWED_ORIGINS", "*").split(",")
        if origin.strip()
    ]

    # Lưu trữ & Dữ liệu
    DATA_DIR: str = os.getenv("DATA_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "data"))
    DB_SYNC_DEBOUNCE_SEC: float = float(os.getenv("DB_SYNC_DEBOUNCE_SEC", "1.0")) # Giảm thiểu I/O đĩa
    MAX_SUBMISSIONS_PER_MATCH: int = int(os.getenv("MAX_SUBMISSIONS_PER_MATCH", "200"))
    
    # Hiệu năng & Bộ nhớ đệm (In-Memory Cache)
    CACHE_ENABLED: bool = os.getenv("CACHE_ENABLED", "true").lower() in ("true", "1")
    CACHE_DEFAULT_TTL_SEC: int = int(os.getenv("CACHE_DEFAULT_TTL_SEC", "2")) # 2s TTL cho Polling tần suất cao
    GZIP_MIN_SIZE_BYTES: int = int(os.getenv("GZIP_MIN_SIZE_BYTES", "1024"))

    # Giới hạn Request (In-Memory Rate Limiting)
    RATE_LIMIT_ENABLED: bool = os.getenv("RATE_LIMIT_ENABLED", "true").lower() in ("true", "1")
    RATE_LIMIT_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_PER_MINUTE", "600")) # 600 req/min (~10 req/s per IP)
    RATE_LIMIT_SUBMIT_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_SUBMIT_PER_MINUTE", "60"))

    # Sandbox Bot Execution
    SANDBOX_TIMEOUT_SEC: float = float(os.getenv("SANDBOX_TIMEOUT_SEC", "0.5"))
    SANDBOX_MAX_WORKERS: int = int(os.getenv("SANDBOX_MAX_WORKERS", "8"))

settings = Settings()

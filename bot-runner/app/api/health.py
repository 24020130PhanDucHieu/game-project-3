# -*- coding: utf-8 -*-
"""
Endpoint Kiểm tra Sức khỏe & Giám sát Hệ thống (Health Check & Metrics).
Cung cấp trạng thái cho Load Balancer (Cloudflare, Nginx), giám sát RAM/CPU,
và theo dõi tình trạng hàng đợi ghi đĩa.
"""

from fastapi import APIRouter, Response
import time
import os
import sys

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

from backend.app.core.config import settings
from app.database import db

router = APIRouter(tags=["Health & Monitoring"])
START_TIME = time.time()

@router.get("/health")
def health_check():
    uptime_sec = time.time() - START_TIME
    data = {
        "status": "HEALTHY",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "uptime_seconds": round(uptime_sec, 2),
        "active_tournament": db.active_tournament_id,
        "timestamp": time.time()
    }
    return data

@router.get("/metrics")
def system_metrics():
    uptime_sec = time.time() - START_TIME
    cpu_percent = 0.0
    mem_mb = 0.0

    if HAS_PSUTIL:
        try:
            process = psutil.Process(os.getpid())
            mem_mb = round(process.memory_info().rss / (1024 * 1024), 2)
            cpu_percent = process.cpu_percent(interval=None)
        except Exception:
            pass

    return {
        "uptime_seconds": round(uptime_sec, 2),
        "memory_rss_mb": mem_mb,
        "cpu_percent": cpu_percent,
        "total_tournaments": len(db.tournaments),
        "total_users": len(db.users),
        "total_bots": len(db.bots),
        "active_solo_rooms": len(db.solo_rooms),
        "storage_dirty": getattr(db.storage, "_dirty", False),
        "cache_enabled": settings.CACHE_ENABLED,
        "rate_limit_enabled": settings.RATE_LIMIT_ENABLED
    }

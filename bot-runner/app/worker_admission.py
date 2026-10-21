"""Private worker admission: authenticate before parsing or running bot code."""
import os
import secrets
import threading

from starlette.responses import JSONResponse


def install_worker_admission(app):
    token = os.environ.get("WORKER_TOKEN", "")
    release = os.environ.get("WORKER_RELEASE", "")
    try:
        capacity = int(os.environ.get("WORKER_CAPACITY", "1"))
    except ValueError:
        capacity = 1
    slots = threading.BoundedSemaphore(max(1, min(8, capacity)))

    @app.middleware("http")
    async def admit(request, call_next):
        if request.url.path != "/mutate-tournament":
            response = await call_next(request)
            response.headers["X-Arena-Release"] = release
            return response
        if token and not secrets.compare_digest(
            request.headers.get("X-Worker-Token", ""), token
        ):
            return JSONResponse({"detail": "Worker authentication required"}, status_code=401,
                                headers={"X-Arena-Release": release})
        if not slots.acquire(blocking=False):
            return JSONResponse(
                {"detail": "Worker busy; retry on another worker"},
                status_code=429, headers={"Retry-After": "2", "X-Arena-Release": release},
            )
        try:
            response = await call_next(request)
            response.headers["X-Arena-Release"] = release
            return response
        finally:
            slots.release()

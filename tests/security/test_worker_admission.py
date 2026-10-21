import asyncio
import os
import sys
import unittest
from unittest.mock import patch

import httpx
from fastapi import FastAPI

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../bot-runner")))
from app.worker_admission import install_worker_admission


class TestWorkerAdmission(unittest.IsolatedAsyncioTestCase):
    async def test_auth_capacity_and_recovery(self):
        app = FastAPI()
        entered, release = asyncio.Event(), asyncio.Event()
        with patch.dict(os.environ, {"WORKER_TOKEN": "fixture", "WORKER_CAPACITY": "1", "WORKER_RELEASE": "fixture-release"}):
            install_worker_admission(app)

        @app.post("/mutate-tournament")
        async def judge():
            entered.set()
            await release.wait()
            return {"is_valid": True}

        @app.get("/health")
        async def health():
            return {"status": "HEALTHY"}

        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://worker") as client:
            denied = await client.post("/mutate-tournament")
            self.assertEqual(denied.status_code, 401)
            self.assertEqual(denied.headers["x-arena-release"], "fixture-release")
            self.assertFalse(entered.is_set())
            headers = {"X-Worker-Token": "fixture"}
            first = asyncio.create_task(client.post("/mutate-tournament", headers=headers))
            await asyncio.wait_for(entered.wait(), 2)
            try:
                busy = await client.post("/mutate-tournament", headers=headers)
                self.assertEqual(busy.status_code, 429)
                self.assertEqual(busy.headers["retry-after"], "2")
                self.assertEqual(busy.headers["x-arena-release"], "fixture-release")
                health = await client.get("/health")
                self.assertEqual(health.status_code, 200)
                self.assertEqual(health.headers["x-arena-release"], "fixture-release")
            finally:
                release.set()
                result = await first
                self.assertEqual(result.status_code, 200)
                self.assertEqual(result.headers["x-arena-release"], "fixture-release")
            self.assertEqual((await client.post("/mutate-tournament", headers=headers)).status_code, 200)

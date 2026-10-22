# -*- coding: utf-8 -*-
"""
KIỂM THỬ TẢI THỰC TẾ — Arena OTTV2
====================================
Mô phỏng 4.000 sinh viên đăng nhập, nộp code Python/C++ và nhận kết quả.
Đo tốc độ chấm, hàng đợi, lỗi và độ trễ p50/p90/p95/p99.

Yêu cầu:
  - pip install aiohttp psutil
  - Đặt BENCHMARK_BASE_URL=<staging URL>
  - Đặt BENCHMARK_CONFIRM_STAGING=YES
  - Đặt ADMIN_PASSWORD=<mật khẩu admin staging>
  - KHÔNG BAO GIỜ chạy trên production.

Cách chạy:
  set BENCHMARK_BASE_URL=http://staging:8080
  set BENCHMARK_CONFIRM_STAGING=YES
  set ADMIN_PASSWORD=admin1234
  python scripts/benchmark_load.py
"""

import asyncio
import time
import sys
import os
import statistics
import json
import random
import string
import hashlib
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field, asdict

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

try:
    import aiohttp
except ImportError:
    print("Cần cài đặt: pip install aiohttp")
    sys.exit(1)

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

BASE_URL = os.getenv("BENCHMARK_BASE_URL", "").rstrip("/")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin1234")

# ─── Sample code for submissions ───────────────────────────────────────────

PYTHON_BOT_CODE = '''
import random
def move(board, player):
    choices = ["rock", "paper", "scissors"]
    return random.choice(choices)
'''

CPP_BOT_CODE = '''
#include <cstdlib>
#include <string>
std::string move(const std::string& board, int player) {
    const char* choices[] = {"rock", "paper", "scissors"};
    return choices[rand() % 3];
}
'''

# ─── Data Classes ──────────────────────────────────────────────────────────

@dataclass
class RequestMetric:
    endpoint: str
    method: str
    status: int
    latency_ms: float
    success: bool
    error: str = ""

@dataclass
class StageResult:
    stage_name: str
    concurrency: int
    total_requests: int
    elapsed_seconds: float = 0.0

    # Breakdown by operation type
    login_metrics: List[RequestMetric] = field(default_factory=list)
    read_metrics: List[RequestMetric] = field(default_factory=list)
    submit_metrics: List[RequestMetric] = field(default_factory=list)
    poll_metrics: List[RequestMetric] = field(default_factory=list)

    # Aggregated
    success_count: int = 0
    error_count: int = 0
    error_breakdown: Dict[str, int] = field(default_factory=dict)

    # Resource usage
    cpu_before: float = 0.0
    cpu_after: float = 0.0
    mem_before_mb: float = 0.0
    mem_after_mb: float = 0.0

    def all_latencies(self) -> List[float]:
        return [m.latency_ms for m in
                self.login_metrics + self.read_metrics +
                self.submit_metrics + self.poll_metrics
                if m.success]

    def compute_percentiles(self, latencies: List[float]) -> Dict[str, float]:
        if not latencies:
            return {"min": 0, "avg": 0, "p50": 0, "p90": 0, "p95": 0, "p99": 0, "max": 0}
        latencies.sort()
        n = len(latencies)
        return {
            "min": round(min(latencies), 2),
            "avg": round(statistics.mean(latencies), 2),
            "p50": round(latencies[int(n * 0.50)], 2),
            "p90": round(latencies[int(n * 0.90)], 2),
            "p95": round(latencies[int(n * 0.95)], 2),
            "p99": round(latencies[min(int(n * 0.99), n - 1)], 2),
            "max": round(max(latencies), 2),
        }

    def summary(self) -> Dict[str, Any]:
        all_lats = self.all_latencies()
        rps = len(all_lats) / self.elapsed_seconds if self.elapsed_seconds > 0 else 0
        return {
            "stage_name": self.stage_name,
            "concurrency": self.concurrency,
            "total_requests": self.total_requests,
            "success_count": self.success_count,
            "error_count": self.error_count,
            "error_rate_pct": round((self.error_count / max(self.total_requests, 1)) * 100, 2),
            "elapsed_seconds": round(self.elapsed_seconds, 2),
            "throughput_rps": round(rps, 1),
            "latency_overall": self.compute_percentiles(all_lats),
            "latency_login": self.compute_percentiles([m.latency_ms for m in self.login_metrics if m.success]),
            "latency_read": self.compute_percentiles([m.latency_ms for m in self.read_metrics if m.success]),
            "latency_submit": self.compute_percentiles([m.latency_ms for m in self.submit_metrics if m.success]),
            "latency_poll": self.compute_percentiles([m.latency_ms for m in self.poll_metrics if m.success]),
            "error_breakdown": self.error_breakdown,
            "resource_usage": {
                "cpu_before": self.cpu_before,
                "cpu_after": self.cpu_after,
                "mem_before_mb": round(self.mem_before_mb, 1),
                "mem_after_mb": round(self.mem_after_mb, 1),
            }
        }


# ─── Test User Generator ──────────────────────────────────────────────────

def generate_test_users(count: int) -> List[Dict[str, str]]:
    """Generate unique test user credentials for staging."""
    users = []
    for i in range(count):
        suffix = hashlib.md5(f"bench-{i}-{time.time_ns()}".encode()).hexdigest()[:8]
        users.append({
            "student_id": f"BENCH{i:05d}",
            "name": f"LoadTest User {i}",
            "email": f"bench_{suffix}@test.local",
            "password": f"bench_pass_{suffix}",
        })
    return users


# ─── Core Load Test Engine ─────────────────────────────────────────────────

async def fetch_json(session: aiohttp.ClientSession, method: str, url: str,
                     headers: Optional[dict] = None, payload: Optional[dict] = None,
                     timeout_sec: float = 30) -> Tuple[int, Any, float]:
    """Execute an HTTP request and return (status, body, latency_ms)."""
    t0 = time.perf_counter()
    try:
        if method == "GET":
            async with session.get(url, headers=headers,
                                   timeout=aiohttp.ClientTimeout(total=timeout_sec)) as resp:
                body = await resp.json(content_type=None)
                lat = (time.perf_counter() - t0) * 1000
                return resp.status, body, lat
        else:
            async with session.post(url, json=payload, headers=headers,
                                    timeout=aiohttp.ClientTimeout(total=timeout_sec)) as resp:
                body = await resp.json(content_type=None)
                lat = (time.perf_counter() - t0) * 1000
                return resp.status, body, lat
    except asyncio.TimeoutError:
        lat = (time.perf_counter() - t0) * 1000
        return 0, {"error": "timeout"}, lat
    except Exception as e:
        lat = (time.perf_counter() - t0) * 1000
        return 0, {"error": str(e)}, lat


async def simulate_user_session(
    session: aiohttp.ClientSession,
    sem: asyncio.Semaphore,
    user: Dict[str, str],
    tournament_id: str,
    match_id: str,
    stage_result: StageResult,
):
    """Simulate a complete user session: login → read tournament → submit code → poll result."""
    async with sem:
        test_headers = {"X-Benchmark-Test": "true"}

        # 1) ĐĂNG NHẬP
        status, body, lat = await fetch_json(
            session, "POST", f"{BASE_URL}/api/accounts/register",
            headers=test_headers,
            payload={"student_id": user["student_id"], "name": user["name"],
                     "email": user["email"], "password": user["password"]}
        )
        if status not in (200, 201, 409):
            # 409 = already registered, try login
            status, body, lat = await fetch_json(
                session, "POST", f"{BASE_URL}/api/accounts/login",
                headers=test_headers,
                payload={"student_id": user["student_id"], "password": user["password"]}
            )

        login_ok = status in (200, 201, 409)
        metric = RequestMetric("register/login", "POST", status, lat, login_ok,
                               "" if login_ok else str(body))
        stage_result.login_metrics.append(metric)
        if login_ok:
            stage_result.success_count += 1
        else:
            stage_result.error_count += 1
            stage_result.error_breakdown[f"login_{status}"] = \
                stage_result.error_breakdown.get(f"login_{status}", 0) + 1
            return  # Cannot continue without login

        token = ""
        if isinstance(body, dict):
            token = body.get("session_token", body.get("token", ""))

        auth_headers = {**test_headers}
        if token:
            auth_headers["Authorization"] = f"Bearer {token}"

        # 2) ĐỌC BẢNG GIẢI ĐẤU
        status, body, lat = await fetch_json(
            session, "GET", f"{BASE_URL}/api/tournaments/{tournament_id}",
            headers=auth_headers
        )
        read_ok = status in (200, 304)
        stage_result.read_metrics.append(
            RequestMetric(f"/api/tournaments/{tournament_id}", "GET", status, lat, read_ok)
        )
        if read_ok:
            stage_result.success_count += 1
        else:
            stage_result.error_count += 1
            stage_result.error_breakdown[f"read_{status}"] = \
                stage_result.error_breakdown.get(f"read_{status}", 0) + 1

        # 3) NỘP CODE (Python hoặc C++ ngẫu nhiên)
        lang = random.choice(["python", "cpp"])
        code = PYTHON_BOT_CODE if lang == "python" else CPP_BOT_CODE
        submit_payload = {
            "code": code,
            "language": lang,
        }

        status, body, lat = await fetch_json(
            session, "POST",
            f"{BASE_URL}/api/tournaments/{tournament_id}/matches/{match_id}/code",
            headers=auth_headers,
            payload=submit_payload,
            timeout_sec=60,
        )
        submit_ok = status in (200, 201, 202)
        stage_result.submit_metrics.append(
            RequestMetric(f"submit/{lang}", "POST", status, lat, submit_ok,
                          "" if submit_ok else str(body))
        )
        if submit_ok:
            stage_result.success_count += 1
        else:
            stage_result.error_count += 1
            stage_result.error_breakdown[f"submit_{status}"] = \
                stage_result.error_breakdown.get(f"submit_{status}", 0) + 1

        # 4) POLLING KẾT QUẢ (tối đa 3 lần, mỗi lần cách 2 giây)
        for poll_attempt in range(3):
            await asyncio.sleep(2.0)
            status, body, lat = await fetch_json(
                session, "GET", f"{BASE_URL}/api/tournaments/{tournament_id}",
                headers=auth_headers
            )
            poll_ok = status in (200, 304)
            stage_result.poll_metrics.append(
                RequestMetric("poll_result", "GET", status, lat, poll_ok)
            )
            if poll_ok:
                stage_result.success_count += 1
            else:
                stage_result.error_count += 1
                stage_result.error_breakdown[f"poll_{status}"] = \
                    stage_result.error_breakdown.get(f"poll_{status}", 0) + 1
            break  # Only count first poll for benchmarking


async def run_stage(stage_name: str, concurrency: int, user_count: int,
                    tournament_id: str, match_id: str) -> StageResult:
    """Run a single load test stage."""
    result = StageResult(
        stage_name=stage_name,
        concurrency=concurrency,
        total_requests=0,
    )

    if HAS_PSUTIL:
        result.cpu_before = psutil.cpu_percent(interval=0.5)
        result.mem_before_mb = psutil.Process(os.getpid()).memory_info().rss / (1024 * 1024)

    users = generate_test_users(user_count)

    connector = aiohttp.TCPConnector(
        limit=concurrency + 200,
        limit_per_host=concurrency + 200,
        enable_cleanup_closed=True,
        force_close=False,
        keepalive_timeout=30,
    )

    t_start = time.perf_counter()
    async with aiohttp.ClientSession(connector=connector) as session:
        sem = asyncio.Semaphore(concurrency)
        tasks = [
            simulate_user_session(session, sem, user, tournament_id, match_id, result)
            for user in users
        ]
        await asyncio.gather(*tasks, return_exceptions=True)

    result.elapsed_seconds = time.perf_counter() - t_start

    # Count total requests across all categories
    result.total_requests = (len(result.login_metrics) + len(result.read_metrics) +
                             len(result.submit_metrics) + len(result.poll_metrics))

    if HAS_PSUTIL:
        result.cpu_after = psutil.cpu_percent(interval=0.5)
        result.mem_after_mb = psutil.Process(os.getpid()).memory_info().rss / (1024 * 1024)

    return result


async def check_queue_drain(session: aiohttp.ClientSession, admin_token: str,
                            max_wait: int = 300) -> Dict[str, Any]:
    """Wait for the submission queue to drain and measure drain time."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    start = time.perf_counter()
    max_queue = 0
    checks = 0
    drain_complete = False

    for _ in range(max_wait // 5):
        await asyncio.sleep(5)
        checks += 1
        try:
            status, body, _ = await fetch_json(
                session, "GET", f"{BASE_URL}/api/admin/monitoring", headers=headers
            )
            if status != 200:
                continue
            queue_info = body.get("queue", {}).get("counts", {})
            queued = queue_info.get("validation_QUEUED", 0) + queue_info.get("job_QUEUED", 0)
            running = queue_info.get("validation_RUNNING", 0) + queue_info.get("job_RUNNING", 0)
            max_queue = max(max_queue, queued + running)

            if queued == 0 and running == 0:
                drain_complete = True
                break
        except Exception:
            continue

    elapsed = time.perf_counter() - start
    return {
        "drain_complete": drain_complete,
        "drain_time_seconds": round(elapsed, 2),
        "max_queue_depth": max_queue,
        "poll_checks": checks,
    }


# ─── Main ──────────────────────────────────────────────────────────────────

async def main():
    # Safety checks
    if os.getenv("BENCHMARK_CONFIRM_STAGING") != "YES" or not BASE_URL:
        raise SystemExit(
            "Đặt BENCHMARK_BASE_URL=<staging URL> và BENCHMARK_CONFIRM_STAGING=YES.\n"
            "Chạy trên staging tách biệt, KHÔNG CHẠY TRÊN PRODUCTION."
        )
    production_hosts = [
        "arena.13.250.49.111.sslip.io",
        "game-project-3.phanhieu06hungyen.workers.dev",
    ]
    if any(host in BASE_URL.lower() for host in production_hosts):
        raise SystemExit("TỪ CHỐI: Không được chạy benchmark trên production!")

    print("=" * 80)
    print("  KIỂM THỬ TẢI THỰC TẾ — Arena OTTV2 ICPC")
    print(f"  Thời điểm: {datetime.now(timezone.utc).isoformat()}")
    print(f"  URL staging: {BASE_URL}")
    print("  Gồm: Đăng nhập → Nộp code Python/C++ → Đo queue drain → p95/p99")
    print("=" * 80)

    # Step 1: Admin login to get monitoring access
    async with aiohttp.ClientSession() as session:
        status, body, _ = await fetch_json(
            session, "POST", f"{BASE_URL}/api/admin/login",
            payload={"password": ADMIN_PASSWORD}
        )
        if status != 200:
            print(f"⚠ Admin login failed ({status}); queue drain monitoring unavailable")
            admin_token = ""
        else:
            admin_token = body.get("session_token", "")
            print(f"✔ Admin login thành công, có quyền giám sát queue")

        # Step 2: Find a usable tournament and match
        status, body, _ = await fetch_json(session, "GET", f"{BASE_URL}/api/tournaments")
        if status != 200 or not body:
            raise SystemExit("Không thể lấy danh sách giải đấu")

        tournament_id = None
        match_id = None

        for t in (body if isinstance(body, list) else [body]):
            tid = t.get("tournament_id")
            if not tid:
                continue
            status2, tdata, _ = await fetch_json(
                session, "GET", f"{BASE_URL}/api/tournaments/{tid}"
            )
            if status2 == 200 and tdata.get("matches"):
                tournament_id = tid
                matches = tdata["matches"]
                # Prefer a qualifier match
                for mk in sorted(matches.keys()):
                    if "lvl1" in mk or "qual" in mk.lower():
                        match_id = mk
                        break
                if not match_id:
                    match_id = list(matches.keys())[0]
                break

        if not tournament_id or not match_id:
            raise SystemExit("Không tìm thấy giải đấu/trận đấu phù hợp trên staging")

        print(f"✔ Giải đấu: {tournament_id}")
        print(f"✔ Trận đấu: {match_id}")

    # Step 3: Run staged load tests
    stages = [
        {"name": "GIAI ĐOẠN 1: 500 sinh viên đồng thời", "concurrency": 500, "users": 500},
        {"name": "GIAI ĐOẠN 2: 1.000 sinh viên đồng thời", "concurrency": 1000, "users": 1000},
        {"name": "GIAI ĐOẠN 3: 2.000 sinh viên đồng thời", "concurrency": 2000, "users": 2000},
        {"name": "GIAI ĐOẠN 4: 4.000 sinh viên (FULL CAPACITY)", "concurrency": 4000, "users": 4000},
    ]

    all_results: List[Dict[str, Any]] = []

    for stage in stages:
        print(f"\n{'─' * 80}")
        print(f">>> {stage['name']} ({stage['users']} users, {stage['concurrency']} concurrent)")
        print(f"{'─' * 80}")

        await asyncio.sleep(2.0)  # cooldown between stages

        result = await run_stage(
            stage_name=stage["name"],
            concurrency=stage["concurrency"],
            user_count=stage["users"],
            tournament_id=tournament_id,
            match_id=match_id,
        )

        summary = result.summary()

        print(f"  ⏱ Thời gian: {summary['elapsed_seconds']}s")
        print(f"  ⚡ Throughput: {summary['throughput_rps']} req/s")
        print(f"  ✔ Thành công: {summary['success_count']}/{summary['total_requests']}")
        print(f"  ❌ Lỗi: {summary['error_count']} ({summary['error_rate_pct']}%)")

        overall = summary["latency_overall"]
        print(f"  📊 Độ trễ tổng: avg={overall['avg']}ms | p50={overall['p50']}ms | "
              f"p95={overall['p95']}ms | p99={overall['p99']}ms | max={overall['max']}ms")

        sub_lats = summary["latency_submit"]
        print(f"  📝 Nộp bài: avg={sub_lats['avg']}ms | p95={sub_lats['p95']}ms | p99={sub_lats['p99']}ms")

        if summary["error_breakdown"]:
            print(f"  🔍 Chi tiết lỗi: {json.dumps(summary['error_breakdown'], ensure_ascii=False)}")

        all_results.append(summary)

    # Step 4: Queue drain measurement
    print(f"\n{'─' * 80}")
    print(">>> ĐO THỜI GIAN DRAIN QUEUE (chờ tối đa 5 phút)")
    print(f"{'─' * 80}")

    if admin_token:
        async with aiohttp.ClientSession() as session:
            drain_info = await check_queue_drain(session, admin_token, max_wait=300)
            print(f"  Queue drain: {'✔ Hoàn thành' if drain_info['drain_complete'] else '⚠ Chưa drain hết'}")
            print(f"  Thời gian drain: {drain_info['drain_time_seconds']}s")
            print(f"  Queue depth cực đại: {drain_info['max_queue_depth']}")
    else:
        drain_info = {"drain_complete": None, "note": "Admin token unavailable"}
        print("  ⚠ Không có admin token, không thể đo queue drain")

    # Step 5: Generate final report
    print(f"\n{'=' * 80}")
    print("  TỔNG KẾT KIỂM THỬ TẢI")
    print(f"{'=' * 80}")
    print(f"{'Mức tải':<35} | {'Requests':<9} | {'RPS':<8} | {'p50(ms)':<8} | {'p95(ms)':<8} | {'p99(ms)':<8} | {'Lỗi':<8}")
    print("-" * 95)

    for r in all_results:
        o = r["latency_overall"]
        print(f"{r['stage_name'][:35]:<35} | {r['total_requests']:<9} | "
              f"{r['throughput_rps']:<8} | {o['p50']:<8} | {o['p95']:<8} | "
              f"{o['p99']:<8} | {r['error_rate_pct']:<7}%")
    print("=" * 95)

    # Save JSON report
    report = {
        "benchmark_timestamp": datetime.now(timezone.utc).isoformat(),
        "target_url": BASE_URL,
        "stages": all_results,
        "queue_drain": drain_info,
        "verdict": "PASS" if all(r["error_rate_pct"] < 5.0 for r in all_results) else "NEEDS_REVIEW",
    }

    report_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                               "docs", "benchmark_metrics.json")
    os.makedirs(os.path.dirname(report_file), exist_ok=True)
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\n✔ Báo cáo đã lưu vào {report_file}")

    if report["verdict"] == "PASS":
        print("\n🎉 KẾT QUẢ: PASS — Tỷ lệ lỗi dưới 5% ở tất cả các mức tải")
    else:
        print("\n⚠ KẾT QUẢ: NEEDS_REVIEW — Cần xem xét lỗi và tối ưu")


if __name__ == "__main__":
    asyncio.run(main())

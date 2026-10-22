# -*- coding: utf-8 -*-
"""Read-only staging load generator; does not measure submission or judge throughput."""

import asyncio
import time
import sys
import os
import statistics
import json
from typing import List, Dict, Any

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

try:
    import aiohttp
except ImportError:
    print("Vui lòng cài đặt aiohttp: pip install aiohttp")
    sys.exit(1)

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

BASE_URL = os.getenv("BENCHMARK_BASE_URL", "").rstrip("/")

class BenchmarkResult:
    def __init__(self, concurrency: int, total_requests: int):
        self.concurrency = concurrency
        self.total_requests = total_requests
        self.success_count = 0
        self.error_count = 0
        self.latencies: List[float] = [] # in milliseconds
        self.elapsed_time = 0.0
        self.rps = 0.0
        self.cpu_before = 0.0
        self.cpu_after = 0.0
        self.mem_before_mb = 0.0
        self.mem_after_mb = 0.0

    def compute_stats(self):
        if self.elapsed_time > 0:
            self.rps = len(self.latencies) / self.elapsed_time
        if not self.latencies:
            return

        self.latencies.sort()
        n = len(self.latencies)
        self.min_lat = min(self.latencies)
        self.max_lat = max(self.latencies)
        self.avg_lat = statistics.mean(self.latencies)
        self.p50 = self.latencies[int(n * 0.50)]
        self.p90 = self.latencies[int(n * 0.90)]
        self.p95 = self.latencies[int(n * 0.95)]
        self.p99 = self.latencies[min(int(n * 0.99), n - 1)]



async def run_stage_benchmark(concurrency: int, total_requests: int, endpoint_mix: List[dict]) -> BenchmarkResult:
    res = BenchmarkResult(concurrency, total_requests)

    if HAS_PSUTIL:
        res.cpu_before = psutil.cpu_percent(interval=None)
        res.mem_before_mb = psutil.Process(os.getpid()).memory_info().rss / (1024 * 1024)

    # Cấu hình TCP connector với Connection Pooling quy mô lớn
    connector = aiohttp.TCPConnector(
        limit=concurrency + 200,
        limit_per_host=concurrency + 200,
        enable_cleanup_closed=True,
        force_close=False,
        keepalive_timeout=30
    )

    t_start = time.perf_counter()
    async with aiohttp.ClientSession(connector=connector) as session:
        sem = asyncio.Semaphore(concurrency)

        async def bounded_request(req_info):
            async with sem:
                url = f"{BASE_URL}{req_info['path']}"
                method = req_info.get("method", "GET")
                payload = req_info.get("payload")
                headers = req_info.get("headers")
                
                t0 = time.perf_counter()
                try:
                    if method == "GET":
                        async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=20)) as resp:
                            await resp.read()
                            lat = (time.perf_counter() - t0) * 1000.0
                            ok = resp.status in (200, 304)
                            return ok, lat, resp.status
                    else:
                        async with session.post(url, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=20)) as resp:
                            await resp.read()
                            lat = (time.perf_counter() - t0) * 1000.0
                            ok = resp.status in (200, 201, 202)
                            return ok, lat, resp.status
                except Exception:
                    lat = (time.perf_counter() - t0) * 1000.0
                    return False, lat, 0

        tasks = []
        for i in range(total_requests):
            req_info = endpoint_mix[i % len(endpoint_mix)]
            tasks.append(bounded_request(req_info))

        results = await asyncio.gather(*tasks, return_exceptions=False)
        res.elapsed_time = time.perf_counter() - t_start

        for ok, lat, status_code in results:
            if ok:
                res.success_count += 1
            else:
                res.error_count += 1
            res.latencies.append(lat)

    if HAS_PSUTIL:
        res.cpu_after = psutil.cpu_percent(interval=None)
        res.mem_after_mb = psutil.Process(os.getpid()).memory_info().rss / (1024 * 1024)

    res.compute_stats()
    return res

async def main():
    # A load generator must never discover and mutate a live tournament by default.
    if os.getenv("BENCHMARK_CONFIRM_STAGING") != "YES" or not BASE_URL:
        raise SystemExit("Set BENCHMARK_BASE_URL to an isolated staging server and BENCHMARK_CONFIRM_STAGING=YES.")
    if any(host in BASE_URL.lower() for host in ("arena.13.250.49.111.sslip.io", "game-project-3.phanhieu06hungyen.workers.dev")):
        raise SystemExit("Refusing to load-test the production arena.")
    print("=" * 75)
    print("READ-ONLY STAGING LOAD: 1,000 → 2,000 → 4,000 concurrent requests")
    print(f"   Target URL: {BASE_URL}")
    print("=" * 75)

    # Find a staging tournament with readable data.
    async with aiohttp.ClientSession() as s:
        async with s.get(f"{BASE_URL}/api/tournaments") as r:
            assert r.status == 200, "Không thể kết nối đến máy chủ"
            tourns = await r.json()
            assert len(tourns) > 0, "Không có giải đấu"
            
            # Chọn giải đấu có sẵn dữ liệu trận đấu
            target_t = None
            for item in tourns:
                tid = item.get("tournament_id")
                async with s.get(f"{BASE_URL}/api/tournaments/{tid}") as tr:
                    if tr.status == 200:
                        td = await tr.json()
                        if td.get("matches") and "m_lvl1_1" in td["matches"]:
                            target_t = td
                            break
            if not target_t:
                target_t = tourns[0]
            t_id = target_t.get("tournament_id")

    # Read-only traffic only. Submission load requires separate test identities and fixtures.
    # Read-only requests only. This does not test login, submission, or queue drain.
    test_headers = {"X-Benchmark-Test": "true"}
    endpoint_mix = [
        {"path": f"/api/tournaments/{t_id}", "method": "GET", "headers": test_headers},
        {"path": f"/api/tournaments/{t_id}", "method": "GET", "headers": test_headers},
        {"path": f"/api/tournaments/{t_id}", "method": "GET", "headers": test_headers},
        {"path": f"/api/tournaments/{t_id}", "method": "GET", "headers": test_headers},
        {"path": "/api/tournaments", "method": "GET", "headers": test_headers},
        {"path": "/api/tournaments", "method": "GET", "headers": test_headers},
        {"path": "/health", "method": "GET", "headers": test_headers},
        {"path": "/health", "method": "GET", "headers": test_headers},
    ]

    stages = [
        {"concurrency": 1000, "requests": 2000, "name": "GIAI ĐOẠN 1: 1.000 VUs ĐỒNG THỜI"},
        {"concurrency": 2000, "requests": 4000, "name": "GIAI ĐOẠN 2: 2.000 VUs ĐỒNG THỜI"},
        {"concurrency": 4000, "requests": 8000, "name": "GIAI ĐOẠN 3: 4.000 VUs ĐỒNG THỜI (BURST THI ĐẤU QUY MÔ LỚN)"}
    ]

    all_results: List[BenchmarkResult] = []

    for stage in stages:
        c = stage["concurrency"]
        reqs = stage["requests"]
        print(f"\n>>> ĐANG CHẠY: {stage['name']} ({c} VUs, {reqs} requests)...")
        time.sleep(1.0) # Warmup cooldown
        res = await run_stage_benchmark(c, reqs, endpoint_mix)
        all_results.append(res)
        
        err_pct = (res.error_count / res.total_requests) * 100.0 if res.total_requests else 0.0
        print(f"    ✔ Hoàn thành: {res.success_count}/{res.total_requests} requests ({res.elapsed_time:.2f}s)")
        print(f"    ⚡ Throughput (RPS): {res.rps:.1f} req/s")
        print(f"    ⏱ Độ trễ trung bình: {res.avg_lat:.2f}ms | p50: {res.p50:.2f}ms | p95: {res.p95:.2f}ms | p99: {res.p99:.2f}ms")
        print(f"    ❌ Tỷ lệ lỗi: {err_pct:.2f}% | RAM test process: {res.mem_after_mb:.1f} MB")

    print("\n" + "=" * 75)
    print("READ-ONLY STAGING RESULT — NOT A SUBMISSION OR JUDGING CAPACITY TEST")
    print("=" * 75)
    print(f"{'Mức Tải (VUs)':<16} | {'Tổng Req':<10} | {'Throughput (RPS)':<18} | {'p50 (ms)':<10} | {'p95 (ms)':<10} | {'p99 (ms)':<10} | {'Tỷ Lệ Lỗi':<10}")
    print("-" * 95)
    for r in all_results:
        err_pct = (r.error_count / r.total_requests) * 100.0 if r.total_requests else 0.0
        print(f"{r.concurrency:<16} | {r.total_requests:<10} | {r.rps:<18.1f} | {r.p50:<10.2f} | {r.p95:<10.2f} | {r.p99:<10.2f} | {err_pct:<9.2f}%")
    print("=" * 75)

    # Lưu kết quả dạng JSON để phục vụ xuất báo cáo
    results_data = [
        {
            "concurrency": r.concurrency,
            "total_requests": r.total_requests,
            "success_count": r.success_count,
            "error_count": r.error_count,
            "error_rate_pct": round((r.error_count / r.total_requests) * 100.0, 2),
            "throughput_rps": round(r.rps, 1),
            "elapsed_seconds": round(r.elapsed_time, 2),
            "latency_min_ms": round(r.min_lat, 2),
            "latency_avg_ms": round(r.avg_lat, 2),
            "latency_p50_ms": round(r.p50, 2),
            "latency_p90_ms": round(r.p90, 2),
            "latency_p95_ms": round(r.p95, 2),
            "latency_p99_ms": round(r.p99, 2),
            "latency_max_ms": round(r.max_lat, 2)
        }
        for r in all_results
    ]
    report_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "benchmark_metrics.json")
    os.makedirs(os.path.dirname(report_file), exist_ok=True)
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(results_data, f, ensure_ascii=False, indent=2)
    print(f"✔ Đã lưu số liệu benchmark vào {report_file}")

if __name__ == "__main__":
    asyncio.run(main())

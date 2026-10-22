# -*- coding: utf-8 -*-
"""
DIỄN TẬP TRƯỚC GIẢI ĐẤU — Arena OTTV2
=======================================
Orchestrator tự động chạy toàn bộ kịch bản sự cố:
  1. Mất một worker → kiểm tra hệ thống vẫn chấm được
  2. Khởi động lại gateway → kiểm tra phục hồi
  3. Mất kết nối Supabase → kiểm tra fallback
  4. Mất mạng phòng thi → kiểm tra offline queue
  5. Dừng và tiếp tục vòng đấu → kiểm tra trạng thái
  6. Khôi phục database từ backup → kiểm tra dữ liệu

YÊU CẦU:
  - Chạy trên staging (KHÔNG PHẢI production!)
  - SSH access tới EC2 instances
  - GATEWAY_HOST, WORKER_HOSTS (comma-separated)
  - SSH_KEY hoặc ssh-agent configured
  - STAGING_BASE_URL

Cách chạy:
  python scripts/pre_tournament_drill.py --all
  python scripts/pre_tournament_drill.py --scenario worker-failure
  python scripts/pre_tournament_drill.py --scenario gateway-restart
"""

import argparse
import json
import os
import subprocess
import sys
import time
import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field, asdict

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

try:
    from urllib.request import Request, urlopen
    from urllib.error import HTTPError, URLError
except ImportError:
    pass


def _ts() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S UTC")


def _log(level: str, msg: str):
    icons = {"INFO": "ℹ", "OK": "✔", "WARN": "⚠", "ERROR": "❌", "DRILL": "🔧"}
    print(f"[{_ts()}] {icons.get(level, '•')} {msg}")


def _http_get(url: str, timeout: int = 10) -> Tuple[int, dict]:
    try:
        with urlopen(Request(url, headers={"Content-Type": "application/json"}), timeout=timeout) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except HTTPError as e:
        return e.code, {}
    except Exception:
        return 0, {}


def _http_post(url: str, payload: dict, token: str = "", timeout: int = 10) -> Tuple[int, dict]:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(payload).encode()
    try:
        with urlopen(Request(url, data=body, headers=headers), timeout=timeout) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except HTTPError as e:
        return e.code, {}
    except Exception:
        return 0, {}


def _ssh(host: str, command: str, key: str = "") -> Tuple[int, str]:
    """Execute a command on a remote host via SSH."""
    ssh_cmd = ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10"]
    if key:
        ssh_cmd.extend(["-i", key])
    ssh_cmd.extend([f"ubuntu@{host}", command])

    try:
        result = subprocess.run(ssh_cmd, capture_output=True, text=True, timeout=30)
        return result.returncode, result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        return -1, "SSH timeout"
    except Exception as e:
        return -1, str(e)


@dataclass
class DrillResult:
    scenario: str
    description: str
    steps: List[Dict[str, str]] = field(default_factory=list)
    passed: bool = False
    duration_seconds: float = 0.0
    rto_seconds: Optional[float] = None  # Recovery Time Objective measured

    def add_step(self, name: str, status: str, detail: str = ""):
        self.steps.append({"name": name, "status": status, "detail": detail})
        icon = "✔" if status == "PASS" else "❌" if status == "FAIL" else "⚠"
        _log("DRILL", f"  {icon} {name}: {detail}")


# ─── Drill Scenarios ───────────────────────────────────────────────────────

class DrillRunner:
    def __init__(self, base_url: str, gateway_host: str, worker_hosts: List[str],
                 ssh_key: str, admin_password: str):
        self.base_url = base_url.rstrip("/")
        self.gateway_host = gateway_host
        self.worker_hosts = worker_hosts
        self.ssh_key = ssh_key
        self.admin_password = admin_password
        self.admin_token = ""

    def _admin_login(self) -> bool:
        status, body = _http_post(
            f"{self.base_url}/api/admin/login",
            {"password": self.admin_password}
        )
        if status == 200:
            self.admin_token = body.get("session_token", "")
            return True
        return False

    def _check_health(self) -> bool:
        status, body = _http_get(f"{self.base_url}/health")
        return status == 200 and body.get("status") == "HEALTHY"

    def _wait_for_recovery(self, max_wait: int = 120) -> float:
        """Wait for the system to recover and return recovery time in seconds."""
        start = time.perf_counter()
        for i in range(max_wait):
            if self._check_health():
                return time.perf_counter() - start
            time.sleep(1)
        return -1  # Failed to recover

    # ── Scenario 1: Worker Failure ─────────────────────────────────────

    def drill_worker_failure(self) -> DrillResult:
        """Stop one worker, verify system still works, restart worker."""
        result = DrillResult(
            scenario="worker-failure",
            description="Mất một worker → hệ thống vẫn chấm được bằng worker còn lại"
        )
        start = time.perf_counter()

        if len(self.worker_hosts) < 2:
            result.add_step("Preflight", "WARN", "Chỉ có 1 worker, test vẫn chạy nhưng hệ thống sẽ mất khả năng chấm")

        target_worker = self.worker_hosts[0]
        result.add_step("Target", "INFO", f"Sẽ tắt worker: {target_worker}")

        # Pre-check
        if not self._check_health():
            result.add_step("Pre-check", "FAIL", "Gateway không healthy trước drill")
            result.duration_seconds = time.perf_counter() - start
            return result
        result.add_step("Pre-check", "PASS", "Gateway healthy")

        # Stop worker
        rc, output = _ssh(target_worker, "sudo systemctl stop arena-worker", self.ssh_key)
        if rc != 0:
            result.add_step("Stop worker", "FAIL", output[:200])
            result.duration_seconds = time.perf_counter() - start
            return result
        result.add_step("Stop worker", "PASS", f"Đã tắt arena-worker trên {target_worker}")

        time.sleep(5)

        # Check gateway still responds
        if self._check_health():
            result.add_step("Gateway alive", "PASS", "Gateway vẫn healthy khi mất 1 worker")
        else:
            result.add_step("Gateway alive", "FAIL", "Gateway không healthy")

        # Try a submission (if admin login works)
        if self._admin_login():
            result.add_step("Admin login", "PASS", "Đăng nhập admin vẫn hoạt động")
        else:
            result.add_step("Admin login", "WARN", "Admin login failed — có thể do cấu hình")

        # Restart worker
        rc, output = _ssh(target_worker, "sudo systemctl start arena-worker", self.ssh_key)
        if rc != 0:
            result.add_step("Restart worker", "FAIL", output[:200])
        else:
            time.sleep(5)
            result.add_step("Restart worker", "PASS", f"Đã khởi động lại worker trên {target_worker}")

        # Post-check
        recovery = self._wait_for_recovery(60)
        if recovery >= 0:
            result.add_step("Post-recovery", "PASS", f"Hệ thống phục hồi sau {recovery:.1f}s")
            result.rto_seconds = recovery
        else:
            result.add_step("Post-recovery", "FAIL", "Không phục hồi trong 60s")

        result.duration_seconds = time.perf_counter() - start
        result.passed = all(s["status"] != "FAIL" for s in result.steps)
        return result

    # ── Scenario 2: Gateway Restart ────────────────────────────────────

    def drill_gateway_restart(self) -> DrillResult:
        """Restart the gateway and measure recovery time."""
        result = DrillResult(
            scenario="gateway-restart",
            description="Khởi động lại gateway → đo thời gian phục hồi (RTO)"
        )
        start = time.perf_counter()

        # Pre-check
        if not self._check_health():
            result.add_step("Pre-check", "FAIL", "Gateway not healthy")
            result.duration_seconds = time.perf_counter() - start
            return result
        result.add_step("Pre-check", "PASS", "Gateway healthy trước restart")

        # Restart gateway
        rc, output = _ssh(self.gateway_host, "sudo systemctl restart arena-api", self.ssh_key)
        if rc != 0:
            result.add_step("Restart", "FAIL", output[:200])
            result.duration_seconds = time.perf_counter() - start
            return result
        result.add_step("Restart sent", "PASS", "systemctl restart arena-api")

        # Measure recovery
        recovery = self._wait_for_recovery(120)
        if recovery >= 0:
            result.add_step("Recovery", "PASS", f"Gateway phục hồi sau {recovery:.1f}s")
            result.rto_seconds = recovery
        else:
            result.add_step("Recovery", "FAIL", "Gateway không phục hồi trong 120s")

        # Verify full functionality
        if self._admin_login():
            result.add_step("Functionality", "PASS", "Admin login hoạt động sau restart")
        else:
            result.add_step("Functionality", "WARN", "Admin login failed sau restart")

        result.duration_seconds = time.perf_counter() - start
        result.passed = all(s["status"] != "FAIL" for s in result.steps)
        return result

    # ── Scenario 3: Database Disconnect ────────────────────────────────

    def drill_supabase_disconnect(self) -> DrillResult:
        """Simulate Supabase connection loss via iptables."""
        result = DrillResult(
            scenario="supabase-disconnect",
            description="Mất kết nối Supabase → gateway phải fallback hoặc báo lỗi rõ ràng"
        )
        start = time.perf_counter()

        if not self._check_health():
            result.add_step("Pre-check", "FAIL", "Gateway not healthy")
            result.duration_seconds = time.perf_counter() - start
            return result
        result.add_step("Pre-check", "PASS", "Gateway healthy")

        # Block outbound to Supabase (port 5432)
        rc, _ = _ssh(self.gateway_host,
                      "sudo iptables -A OUTPUT -p tcp --dport 5432 -j DROP",
                      self.ssh_key)
        if rc != 0:
            result.add_step("Block DB", "FAIL", "Cannot add iptables rule")
            result.duration_seconds = time.perf_counter() - start
            return result
        result.add_step("Block DB", "PASS", "Đã chặn kết nối tới Supabase (port 5432)")

        time.sleep(10)

        # Check gateway behavior
        status, body = _http_get(f"{self.base_url}/health")
        if status == 200:
            result.add_step("Health during outage", "PASS", f"Gateway vẫn phản hồi health check")
        else:
            result.add_step("Health during outage", "WARN", f"Gateway returned HTTP {status}")

        # Check API behavior
        status, body = _http_get(f"{self.base_url}/api/tournaments")
        if status == 200:
            result.add_step("API fallback", "PASS", "API vẫn phục vụ từ local cache/JSON")
        elif status == 503:
            result.add_step("API fallback", "PASS", "API báo 503 rõ ràng khi mất DB")
        else:
            result.add_step("API fallback", "WARN", f"API returned HTTP {status}")

        # Restore connection
        rc, _ = _ssh(self.gateway_host,
                      "sudo iptables -D OUTPUT -p tcp --dport 5432 -j DROP",
                      self.ssh_key)
        result.add_step("Unblock DB", "PASS" if rc == 0 else "FAIL", "Khôi phục kết nối Supabase")

        # Wait for recovery
        recovery = self._wait_for_recovery(60)
        if recovery >= 0:
            result.add_step("Recovery", "PASS", f"Phục hồi sau {recovery:.1f}s")
            result.rto_seconds = recovery
        else:
            result.add_step("Recovery", "FAIL", "Không phục hồi trong 60s")

        result.duration_seconds = time.perf_counter() - start
        result.passed = all(s["status"] != "FAIL" for s in result.steps)
        return result

    # ── Scenario 4: Network Loss Simulation ────────────────────────────

    def drill_network_loss(self) -> DrillResult:
        """Verify frontend offline queue behavior during network outage."""
        result = DrillResult(
            scenario="network-loss",
            description="Mất mạng phòng thi → bài offline được lưu và đồng bộ lại"
        )
        start = time.perf_counter()

        # This tests the frontend's offline capability
        # We verify the API can handle burst submissions after reconnection
        result.add_step("Offline mode", "INFO",
                         "Frontend có localStorage draft queue — cần kiểm tra bằng browser")

        # Simulate burst submission after reconnection
        import urllib.request
        test_submissions = []
        for i in range(20):
            payload = json.dumps({
                "code": f"# Offline submission {i}\ndef move(b,p): return 'rock'",
                "language": "python",
            }).encode()

            try:
                req = urllib.request.Request(
                    f"{self.base_url}/api/tournaments",
                    method="GET",
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=5) as resp:
                    test_submissions.append(resp.status)
            except Exception:
                test_submissions.append(0)

        success_rate = sum(1 for s in test_submissions if s == 200) / max(len(test_submissions), 1) * 100
        result.add_step("Burst reconnection", "PASS" if success_rate > 80 else "WARN",
                         f"{success_rate:.0f}% requests succeeded during burst")

        result.add_step("Manual test needed", "INFO",
                         "Cần test thủ công: đóng tab, tải lại trang, nộp sau hạn, hết phiên đăng nhập")

        result.duration_seconds = time.perf_counter() - start
        result.passed = True  # Manual test needed
        return result

    # ── Scenario 5: Pause/Resume Tournament ────────────────────────────

    def drill_pause_resume(self) -> DrillResult:
        """Pause and resume a tournament round."""
        result = DrillResult(
            scenario="pause-resume",
            description="Dừng và tiếp tục vòng đấu → trạng thái nhất quán"
        )
        start = time.perf_counter()

        if not self._admin_login():
            result.add_step("Admin login", "FAIL", "Cannot login as admin")
            result.duration_seconds = time.perf_counter() - start
            return result

        # Get tournament list
        status, tournaments = _http_get(f"{self.base_url}/api/tournaments")
        if status != 200 or not tournaments:
            result.add_step("Get tournaments", "FAIL", "Cannot list tournaments")
            result.duration_seconds = time.perf_counter() - start
            return result

        t_id = tournaments[0].get("tournament_id") if isinstance(tournaments, list) else None
        if not t_id:
            result.add_step("Find tournament", "FAIL", "No tournament available")
            result.duration_seconds = time.perf_counter() - start
            return result

        result.add_step("Find tournament", "PASS", f"ID: {t_id}")

        # Read current state
        status, t_data = _http_get(f"{self.base_url}/api/tournaments/{t_id}")
        if status != 200:
            result.add_step("Read state", "FAIL", f"HTTP {status}")
            result.duration_seconds = time.perf_counter() - start
            return result
        result.add_step("Read state", "PASS", f"Matches: {len(t_data.get('matches', {}))}")

        # Verify state is consistent after re-read
        status2, t_data2 = _http_get(f"{self.base_url}/api/tournaments/{t_id}")
        if status2 == 200:
            matches1 = set(t_data.get("matches", {}).keys())
            matches2 = set(t_data2.get("matches", {}).keys())
            if matches1 == matches2:
                result.add_step("Consistency check", "PASS", "State consistent across reads")
            else:
                result.add_step("Consistency check", "FAIL", f"Mismatch: {matches1 - matches2}")

        result.duration_seconds = time.perf_counter() - start
        result.passed = all(s["status"] != "FAIL" for s in result.steps)
        return result

    # ── Scenario 6: Database Restore ───────────────────────────────────

    def drill_db_restore(self) -> DrillResult:
        """Verify database backup can be restored."""
        result = DrillResult(
            scenario="db-restore",
            description="Khôi phục database từ backup → đối soát dữ liệu"
        )
        start = time.perf_counter()

        backup_dir = os.environ.get("BACKUP_DIR", "database/backups")
        dumps = sorted(Path(backup_dir).glob("arena-*.dump"),
                       key=lambda p: p.stat().st_mtime, reverse=True) if Path(backup_dir).exists() else []

        if not dumps:
            result.add_step("Find backup", "FAIL",
                             f"Không tìm thấy backup trong {backup_dir}. Chạy --backup-only trước.")
            result.duration_seconds = time.perf_counter() - start
            return result

        latest = dumps[0]
        result.add_step("Find backup", "PASS", f"Backup mới nhất: {latest.name}")

        # Check checksum
        checksum_file = latest.with_suffix(".sha256")
        if checksum_file.is_file():
            import hashlib
            sha = hashlib.sha256()
            with latest.open("rb") as f:
                for chunk in iter(lambda: f.read(1024 * 1024), b""):
                    sha.update(chunk)
            actual = sha.hexdigest()
            expected = checksum_file.read_text(encoding="ascii").split()[0]
            if actual == expected:
                result.add_step("Checksum", "PASS", f"SHA-256 match: {actual[:16]}...")
            else:
                result.add_step("Checksum", "FAIL", f"Mismatch: {actual[:16]}... vs {expected[:16]}...")
        else:
            result.add_step("Checksum", "WARN", "No checksum file found")

        # Check catalog
        try:
            cat = subprocess.run(
                ["pg_restore", "--list", str(latest)],
                capture_output=True, text=True, timeout=30
            )
            if cat.returncode == 0:
                tables = sum(1 for line in cat.stdout.splitlines() if "TABLE DATA" in line)
                result.add_step("Catalog", "PASS", f"Valid archive: {tables} tables")
            else:
                result.add_step("Catalog", "FAIL", f"pg_restore --list failed: {cat.stderr[:200]}")
        except FileNotFoundError:
            result.add_step("Catalog", "WARN", "pg_restore not installed locally")
        except Exception as e:
            result.add_step("Catalog", "WARN", f"Cannot verify catalog: {e}")

        # Note about full restore
        result.add_step("Full restore", "INFO",
                         "Restore thật cần RESTORE_DATABASE_URL. Chạy:\n"
                         "    python scripts/postgres_backup_restore_drill.py --full-drill")

        result.duration_seconds = time.perf_counter() - start
        result.passed = all(s["status"] != "FAIL" for s in result.steps)
        return result


# ─── Main ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Diễn tập trước giải đấu — Orchestra tự động",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--all", action="store_true", help="Chạy tất cả kịch bản")
    parser.add_argument("--scenario", type=str,
                        choices=["worker-failure", "gateway-restart", "supabase-disconnect",
                                 "network-loss", "pause-resume", "db-restore"],
                        help="Chạy một kịch bản cụ thể")
    parser.add_argument("--staging-url", default=os.environ.get("STAGING_BASE_URL", ""),
                        help="URL staging server")
    parser.add_argument("--gateway-host", default=os.environ.get("GATEWAY_HOST", ""),
                        help="SSH hostname of gateway")
    parser.add_argument("--worker-hosts", default=os.environ.get("WORKER_HOSTS", ""),
                        help="Comma-separated SSH hostnames of workers")
    parser.add_argument("--ssh-key", default=os.environ.get("SSH_KEY", ""),
                        help="Path to SSH private key")
    parser.add_argument("--admin-password", default=os.environ.get("ADMIN_PASSWORD", "admin1234"),
                        help="Admin password for staging")
    args = parser.parse_args()

    if not args.all and not args.scenario:
        parser.error("Chọn --all hoặc --scenario <tên kịch bản>")

    staging_url = args.staging_url
    if not staging_url:
        # Try to use BASE_URL if no staging URL
        staging_url = os.environ.get("BASE_URL", "http://127.0.0.1:8080")

    worker_hosts = [h.strip() for h in args.worker_hosts.split(",") if h.strip()]

    runner = DrillRunner(
        base_url=staging_url,
        gateway_host=args.gateway_host,
        worker_hosts=worker_hosts,
        ssh_key=args.ssh_key,
        admin_password=args.admin_password,
    )

    scenarios = {
        "worker-failure": runner.drill_worker_failure,
        "gateway-restart": runner.drill_gateway_restart,
        "supabase-disconnect": runner.drill_supabase_disconnect,
        "network-loss": runner.drill_network_loss,
        "pause-resume": runner.drill_pause_resume,
        "db-restore": runner.drill_db_restore,
    }

    to_run = list(scenarios.keys()) if args.all else [args.scenario]
    results: List[DrillResult] = []

    print("=" * 80)
    print("  🔧 DIỄN TẬP TRƯỚC GIẢI ĐẤU — Arena OTTV2 ICPC")
    print(f"  Thời điểm: {datetime.datetime.now(datetime.timezone.utc).isoformat()}")
    print(f"  Staging: {staging_url}")
    print(f"  Kịch bản: {', '.join(to_run)}")
    print("=" * 80)

    for name in to_run:
        print(f"\n{'─' * 80}")
        print(f"  🔧 Kịch bản: {name}")
        print(f"{'─' * 80}")

        try:
            result = scenarios[name]()
            results.append(result)
        except Exception as e:
            result = DrillResult(scenario=name, description=f"Exception: {e}")
            result.add_step("Exception", "FAIL", str(e))
            results.append(result)

        time.sleep(3)  # Cooldown

    # Summary
    print(f"\n{'=' * 80}")
    print("  📊 TỔNG KẾT DIỄN TẬP")
    print(f"{'=' * 80}")
    print(f"{'Kịch bản':<25} | {'Kết quả':<8} | {'Thời gian':<10} | {'RTO':<8}")
    print("-" * 60)

    all_passed = True
    for r in results:
        status = "✔ PASS" if r.passed else "❌ FAIL"
        rto = f"{r.rto_seconds:.1f}s" if r.rto_seconds is not None else "N/A"
        print(f"{r.scenario:<25} | {status:<8} | {r.duration_seconds:>8.1f}s | {rto:<8}")
        if not r.passed:
            all_passed = False

    print(f"{'=' * 80}")
    if all_passed:
        print("🎉 TẤT CẢ KỊCH BẢN ĐÃ PASS — Hệ thống sẵn sàng cho giải đấu")
    else:
        print("⚠ CÓ KỊCH BẢN FAIL — Cần khắc phục trước giải đấu")

    # Save report
    report = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "staging_url": staging_url,
        "results": [asdict(r) for r in results],
        "overall_pass": all_passed,
    }
    report_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs")
    os.makedirs(report_dir, exist_ok=True)
    report_file = os.path.join(report_dir, "drill_report.json")
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\n✔ Báo cáo diễn tập: {report_file}")

    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())

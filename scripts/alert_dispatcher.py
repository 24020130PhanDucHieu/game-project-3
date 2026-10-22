# -*- coding: utf-8 -*-
"""
GIÁM SÁT VÀ CẢNH BÁO TỰ ĐỘNG — Arena OTTV2
=============================================
Chạy kiểm tra sức khỏe định kỳ và gửi cảnh báo qua webhook.
Hỗ trợ: Discord, Telegram, Slack, Webhook tùy chỉnh.

Chế độ hoạt động:
  1. --check-once    : Kiểm tra một lần và thoát
  2. --daemon        : Chạy liên tục, kiểm tra mỗi N giây
  3. --install-cron  : Tạo systemd timer trên EC2

YÊU CẦU:
  - BASE_URL=<URL gateway>
  - ADMIN_PASSWORD=<mật khẩu admin>
  - ALERT_WEBHOOK_URL=<Discord/Telegram/Slack webhook>
  - BACKUP_DIR=<thư mục backup> (tùy chọn)

Cách chạy:
  python scripts/alert_dispatcher.py --check-once
  python scripts/alert_dispatcher.py --daemon --interval 120
"""

import argparse
import glob
import json
import os
import signal
import sys
import time
import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from typing import List, Dict, Optional

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass


def _ts() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def _log(level: str, msg: str):
    print(f"[{_ts()}] [{level}] {msg}")


# ─── HTTP Utilities ────────────────────────────────────────────────────────

def fetch_json(url: str, *, token: str = "", payload: dict = None,
               timeout: int = 10) -> dict:
    body = json.dumps(payload).encode() if payload is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        with urlopen(Request(url, data=body, headers=headers), timeout=timeout) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except HTTPError as e:
        if e.code == 401:
            raise RuntimeError("Admin token expired or invalid")
        raise


# ─── Alert Collection ──────────────────────────────────────────────────────

class HealthChecker:
    """Collect system health alerts from the Arena gateway."""

    def __init__(self, base_url: str, admin_token: str, backup_dir: str = ""):
        self.base_url = base_url.rstrip("/")
        self.token = admin_token
        self.backup_dir = backup_dir
        self.last_check_time: Optional[str] = None
        self.consecutive_failures = 0

    def check(self) -> List[Dict[str, str]]:
        """Run all health checks and return a list of alerts."""
        alerts = []
        self.last_check_time = _ts()

        # 1. Gateway health
        try:
            data = fetch_json(f"{self.base_url}/health", timeout=5)
            if data.get("status") != "HEALTHY":
                alerts.append({
                    "severity": "CRITICAL",
                    "component": "gateway",
                    "message": f"Gateway status: {data.get('status', 'UNKNOWN')}",
                })
            else:
                mem_mb = data.get("memory_alloc_mb", 0)
                goroutines = data.get("goroutines", 0)
                if mem_mb > 150:
                    alerts.append({
                        "severity": "WARNING",
                        "component": "gateway",
                        "message": f"Gateway memory cao: {mem_mb:.1f} MB",
                    })
                if goroutines > 1000:
                    alerts.append({
                        "severity": "WARNING",
                        "component": "gateway",
                        "message": f"Gateway goroutines cao: {goroutines}",
                    })
        except Exception as e:
            alerts.append({
                "severity": "CRITICAL",
                "component": "gateway",
                "message": f"Gateway health failed: {e}",
            })
            self.consecutive_failures += 1
            return alerts  # Cannot continue if gateway is down

        # 2. Admin monitoring data
        try:
            data = fetch_json(f"{self.base_url}/api/admin/monitoring", token=self.token, timeout=10)
        except RuntimeError as e:
            alerts.append({
                "severity": "CRITICAL",
                "component": "auth",
                "message": str(e),
            })
            return alerts
        except Exception as e:
            alerts.append({
                "severity": "CRITICAL",
                "component": "monitoring",
                "message": f"Monitoring API unavailable: {e}",
            })
            return alerts

        # 3. Database health
        db_info = data.get("database", {})
        if db_info.get("status") != "READY":
            alerts.append({
                "severity": "CRITICAL",
                "component": "database",
                "message": f"Database status: {db_info.get('status', 'UNKNOWN')}",
            })
        else:
            pool_open = db_info.get("pool_open", 0)
            pool_max = db_info.get("pool_max_open", 0)
            if pool_max > 0 and pool_open / pool_max > 0.85:
                alerts.append({
                    "severity": "CRITICAL",
                    "component": "database",
                    "message": f"Connection pool sắp cạn: {pool_open}/{pool_max}",
                })

        # 4. Worker pool health
        pool = data.get("worker_pool", {})
        if pool.get("status") != "READY":
            alerts.append({
                "severity": "CRITICAL",
                "component": "worker_pool",
                "message": f"Worker pool status: {pool.get('status', 'UNKNOWN')}",
            })
        for node in pool.get("nodes", []):
            if node.get("status") != "READY":
                alerts.append({
                    "severity": "CRITICAL",
                    "component": "worker",
                    "message": f"Worker {node.get('host', '?')} is {node.get('status', 'UNKNOWN')}",
                })
            # Check response time
            avg_ms = node.get("avg_response_ms", 0)
            if avg_ms > 5000:
                alerts.append({
                    "severity": "WARNING",
                    "component": "worker",
                    "message": f"Worker {node.get('host', '?')} slow: {avg_ms:.0f}ms avg",
                })

        # 5. Queue backlog
        queue = data.get("queue", {})
        if queue.get("status") != "READY":
            alerts.append({
                "severity": "CRITICAL",
                "component": "queue",
                "message": "Submission queue unavailable",
            })
        else:
            counts = queue.get("counts", {})
            queued = counts.get("validation_QUEUED", 0)
            failed = counts.get("validation_FAILED", 0)
            if queued > 50:
                alerts.append({
                    "severity": "WARNING",
                    "component": "queue",
                    "message": f"{queued} bài đang chờ chấm",
                })
            if failed > 10:
                alerts.append({
                    "severity": "WARNING",
                    "component": "queue",
                    "message": f"{failed} bài chấm lỗi",
                })

        # 6. Backup freshness
        if self.backup_dir:
            dump_files = glob.glob(str(Path(self.backup_dir) / "*.dump"))
            if not dump_files:
                alerts.append({
                    "severity": "CRITICAL",
                    "component": "backup",
                    "message": "Không tìm thấy bản sao lưu nào",
                })
            else:
                newest_age = time.time() - max(os.path.getmtime(f) for f in dump_files)
                if newest_age > 86400:  # 24 hours
                    hours = newest_age / 3600
                    alerts.append({
                        "severity": "CRITICAL",
                        "component": "backup",
                        "message": f"Backup cũ nhất đã {hours:.0f} giờ (> 24h)",
                    })

        if not alerts:
            self.consecutive_failures = 0
        else:
            self.consecutive_failures += 1

        return alerts


# ─── Webhook Dispatchers ──────────────────────────────────────────────────

def format_alert_text(alerts: List[Dict[str, str]], base_url: str) -> str:
    """Format alerts as human-readable text."""
    lines = [f"🚨 Arena Monitoring — {_ts()}"]
    lines.append(f"Gateway: {base_url}")
    lines.append("")

    critical = [a for a in alerts if a["severity"] == "CRITICAL"]
    warnings = [a for a in alerts if a["severity"] == "WARNING"]

    if critical:
        lines.append("🔴 CRITICAL:")
        for a in critical:
            lines.append(f"  • [{a['component']}] {a['message']}")
    if warnings:
        lines.append("🟡 WARNING:")
        for a in warnings:
            lines.append(f"  • [{a['component']}] {a['message']}")

    return "\n".join(lines)


def send_discord(webhook_url: str, text: str):
    """Send alert to Discord webhook."""
    # Discord has a 2000 char limit
    if len(text) > 1950:
        text = text[:1950] + "…"
    fetch_json(webhook_url, payload={"content": text}, timeout=10)


def send_telegram(bot_token: str, chat_id: str, text: str):
    """Send alert to Telegram bot."""
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    fetch_json(url, payload={
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown",
    }, timeout=10)


def send_slack(webhook_url: str, text: str):
    """Send alert to Slack webhook."""
    fetch_json(webhook_url, payload={"text": text}, timeout=10)


def dispatch_alerts(alerts: List[Dict[str, str]], base_url: str):
    """Send alerts to all configured channels."""
    if not alerts:
        return

    text = format_alert_text(alerts, base_url)

    # Discord
    discord_url = os.environ.get("ALERT_WEBHOOK_URL") or os.environ.get("DISCORD_WEBHOOK_URL")
    if discord_url:
        try:
            send_discord(discord_url, text)
            _log("INFO", "  ✔ Đã gửi cảnh báo qua Discord")
        except Exception as e:
            _log("ERROR", f"  ❌ Discord webhook failed: {e}")

    # Telegram
    tg_token = os.environ.get("TELEGRAM_BOT_TOKEN")
    tg_chat = os.environ.get("TELEGRAM_CHAT_ID")
    if tg_token and tg_chat:
        try:
            send_telegram(tg_token, tg_chat, text)
            _log("INFO", "  ✔ Đã gửi cảnh báo qua Telegram")
        except Exception as e:
            _log("ERROR", f"  ❌ Telegram failed: {e}")

    # Slack
    slack_url = os.environ.get("SLACK_WEBHOOK_URL")
    if slack_url:
        try:
            send_slack(slack_url, text)
            _log("INFO", "  ✔ Đã gửi cảnh báo qua Slack")
        except Exception as e:
            _log("ERROR", f"  ❌ Slack webhook failed: {e}")

    # If no webhook configured, just print
    if not (discord_url or (tg_token and tg_chat) or slack_url):
        _log("WARN", "  Không có ALERT_WEBHOOK_URL, TELEGRAM_BOT_TOKEN, hoặc SLACK_WEBHOOK_URL")
        _log("WARN", "  Cảnh báo chỉ in ra console")
    

# ─── Systemd Timer Installer ──────────────────────────────────────────────

WATCHDOG_SERVICE = """[Unit]
Description=Arena health check watchdog
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User=root
EnvironmentFile=/etc/arena/backend.env
Environment=BASE_URL=http://127.0.0.1:8080
Environment=BACKUP_DIR=/var/backups/arena
ExecStart=/usr/bin/python3 /opt/arena/app/scripts/alert_dispatcher.py --check-once
TimeoutStartSec=60
"""

WATCHDOG_TIMER = """[Unit]
Description=Arena health check every 2 minutes

[Timer]
OnCalendar=*:0/2
Persistent=true
Unit=arena-watchdog.service

[Install]
WantedBy=timers.target
"""

def install_systemd_timer():
    """Install systemd timer for periodic health checks."""
    import subprocess

    service_path = Path("/etc/systemd/system/arena-watchdog.service")
    timer_path = Path("/etc/systemd/system/arena-watchdog.timer")

    service_path.write_text(WATCHDOG_SERVICE, encoding="utf-8")
    timer_path.write_text(WATCHDOG_TIMER, encoding="utf-8")

    subprocess.run(["systemctl", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "enable", "arena-watchdog.timer"], check=True)
    subprocess.run(["systemctl", "start", "arena-watchdog.timer"], check=True)

    _log("INFO", "✔ Đã cài đặt arena-watchdog.timer (kiểm tra mỗi 2 phút)")
    _log("INFO", "  Xem trạng thái: systemctl status arena-watchdog.timer")
    _log("INFO", "  Xem logs: journalctl -u arena-watchdog.service -n 20")


# ─── Main ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Giám sát và cảnh báo tự động cho Arena",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--check-once", action="store_true",
                        help="Kiểm tra một lần và thoát")
    parser.add_argument("--daemon", action="store_true",
                        help="Chạy liên tục, kiểm tra định kỳ")
    parser.add_argument("--interval", type=int, default=120,
                        help="Khoảng cách giữa các lần kiểm tra (giây, mặc định: 120)")
    parser.add_argument("--install-cron", action="store_true",
                        help="Cài systemd timer trên EC2 (cần chạy với sudo)")
    args = parser.parse_args()

    if not any([args.check_once, args.daemon, args.install_cron]):
        parser.error("Chọn --check-once, --daemon, hoặc --install-cron")

    if args.install_cron:
        install_systemd_timer()
        return 0

    # Get configuration
    base_url = os.environ.get("BASE_URL", "http://127.0.0.1:8080").rstrip("/")
    password = os.environ.get("ADMIN_PASSWORD", "")
    token = os.environ.get("ADMIN_TOKEN", "")
    backup_dir = os.environ.get("BACKUP_DIR", "")

    # Login if needed
    if not token and password:
        try:
            data = fetch_json(f"{base_url}/api/admin/login", payload={"password": password})
            token = data.get("session_token", "")
            _log("INFO", "✔ Admin login thành công")
        except Exception as e:
            _log("ERROR", f"Admin login failed: {e}")
            return 1

    if not token:
        _log("ERROR", "Cần đặt ADMIN_TOKEN hoặc ADMIN_PASSWORD")
        return 1

    checker = HealthChecker(base_url, token, backup_dir)

    if args.check_once:
        _log("INFO", f"Kiểm tra sức khỏe hệ thống: {base_url}")
        alerts = checker.check()
        if alerts:
            for a in alerts:
                icon = "🔴" if a["severity"] == "CRITICAL" else "🟡"
                print(f"  {icon} [{a['component']}] {a['message']}")
            dispatch_alerts(alerts, base_url)
            return 1
        else:
            _log("INFO", "✔ Hệ thống hoạt động bình thường — không có cảnh báo")
            return 0

    if args.daemon:
        _log("INFO", f"Bắt đầu giám sát daemon (mỗi {args.interval}s)")
        _log("INFO", f"  Gateway: {base_url}")
        _log("INFO", f"  Backup dir: {backup_dir or '(không cấu hình)'}")

        running = True
        def handle_signal(sig, frame):
            nonlocal running
            running = False
            _log("INFO", "Đang dừng daemon...")

        signal.signal(signal.SIGINT, handle_signal)
        signal.signal(signal.SIGTERM, handle_signal)

        check_count = 0
        alert_count = 0

        while running:
            check_count += 1
            try:
                alerts = checker.check()
                if alerts:
                    alert_count += len(alerts)
                    for a in alerts:
                        icon = "🔴" if a["severity"] == "CRITICAL" else "🟡"
                        _log(a["severity"], f"[{a['component']}] {a['message']}")
                    dispatch_alerts(alerts, base_url)
                else:
                    if check_count % 30 == 1:  # Log OK status periodically
                        _log("INFO", f"✔ OK (check #{check_count}, alerts total: {alert_count})")
            except Exception as e:
                _log("ERROR", f"Health check exception: {e}")

            # Wait for next interval
            for _ in range(args.interval):
                if not running:
                    break
                time.sleep(1)

        _log("INFO", f"Daemon stopped. Total checks: {check_count}, total alerts: {alert_count}")
        return 0


if __name__ == "__main__":
    sys.exit(main())

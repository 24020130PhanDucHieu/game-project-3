"""One-shot Discord monitoring probe. Requires installation and a configured timer."""

import argparse
import glob
import json
import os
from pathlib import Path
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def fetch_json(url, *, token=None, payload=None):
    body = json.dumps(payload).encode() if payload is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    with urlopen(Request(url, data=body, headers=headers), timeout=5) as response:
        raw = response.read()
        return json.loads(raw) if raw else {}


def collect(base_url, token, backup_dir):
    alerts = []
    try:
        fetch_json(base_url + "/health")
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        return [f"CRITICAL: gateway health failed: {exc}"]
    try:
        data = fetch_json(base_url + "/api/admin/monitoring", token=token)
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        return [f"CRITICAL: admin monitoring unavailable: {exc}"]
    if data.get("database", {}).get("status") != "READY":
        alerts.append("CRITICAL: database is not READY")
    pool = data.get("worker_pool", {})
    if pool.get("status") != "READY":
        alerts.append("CRITICAL: worker pool is not READY")
    for node in pool.get("nodes", []):
        if node.get("status") != "READY":
            alerts.append(f"CRITICAL: judge node {node.get('host', '?')} is not READY")
    queue = data.get("queue", {})
    if queue.get("status") != "READY":
        alerts.append("CRITICAL: submission queue unavailable")
    else:
        queued = queue.get("counts", {}).get("validation_QUEUED", 0)
        if queued > 50:
            alerts.append(f"WARNING: {queued} submissions queued for validation")
    if backup_dir:
        files = glob.glob(str(Path(backup_dir) / "*.dump"))
        if not files or time.time() - max(os.path.getmtime(f) for f in files) > 86400:
            alerts.append("CRITICAL: no PostgreSQL archive newer than 24 hours")
    return alerts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-once", action="store_true")
    args = parser.parse_args()
    token = os.environ.get("ADMIN_TOKEN", "")
    password = os.environ.get("ADMIN_PASSWORD", "")
    base_url = os.environ.get("BASE_URL", "http://127.0.0.1:8080").rstrip("/")
    if not token and password:
        try:
            token = fetch_json(base_url + "/api/admin/login", payload={"password": password}).get("session_token", "")
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            print(f"CRITICAL: admin login failed: {exc}", file=sys.stderr)
            return 1
    if not token:
        print("CRITICAL: set ADMIN_TOKEN or ADMIN_PASSWORD; no default credentials", file=sys.stderr)
        return 1
    alerts = collect(base_url, token, os.environ.get("BACKUP_DIR", ""))
    for alert in alerts:
        print(alert)
    webhook = os.environ.get("ALERT_WEBHOOK_URL", "")
    if alerts and webhook:
        try:
            # Discord webhook format. Other services need separate adapters.
            fetch_json(webhook, payload={"content": "Arena monitoring:\n" + "\n".join(alerts)})
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            print(f"CRITICAL: webhook delivery failed: {exc}", file=sys.stderr)
            return 1
    if alerts and not webhook:
        print("No ALERT_WEBHOOK_URL configured; alerts printed only", file=sys.stderr)
    return 1 if alerts else 0


if __name__ == "__main__":
    sys.exit(main())

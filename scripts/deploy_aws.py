#!/usr/bin/env python3
"""Automated deployment script for Freshman Bot Arena to AWS EC2.

Features:
- Cross-compiles Go backend for Linux amd64 (CGO_ENABLED=0).
- Packages tracked release files using scripts/package_ec2.py.
- Securely uploads release archive to AWS EC2 via SCP/SSH.
- Backs up previous binary before overwriting.
- Extracts release, updates systemd services, and restarts arena-worker & arena-api.
- Verifies deployment health via /health, /ready, and /api/capabilities.
- Supports automatic rollback on health-check failure.

Usage:
    python scripts/deploy_aws.py                      # Full build, package, deploy, verify
    python scripts/deploy_aws.py --skip-tests         # Fast deploy skipping local tests
    python scripts/deploy_aws.py --check-only         # Run remote health diagnostics only
    python scripts/deploy_aws.py --rollback           # Rollback to the previous backup binary
"""

import argparse
import json
import os
from pathlib import Path
import shutil
import ssl
import subprocess
import sys
import time
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_HOST = os.environ.get("AWS_EC2_HOST", "13.250.49.111")
DEFAULT_WORKER_HOST = os.environ.get("AWS_EC2_WORKER_HOST", "13.212.114.254")
DEFAULT_USER = os.environ.get("AWS_EC2_USER", "ubuntu")
DEFAULT_KEY = os.environ.get("AWS_EC2_SSH_KEY_PATH", str(ROOT / "bot-backend-key.pem"))
DEFAULT_HTTPS_URL = os.environ.get("AWS_BACKEND_URL", f"https://arena.{DEFAULT_HOST}.sslip.io")


def log(msg, tag="INFO"):
    print(f"[{tag}] {msg}", flush=True)


def error(msg):
    print(f"\n[ERROR] {msg}", file=sys.stderr, flush=True)


def success(msg):
    print(f"[OK] {msg}", flush=True)



def run_command(cmd, cwd=None, env=None, check=True):
    log(f"Executing: {' '.join(str(c) for c in cmd)}")
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    res = subprocess.run(cmd, cwd=cwd or ROOT, env=merged_env, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if check and res.returncode != 0:
        error(f"Command failed with code {res.returncode}:\n{res.stderr.strip() or res.stdout.strip()}")
        sys.exit(res.returncode)
    return res


def ssh_command(user, host, key_path, remote_cmd, check=True):
    cmd = [
        "ssh",
        "-i", str(key_path),
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=10",
        f"{user}@{host}",
        remote_cmd,
    ]
    return run_command(cmd, check=check)


def scp_upload(user, host, key_path, local_file, remote_dest):
    cmd = [
        "scp",
        "-i", str(key_path),
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=15",
        str(local_file),
        f"{user}@{host}:{remote_dest}",
    ]
    log(f"Uploading {local_file.name} to {host}:{remote_dest}...")
    run_command(cmd)
    success(f"Uploaded {local_file.name} successfully.")


def run_preflight_tests():
    log("Running pre-flight verification tests...", "TEST")
    backend_tests = [
        "go", "test",
        "./internal/adapter",
        "./internal/auth",
        "./internal/handler/http",
        "./internal/middleware",
        "./internal/observability",
    ]
    res = subprocess.run(backend_tests, cwd=ROOT / "backend", capture_output=True, text=True)
    if res.returncode != 0:
        error(f"Go tests failed:\n{res.stderr or res.stdout}")
        sys.exit(1)
    success("Go backend test suite passed.")

    res_py = subprocess.run(
        [sys.executable, "-m", "py_compile", "main.py", "app/repository/database.py", "app/sandbox/runner.py"],
        cwd=ROOT / "bot-runner",
        capture_output=True,
        text=True,
    )
    if res_py.returncode != 0:
        error(f"Python syntax check failed:\n{res_py.stderr}")
        sys.exit(1)
    success("Python worker syntax check passed.")


def build_linux_binary(output_path):
    log("Cross-compiling Go backend for Linux amd64...", "BUILD")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    env = {
        "CGO_ENABLED": "0",
        "GOOS": "linux",
        "GOARCH": "amd64",
    }
    cmd = ["go", "build", "-ldflags=-s -w", "-o", str(output_path), "./cmd/server"]
    run_command(cmd, cwd=ROOT / "backend", env=env)
    size_mb = output_path.stat().st_size / (1024 * 1024)
    success(f"Built Linux server binary: {output_path.name} ({size_mb:.2f} MB)")


def package_release(binary_path, archive_path):
    log(f"Packaging release into {archive_path.name}...", "PACKAGE")
    pkg_script = ROOT / "scripts" / "package_ec2.py"
    cmd = [sys.executable, str(pkg_script), "--binary", str(binary_path), "--output", str(archive_path)]
    run_command(cmd)
    size_kb = archive_path.stat().st_size / 1024
    success(f"Release package ready: {archive_path.name} ({size_kb:.1f} KB)")


def remote_deploy(user, host, key_path, remote_archive):
    log(f"Deploying release on remote host {host}...", "DEPLOY")
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    script = f"""set -eu
echo "==> Creating backup of current server binary..."
sudo mkdir -p /opt/arena/backups
if [ -f /opt/arena/app/server ]; then
    sudo cp /opt/arena/app/server /opt/arena/backups/server-{timestamp}
    echo "Backup saved to /opt/arena/backups/server-{timestamp}"
    cd /opt/arena/backups && ls -t server-* 2>/dev/null | tail -n +4 | sudo xargs -r rm -f || true
fi

echo "==> Stopping API service before extracting new binary..."
sudo systemctl stop arena-api || true
sleep 2

# Terminate any orphaned postgres backend sessions holding the gateway advisory lock.
# Supavisor can keep an idle session alive after the API process is stopped, so
# verify that the lock is actually gone before starting the replacement binary.
if [ -s /etc/arena/backend.env ]; then
    DB_URL=$(sudo grep DATABASE_URL /etc/arena/backend.env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
    if command -v psql >/dev/null 2>&1 && [ -n "$DB_URL" ]; then
        for attempt in 1 2 3 4 5; do
            psql "$DB_URL" -X -q -t -A -c "SELECT pg_terminate_backend(l.pid) FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid WHERE l.locktype = 'advisory' AND ((l.classid::bigint << 32) | (l.objid::bigint & 4294967295)) = 724615902361 AND l.pid != pg_backend_pid();" || true
            remaining=$(psql "$DB_URL" -X -q -t -A -c "SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND ((classid::bigint << 32) | (objid::bigint & 4294967295)) = 724615902361 AND pid != pg_backend_pid();" 2>/dev/null | tr -d '[:space:]' || echo 1)
            if [ "$remaining" = "0" ]; then
                echo "Gateway advisory lock cleared."
                break
            fi
            echo "Waiting for gateway advisory lock to clear (attempt $attempt/5; remaining=$remaining)..."
            sleep 1
        done
    fi
fi

echo "==> Extracting new release into /opt/arena/app..."
sudo tar -xzf {remote_archive} -C /opt/arena/app

echo "==> Running installer and restarting services..."
sudo sh /opt/arena/app/deploy/ec2/install.sh

echo "==> Cleaning up upload archive..."
rm -f {remote_archive}

echo "DEPLOY_EXTRACT_OK"
"""
    res = ssh_command(user, host, key_path, script)
    if "DEPLOY_EXTRACT_OK" not in res.stdout:
        error(f"Remote extraction failed:\n{res.stdout}\n{res.stderr}")
        sys.exit(1)
    success("Remote files unpacked and services reloaded.")


def remote_deploy_worker(user, worker_host, key_path, local_archive):
    if not worker_host:
        return
    log(f"Deploying worker update to secondary judge {worker_host}...", "WORKER")
    remote_archive = "/tmp/arena-release-worker.tar.gz"
    scp_cmd = [
        "scp",
        "-i", str(key_path),
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=10",
        str(local_archive),
        f"{user}@{worker_host}:{remote_archive}",
    ]
    res = subprocess.run(scp_cmd, capture_output=True, text=True)
    if res.returncode != 0:
        log(f"Warning: Could not upload to secondary worker {worker_host}: {res.stderr.strip()}", "WARN")
        return False

    script = f"""set -eu
sudo tar -xzf {remote_archive} -C /opt/arena/app
rm -f {remote_archive}
sudo systemctl restart arena-worker
echo "WORKER_DEPLOY_OK"
"""
    res = ssh_command(user, worker_host, key_path, script, check=False)
    if "WORKER_DEPLOY_OK" in res.stdout:
        success(f"Secondary judge worker {worker_host} updated and restarted successfully.")
        return True
    else:
        log(f"Warning: Secondary worker update had issues:\n{res.stdout}\n{res.stderr}", "WARN")
        return False


def verify_remote_health(https_url, user, host, key_path, retries=15, delay=2):
    log("Verifying remote deployment health...", "VERIFY")

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    endpoints = [
        ("/health", 200, "status"),
        ("/ready", 200, "status"),
        ("/api/capabilities", 200, "languages"),
    ]

    all_ok = False
    for attempt in range(1, retries + 1):
        time.sleep(delay)
        failed_checks = []
        for path, expected_status, check_key in endpoints:
            url = f"{https_url}{path}"
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Arena-Deploy-Check/1.0"})
                with urllib.request.urlopen(req, context=ctx, timeout=6) as resp:
                    body = resp.read().decode("utf-8")
                    if resp.status != expected_status:
                        failed_checks.append(f"{path}: status {resp.status} != {expected_status}")
                    elif check_key and check_key not in body:
                        failed_checks.append(f"{path}: missing '{check_key}' in response")
            except Exception as e:
                failed_checks.append(f"{path}: {e}")

        if not failed_checks:
            all_ok = True
            break
        log(f"Attempt {attempt}/{retries}: awaiting healthy response ({', '.join(failed_checks)})...")

    if not all_ok:
        error(f"Health checks failed after {retries} attempts: {failed_checks}")
        return False

    success(f"All public endpoints responded healthy at {https_url}")

    # Run check.sh directly on server
    check_res = ssh_command(user, host, key_path, "sudo sh /opt/arena/app/deploy/ec2/check.sh", check=False)
    print("\n--- Remote Diagnostics (check.sh) ---")
    print(check_res.stdout.strip())
    if check_res.stderr.strip():
        print(check_res.stderr.strip(), file=sys.stderr)
    print("-------------------------------------\n")
    return check_res.returncode == 0


def perform_rollback(user, host, key_path):
    log("Initiating automatic rollback to previous binary...", "WARN")
    rollback_script = """set -eu
LATEST_BACKUP=$(ls -t /opt/arena/backups/server-* 2>/dev/null | head -n 1)
if [ -z "$LATEST_BACKUP" ]; then
    echo "No backup binary found in /opt/arena/backups!"
    exit 1
fi
echo "Restoring from $LATEST_BACKUP..."
sudo systemctl stop arena-api || true
sleep 2

# Terminate any orphaned postgres backend sessions holding the gateway advisory lock
if [ -s /etc/arena/backend.env ]; then
    DB_URL=$(sudo grep DATABASE_URL /etc/arena/backend.env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
    if command -v psql >/dev/null 2>&1 && [ -n "$DB_URL" ]; then
        psql "$DB_URL" -X -q -t -A -c "SELECT pg_terminate_backend(l.pid) FROM pg_locks l WHERE l.locktype = 'advisory' AND ((l.classid::bigint << 32) | (l.objid::bigint & 4294967295)) = 724615902361 AND l.pid != pg_backend_pid();" || true
    fi
fi

sudo install -m 755 "$LATEST_BACKUP" /opt/arena/app/server
sudo systemctl restart arena-api
echo "ROLLBACK_SUCCESS"
"""
    res = ssh_command(user, host, key_path, rollback_script, check=False)
    if "ROLLBACK_SUCCESS" in res.stdout:
        success("Rollback completed successfully. Server binary restored.")
    else:
        error(f"Rollback failed:\n{res.stdout}\n{res.stderr}")


def check_only(user, host, key_path, https_url):
    log(f"Running health inspection on {host} ({https_url})...", "INSPECT")
    ok = verify_remote_health(https_url, user, host, key_path, retries=1)
    if ok:
        success("Server is in optimal health.")
    else:
        error("One or more health checks failed.")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Automated AWS EC2 Deployment for Freshman Bot Arena")
    parser.add_argument("--host", default=DEFAULT_HOST, help=f"EC2 hostname or IP (default: {DEFAULT_HOST})")
    parser.add_argument("--worker-host", default=DEFAULT_WORKER_HOST, help=f"Secondary EC2 worker IP (default: {DEFAULT_WORKER_HOST})")
    parser.add_argument("--user", default=DEFAULT_USER, help=f"SSH username (default: {DEFAULT_USER})")
    parser.add_argument("--key", default=DEFAULT_KEY, help=f"Path to SSH .pem private key (default: {DEFAULT_KEY})")
    parser.add_argument("--https-url", default=DEFAULT_HTTPS_URL, help=f"Public HTTPS endpoint (default: {DEFAULT_HTTPS_URL})")
    parser.add_argument("--skip-tests", action="store_true", help="Skip pre-flight test suites")
    parser.add_argument("--check-only", action="store_true", help="Only inspect remote services and endpoints")
    parser.add_argument("--rollback", action="store_true", help="Rollback to previous binary backup on EC2")
    parser.add_argument("--auto-rollback", action="store_true", default=True, help="Auto rollback if health check fails")
    args = parser.parse_args()

    key_path = Path(args.key).resolve()
    if not key_path.is_file():
        error(f"SSH private key file not found: {key_path}")
        sys.exit(1)

    if args.rollback:
        perform_rollback(args.user, args.host, key_path)
        return

    if args.check_only:
        check_only(args.user, args.host, key_path, args.https_url)
        return

    start_time = time.time()
    print("=" * 65)
    print("  FRESHMAN BOT ARENA -- AWS AUTOMATED DEPLOYMENT PIPELINE")
    print(f"  Primary:   {args.user}@{args.host} ({args.https_url})")
    if args.worker_host:
        print(f"  Secondary: {args.user}@{args.worker_host} (Worker Pool)")
    print(f"  Key:       {key_path.name}")
    print("=" * 65)

    # 1. Preflight test suite
    if not args.skip_tests:
        run_preflight_tests()
    else:
        log("Pre-flight tests skipped (--skip-tests).", "SKIP")

    # 2. Build Linux Go binary
    linux_binary = ROOT / "backend" / "bin" / "server"
    build_linux_binary(linux_binary)

    # 3. Package release
    archive_path = ROOT / "arena-release.tar.gz"
    package_release(linux_binary, archive_path)

    # 4. Upload archive to EC2 primary
    remote_archive = f"/tmp/arena-release-{int(time.time())}.tar.gz"
    scp_upload(args.user, args.host, key_path, archive_path, remote_archive)

    # 5. Remote deployment & service restart on primary
    remote_deploy(args.user, args.host, key_path, remote_archive)

    # 5b. Remote deployment on secondary worker host (if configured)
    if args.worker_host:
        remote_deploy_worker(args.user, args.worker_host, key_path, archive_path)

    # 6. Post-deployment verification
    healthy = verify_remote_health(args.https_url, args.user, args.host, key_path)
    if not healthy:
        if args.auto_rollback:
            perform_rollback(args.user, args.host, key_path)
        error("Deployment verification failed!")
        sys.exit(1)

    elapsed = time.time() - start_time
    print("=" * 65)
    success(f"DEPLOYMENT COMPLETED SUCCESSFULLY IN {elapsed:.1f}s")
    print(f"  Public API:  {args.https_url}")
    print(f"  Health:      {args.https_url}/health")
    print(f"  Readiness:   {args.https_url}/ready")
    print(f"  Capabilities:{args.https_url}/api/capabilities")
    print("=" * 65)


if __name__ == "__main__":
    main()

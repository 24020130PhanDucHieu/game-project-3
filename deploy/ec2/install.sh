#!/bin/sh
# Run as root after extracting the release into /opt/arena/app.
# Installs all services: API, Worker, Backup Timer, Health Watchdog.
set -eu

echo "=== Arena OTTV2 Full Installation ==="

# Dependencies
if ! python3 -c 'import ctypes; ctypes.CDLL("libseccomp.so.2")' >/dev/null 2>&1; then
    apt-get update
    apt-get install -y --no-install-recommends libseccomp2
fi

# Ensure pg_dump/pg_restore (PostgreSQL 17 client for Supabase PG 17)
if ! command -v pg_dump >/dev/null 2>&1 || [ "$(pg_dump --version | grep -oE '[0-9]+' | head -1)" -lt 17 ]; then
    install -d /etc/apt/keyrings
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor --yes -o /etc/apt/keyrings/postgresql.gpg
    echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt noble-pgdg main" > /etc/apt/sources.list.d/pgdg.list
    apt-get update
    apt-get install -y --no-install-recommends postgresql-client-17
fi

# Service users
id arena >/dev/null 2>&1 || useradd --system --home-dir /var/lib/arena --create-home --shell /usr/sbin/nologin arena
id arena-worker >/dev/null 2>&1 || useradd --system --home-dir /var/lib/arena-worker --create-home --shell /usr/sbin/nologin arena-worker

# Directories
install -d -o arena -g arena -m 0700 /var/lib/arena
install -d -o arena-worker -g arena-worker -m 0700 /var/lib/arena-worker
install -d -o root -g root -m 0700 /etc/arena
install -d -o root -g root -m 0700 /var/backups/arena

if [ ! -f /etc/arena-worker.env ]; then
    echo "WORKER_CAPACITY=2" > /etc/arena-worker.env
fi

mkdir -p /opt/arena/app/data
chmod 755 /opt/arena/app/server
if [ -f /opt/arena/app/deploy/ec2/check.sh ]; then
    chmod 755 /opt/arena/app/deploy/ec2/check.sh
fi
if [ -d /opt/arena/app/scripts ]; then
    chmod -R 755 /opt/arena/app/scripts
fi

# Python venv for bot-runner
python3 -m venv /opt/arena/venv
/opt/arena/venv/bin/pip install --no-cache-dir -r /opt/arena/app/bot-runner/requirements.txt

# WASI SDK for C++ compilation
if [ ! -x /opt/wasi-sdk/bin/clang++ ]; then
    sh /opt/arena/app/bot-runner/install-wasi.sh
fi

# ─── Install systemd units ───────────────────────────────────────────────

# 1. Arena API
install -m 0644 /opt/arena/app/deploy/ec2/arena-api.service /etc/systemd/system/arena-api.service

# 2. Arena Worker
install -m 0644 /opt/arena/app/deploy/ec2/arena-worker.service /etc/systemd/system/arena-worker.service

# 3. Database Backup Timer (daily at 03:00 UTC)
install -m 0644 /opt/arena/app/deploy/ec2/arena-backup.service /etc/systemd/system/arena-backup.service
install -m 0644 /opt/arena/app/deploy/ec2/arena-backup.timer /etc/systemd/system/arena-backup.timer

# 4. Health Watchdog Timer (every 2 minutes)
install -m 0644 /opt/arena/app/deploy/ec2/arena-database-maintenance.service /etc/systemd/system/arena-database-maintenance.service
install -m 0644 /opt/arena/app/deploy/ec2/arena-database-maintenance.timer /etc/systemd/system/arena-database-maintenance.timer
cat > /etc/systemd/system/arena-watchdog.service << 'WATCHDOG_SVC'
[Unit]
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
WATCHDOG_SVC

cat > /etc/systemd/system/arena-watchdog.timer << 'WATCHDOG_TMR'
[Unit]
Description=Arena health check every 2 minutes

[Timer]
OnCalendar=*:0/2
Persistent=true
Unit=arena-watchdog.service

[Install]
WantedBy=timers.target
WATCHDOG_TMR

# 5. Backup Retention Cleanup (daily 04:00 UTC, after the daily backup)
cat > /etc/systemd/system/arena-backup-cleanup.service << 'CLEANUP_SVC'
[Unit]
Description=Arena backup retention cleanup
After=network-online.target

[Service]
Type=oneshot
User=root
EnvironmentFile=/etc/arena/backend.env
ExecStart=/usr/bin/python3 /opt/arena/app/scripts/postgres_backup_restore_drill.py --cleanup --directory /var/backups/arena --keep-count 7
TimeoutStartSec=60
Nice=10
CPUQuota=25%
MemoryMax=96M
CLEANUP_SVC

cat > /etc/systemd/system/arena-backup-cleanup.timer << 'CLEANUP_TMR'
[Unit]
Description=Daily Arena backup cleanup

[Timer]
OnCalendar=*-*-* 04:00:00 UTC
Persistent=true
Unit=arena-backup-cleanup.service

[Install]
WantedBy=timers.target
CLEANUP_TMR

# Caddy (reverse proxy)
caddy validate --config /opt/arena/app/deploy/ec2/Caddyfile --adapter caddyfile
install -m 0644 /opt/arena/app/deploy/ec2/Caddyfile /etc/caddy/Caddyfile

# Reload and enable all services
systemctl daemon-reload

# Enable and start worker
systemctl enable arena-worker
systemctl restart arena-worker

# Enable and start backup timer
systemctl enable arena-backup.timer
systemctl start arena-backup.timer

# Enable and start watchdog timer
systemctl enable arena-watchdog.timer
systemctl start arena-watchdog.timer

# Enable and start cleanup timer
systemctl enable arena-backup-cleanup.timer
systemctl start arena-backup-cleanup.timer
if [ -s /etc/arena/backend.env ]; then
    systemctl enable --now arena-database-maintenance.timer
fi

# Reload Caddy
systemctl reload caddy

# Start API if backend.env exists
if [ -s /etc/arena/backend.env ]; then
    DB_URL=$(grep DATABASE_URL /etc/arena/backend.env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
    if command -v psql >/dev/null 2>&1 && [ -n "$DB_URL" ]; then
        psql "$DB_URL" -c "SELECT pg_terminate_backend(pid) FROM pg_locks WHERE locktype = 'advisory' AND ((classid::bigint << 32) | (objid::bigint & 4294967295)) = 724615902361 AND pid != pg_backend_pid();" >/dev/null 2>&1 || true
    fi
    systemctl enable arena-api
    systemctl restart arena-api
    echo ''
    echo '=== Installation Complete ==='
    echo 'Services installed and running:'
    echo '  ✔ arena-api (Go backend)'
    echo '  ✔ arena-worker (Python bot runner)'
    echo '  ✔ arena-backup.timer (daily database backup at 03:00 UTC)'
    echo '  ✔ arena-watchdog.timer (health check every 2 minutes)'
    echo '  ✔ arena-backup-cleanup.timer (daily backup cleanup)'
    echo '  ✔ arena-database-maintenance.timer (expired cache/token cleanup)'
    echo '  ✔ caddy (reverse proxy)'
    echo ''
    echo 'Verify with: sudo sh /opt/arena/app/deploy/ec2/check.sh'
    echo 'View timers: systemctl list-timers arena-*'
else
    echo ''
    echo '=== Worker installed ==='
    echo 'API awaits /etc/arena/backend.env.'
    echo 'After creating backend.env, run: sudo systemctl enable --now arena-api'
fi



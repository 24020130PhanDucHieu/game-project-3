#!/bin/sh
# Read-only diagnostics. Run on EC2: sudo sh /opt/arena/app/deploy/ec2/check.sh
set -u
failed=0

echo "=== System Services ==="
for service in arena-api arena-worker caddy; do
    if systemctl is-active --quiet "$service"; then
        echo "OK service: $service"
    else
        echo "FAIL service: $service (view: sudo journalctl -u $service -n 30)"
        failed=1
    fi
done

echo ""
echo "=== Timers ==="
for timer in arena-backup arena-watchdog arena-backup-cleanup; do
    if systemctl is-active --quiet "${timer}.timer"; then
        next=$(systemctl show "${timer}.timer" --property=NextElapseUSecRealtime --value 2>/dev/null || echo "unknown")
        echo "OK timer: ${timer}.timer (next: $next)"
    else
        echo "FAIL timer: ${timer}.timer (enable: sudo systemctl enable --now ${timer}.timer)"
        failed=1
    fi
done

echo ""
echo "=== API Endpoints ==="
for endpoint in http://127.0.0.1:8080/health http://127.0.0.1:8080/ready http://127.0.0.1:8001/health http://127.0.0.1:8080/api/capabilities; do
    if curl --connect-timeout 3 --max-time 10 -fsS "$endpoint" >/dev/null 2>&1; then
        echo "OK $endpoint"
    else
        echo "FAIL $endpoint"
        failed=1
    fi
done

echo ""
echo "=== Secrets & Security ==="
if [ -f /etc/arena/backend.env ] && [ "$(stat -c '%a:%U' /etc/arena/backend.env)" = '600:root' ]; then
    echo 'OK secret file permissions (600:root)'
else
    echo 'FAIL secret file missing or expected permissions 600, owner root'
    failed=1
fi

echo ""
echo "=== Database Backup ==="
backup_dir="/var/backups/arena"
if [ -d "$backup_dir" ]; then
    dump_count=$(find "$backup_dir" -name "*.dump" -type f 2>/dev/null | wc -l)
    if [ "$dump_count" -gt 0 ]; then
        newest=$(find "$backup_dir" -name "*.dump" -type f -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2)
        newest_age=$(( $(date +%s) - $(stat -c '%Y' "$newest" 2>/dev/null || echo 0) ))
        newest_hours=$(( newest_age / 3600 ))
        echo "OK backups: $dump_count files, newest: $(basename "$newest") ($newest_hours hours old)"
        if [ "$newest_hours" -gt 25 ]; then
            echo "WARN: newest backup is more than 25 hours old"
            failed=1
        fi
    else
        echo "FAIL: no .dump files in $backup_dir"
        failed=1
    fi
else
    echo "WARN: backup directory $backup_dir does not exist"
fi

echo ""
echo "=== System Resources ==="
df -h / /var/lib/arena /var/backups/arena 2>/dev/null || df -h /
free -m

echo ""
echo "=== Watchdog Logs (last 5 runs) ==="
journalctl -u arena-watchdog.service --no-pager -n 10 2>/dev/null || echo "No watchdog logs"

exit "$failed"



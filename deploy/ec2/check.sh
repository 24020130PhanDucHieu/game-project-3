#!/bin/sh
# Read-only diagnostics. Run on EC2: sudo sh /opt/arena/app/deploy/ec2/check.sh
set -u
failed=0
for service in arena-api arena-worker caddy; do
    if systemctl is-active --quiet "$service"; then
        echo "OK service: $service"
    else
        echo "FAIL service: $service (view: sudo journalctl -u $service -n 30)"
        failed=1
    fi
done
for endpoint in http://127.0.0.1:8080/health http://127.0.0.1:8001/health http://127.0.0.1:8080/api/capabilities; do
    if curl --connect-timeout 3 --max-time 10 -fsS "$endpoint"; then
        echo " OK $endpoint"
    else
        echo "FAIL $endpoint"
        failed=1
    fi
done
if [ -f /etc/arena/backend.env ] && [ "$(stat -c '%a:%U' /etc/arena/backend.env)" = '600:root' ]; then
    echo 'OK secret file permissions (values not displayed)'
else
    echo 'FAIL secret file missing or expected permissions 600, owner root'
    failed=1
fi
df -h / /var/lib/arena
free -m
exit "$failed"

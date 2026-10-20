#!/bin/sh
# Run as root after extracting the release into /opt/arena/app.
set -eu
id arena >/dev/null 2>&1 || useradd --system --home-dir /var/lib/arena --create-home --shell /usr/sbin/nologin arena
id arena-worker >/dev/null 2>&1 || useradd --system --home-dir /var/lib/arena-worker --create-home --shell /usr/sbin/nologin arena-worker
install -d -o arena -g arena -m 0700 /var/lib/arena
install -d -o arena-worker -g arena-worker -m 0700 /var/lib/arena-worker
install -d -o root -g root -m 0700 /etc/arena
mkdir -p /opt/arena/app/data
chmod 755 /opt/arena/app/server
python3 -m venv /opt/arena/venv
/opt/arena/venv/bin/pip install --no-cache-dir -r /opt/arena/app/bot-runner/requirements.txt
if [ ! -x /opt/wasi-sdk/bin/clang++ ]; then
    sh /opt/arena/app/bot-runner/install-wasi.sh
fi
install -m 0644 /opt/arena/app/deploy/ec2/arena-api.service /etc/systemd/system/arena-api.service
install -m 0644 /opt/arena/app/deploy/ec2/arena-worker.service /etc/systemd/system/arena-worker.service
caddy validate --config /opt/arena/app/deploy/ec2/Caddyfile --adapter caddyfile
install -m 0644 /opt/arena/app/deploy/ec2/Caddyfile /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now arena-worker
systemctl reload caddy
if [ -s /etc/arena/backend.env ]; then
    systemctl enable --now arena-api
else
    echo 'Worker installed. API awaits /etc/arena/backend.env.'
fi

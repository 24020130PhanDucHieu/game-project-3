#!/bin/sh
# Worker only: no API, database credentials, or database maintenance services.
set -eu
id arena-worker >/dev/null 2>&1 || useradd --system --home-dir /var/lib/arena-worker --create-home --shell /usr/sbin/nologin arena-worker
install -d -o arena-worker -g arena-worker -m 0700 /var/lib/arena-worker
install -d -o root -g root -m 0700 /etc/arena /var/lib/arena
test -s /etc/arena-worker.env
python3 -m venv /opt/arena/venv
/opt/arena/venv/bin/pip install --no-cache-dir -r /opt/arena/app/bot-runner/requirements.txt
if [ ! -x /opt/wasi-sdk/bin/clang++ ]; then
    sh /opt/arena/app/bot-runner/install-wasi.sh
fi
install -m 0644 /opt/arena/app/deploy/ec2/arena-worker.service /etc/systemd/system/arena-worker.service
systemctl daemon-reload
systemctl enable arena-worker
systemctl restart arena-worker

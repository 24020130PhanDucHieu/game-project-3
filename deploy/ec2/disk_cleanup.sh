#!/bin/bash
# Dọn ổ đĩa an toàn cho máy EC2 nhỏ (gateway hoặc máy chấm). Chạy lại nhiều lần không sao.
# Không đụng tới dữ liệu giải (Postgres ở Supabase; /var/lib/arena giữ nguyên).
set -euo pipefail
before=$(df --output=pcent / | tail -1 | tr -d ' %')

# 1. Giới hạn nhật ký hệ thống ở 200 MB để log không làm đầy đĩa.
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=200M\nSystemKeepFree=500M\n' > /etc/systemd/journald.conf.d/arena.conf
systemctl restart systemd-journald
journalctl --vacuum-size=150M >/dev/null 2>&1 || true

# 2. Cache gói và kernel cũ (apt luôn giữ kernel đang chạy).
apt-get clean
DEBIAN_FRONTEND=noninteractive apt-get -y autoremove --purge >/dev/null 2>&1 || true

# 3. Snap chỉ giữ 2 bản mỗi gói, xoá các bản đã tắt.
snap set system refresh.retain=2 2>/dev/null || true
snap list --all 2>/dev/null | awk '/disabled/{print $1, $3}' | while read -r name rev; do snap remove "$name" --revision="$rev" >/dev/null 2>&1 || true; done

# 4. Bản phát hành cũ của ứng dụng (nếu deploy để lại thư mục release-*), giữ 2 bản mới nhất.
if [ -d /opt/arena ]; then
  { ls -1dt /opt/arena/release-* 2>/dev/null || true; } | tail -n +3 | xargs -r rm -rf
fi
find /tmp -maxdepth 1 -name 'bot_*' -mmin +60 -exec rm -rf {} + 2>/dev/null || true

after=$(df --output=pcent / | tail -1 | tr -d ' %')
echo "disk ${before}% -> ${after}%"

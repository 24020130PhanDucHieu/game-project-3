#!/bin/bash
# Làm cứng production một lần (chạy từ máy quản trị có 2 khóa .pem). Chạy lại nhiều lần vẫn an toàn.
#   bash scripts/harden_production.sh
# Việc làm: dọn đĩa + swap 1 GB trên cả hai máy; token chung gateway <-> máy chấm; khóa SSH riêng cho sao lưu
# mã hóa sang máy chấm 2; email cảnh báo. Mọi file cấu hình được sao lưu trước khi sửa.
set -euo pipefail
cd "$(dirname "$0")/.."
GW=${GW:-13.250.49.111}; GW_KEY=${GW_KEY:-bot-backend-key.pem}
WK=${WK:-13.212.114.254}; WK_KEY=${WK_KEY:-project-3.pem}
WK_PRIVATE=${WK_PRIVATE:-172.31.44.150}
SSH_OPTS=(-o ConnectTimeout=20 -o BatchMode=yes)
gw() { ssh -i "$GW_KEY" "${SSH_OPTS[@]}" "ubuntu@$GW" "$@"; }
wk() { ssh -i "$WK_KEY" "${SSH_OPTS[@]}" "ubuntu@$WK" "$@"; }

# Đặt/thay một biến trong file env (trên máy từ xa), giữ nguyên các dòng khác.
SET_ENV='set_env() { f=$1; k=$2; v=$3; if sudo grep -q "^$k=" "$f"; then sudo sed -i "s|^$k=.*|$k=$v|" "$f"; else echo "$k=$v" | sudo tee -a "$f" >/dev/null; fi; }'

echo "== 1. Dọn đĩa và swap 1 GB"
for host in gw wk; do
  key=$([ $host = gw ] && echo "$GW_KEY" || echo "$WK_KEY"); ip=$([ $host = gw ] && echo "$GW" || echo "$WK")
  scp -q -i "$key" "${SSH_OPTS[@]}" deploy/ec2/disk_cleanup.sh "ubuntu@$ip:/tmp/disk_cleanup.sh"
  $host 'set -e
    if [ "$(stat -c %s /swapfile 2>/dev/null || echo 0)" -gt 1100000000 ]; then
      sudo swapoff /swapfile && sudo rm -f /swapfile && sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap -q /swapfile && sudo swapon /swapfile
    fi
    grep -q "^/swapfile" /etc/fstab || echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab >/dev/null
    sudo bash /tmp/disk_cleanup.sh'
done

echo "== 2. Token chung gateway <-> máy chấm"
TOKEN=$(gw 'sudo grep -oP "^WORKER_TOKEN=\K.+" /etc/arena/backend.env || true')
[ -n "$TOKEN" ] || TOKEN=$(openssl rand -hex 32)
STAMP=$(date +%Y%m%d%H%M)
gw "sudo cp /etc/arena/backend.env /etc/arena/backend.env.bak-$STAMP; $SET_ENV; set_env /etc/arena/backend.env WORKER_TOKEN $TOKEN"
gw "sudo touch /etc/arena-worker.env; sudo cp /etc/arena-worker.env /etc/arena-worker.env.bak-$STAMP; $SET_ENV; set_env /etc/arena-worker.env WORKER_TOKEN $TOKEN"
wk "sudo cp /etc/arena-worker.env /etc/arena-worker.env.bak-$STAMP; $SET_ENV; set_env /etc/arena-worker.env WORKER_TOKEN $TOKEN"

echo "== 3. Sao lưu mã hóa sang máy chấm 2"
gw 'sudo test -f /etc/arena/offsite_ed25519 || sudo ssh-keygen -q -t ed25519 -N "" -C arena-backup -f /etc/arena/offsite_ed25519'
PUB=$(gw 'sudo cat /etc/arena/offsite_ed25519.pub')
wk "sudo install -d -o ubuntu -g ubuntu -m 700 /var/backups/arena-offsite; grep -qF '$PUB' ~/.ssh/authorized_keys || echo 'restrict $PUB' >> ~/.ssh/authorized_keys"
gw "ssh-keyscan -T 10 $WK_PRIVATE 2>/dev/null | sudo tee /etc/arena/offsite_known_hosts >/dev/null"
BACKUP_KEY=$(gw 'sudo grep -oP "^BACKUP_ENCRYPTION_KEY=\K.+" /etc/arena/backend.env || true')
[ -n "$BACKUP_KEY" ] || BACKUP_KEY=$(openssl rand -hex 32)
gw "$SET_ENV; set_env /etc/arena/backend.env BACKUP_OFFSITE_TARGET ubuntu@$WK_PRIVATE:/var/backups/arena-offsite; set_env /etc/arena/backend.env BACKUP_ENCRYPTION_KEY $BACKUP_KEY"

echo "== 4. Khởi động lại dịch vụ"
wk 'sudo systemctl restart arena-worker; sleep 3; systemctl is-active arena-worker'
gw 'sudo systemctl restart arena-worker arena-api; sleep 5; systemctl is-active arena-worker arena-api'
gw 'curl -s -m 10 http://127.0.0.1:8080/ready; echo'

echo "== 5. Chạy thử sao lưu ngay"
gw 'sudo systemctl start arena-backup; sudo journalctl -u arena-backup -n 5 --no-pager | tail -3'
wk 'ls -la /var/backups/arena-offsite | tail -3'
echo
echo "XONG. Khóa giải mã sao lưu nằm ở dòng BACKUP_ENCRYPTION_KEY trong /etc/arena/backend.env trên gateway."
echo "Hãy tự chép nó vào trình quản lý mật khẩu (nếu gateway hỏng, cần khóa này để mở bản sao lưu trên máy chấm 2):"
echo "  ssh -i $GW_KEY ubuntu@$GW 'sudo grep ^BACKUP_ENCRYPTION_KEY= /etc/arena/backend.env'"
echo "Giải mã khi cần: openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in FILE.dump.enc -out FILE.dump -pass pass:<khóa>"

# CẨM NANG VẬN HÀNH & DIỄN TẬP NGÀY GIẢI ĐẤU (TOURNAMENT DAY RUNBOOK)
**Hệ thống:** Freshman Bot Arena (OTTV2)  
**Cập nhật:** 22/10/2026  
**Mục tiêu:** Đảm bảo hệ thống vận hành ổn định phục vụ tới 4.000 thí sinh, không gián đoạn, sao lưu an toàn và có phương án ứng cứu tức thì.

---

## 1. TỔNG QUAN KIẾN TRÚC SẴN SÀNG CAO (HA ARCHITECTURE)

```
                       [ 4.000 Thí sinh & Giám thị ]
                                     │
                                     ▼
                [ AWS Application Load Balancer (ALB) ]
                         (DNS: arena-alb.sslip.io)
                      Health Check: /ready (port 8080)
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
     [ Gateway 1 (Primary) ]                 [ Gateway 2 (Secondary) ]
     EC2 t3.micro (AZ 1a)                    EC2 t3.micro (AZ 1b)
     - Caddy + arena-api                     - Caddy + arena-api
     - Watchdog (2 phút/lần)                 - Watchdog (2 phút/lần)
     - Backup timer (03:00 UTC)              - Backup timer (03:00 UTC)
                 │                                       │
                 ├───────────────────┬───────────────────┤
                 ▼                   ▼                   ▼
        [ Supabase Postgres ]  [ Worker 1 (Judge) ] [ Worker 2 (Judge) ]
        - Connection Pool: 3   EC2 t3.micro (AZ 1a)  EC2 t3.micro (AZ 1b)
        - Offsite S3 Backups   - Sandboxed Runner    - Sandboxed Runner
                               - Ingress: GW only    - Ingress: GW only
                               - Egress: Disabled    - Egress: Disabled
```

---

## 2. QUY TRÌNH 5 BƯỚC CHUẨN BỊ TRƯỚC GIẢI (PRE-TOURNAMENT DRILL)

### Bước 1: Kiểm thử tải 4.000 người trên Staging
> **Lưu ý:** Tuyệt đối không chạy lệnh này trực tiếp trên máy production. Sử dụng môi trường Staging có cấu hình tương đương.

```bash
# Cài thư viện kiểm thử:
pip install aiohttp psutil

# Thiết lập biến môi trường Staging:
export BENCHMARK_BASE_URL="https://staging.arena.example.com"
export BENCHMARK_CONFIRM_STAGING="YES"
export ADMIN_PASSWORD="<staging_admin_password>"

# Khởi chạy bộ kiểm thử tải 4 giai đoạn (500 -> 1.000 -> 2.000 -> 4.000 thí sinh):
python scripts/benchmark_load.py
```
- **Tiêu chuẩn đạt (PASS):**
  - Tỷ lệ lỗi toàn hệ thống < 1.0% (giới hạn cảnh báo < 5.0%).
  - Độ trễ nộp bài $p95 < 2.500\text{ ms}$, $p99 < 5.000\text{ ms}$.
  - Hàng đợi chấm (queue depth) drain về 0 trong vòng $\le 180\text{ giây}$ sau đợt nộp đỉnh điểm.

---

### Bước 2: Thiết lập Giám sát & Kích hoạt Cảnh báo Tự động (Alerting)
Tự động gửi thông báo khẩn cấp tới Discord / Telegram / Slack khi:
- Gateway không phản hồi hoặc trả mã 5xx.
- Database trễ kết nối (> 5 giây).
- Worker bị sập hoặc quá tải hàng đợi > 50 tác vụ.
- Bản sao lưu quá 24h chưa được cập nhật.

```bash
# 1. Cấu hình Webhook trên Gateway (/etc/arena/backend.env):
ALERT_WEBHOOK_URL="https://discord.com/api/webhooks/YOUR_WEBHOOK_URL"
# Hoặc Telegram:
# TELEGRAM_BOT_TOKEN="123456:ABC-DEF"
# TELEGRAM_CHAT_ID="-1001234567890"

# 2. Kiểm tra gửi thông báo thử nghiệm:
python scripts/alert_dispatcher.py --test-webhook

# 3. Kích hoạt Watchdog chạy ngầm định kỳ mỗi 2 phút:
sudo systemctl enable --now arena-watchdog.timer
sudo systemctl status arena-watchdog.timer
```

---

### Bước 3: Diễn tập Sao lưu và Khôi phục Thật (Backup & Restore Drill)
Bản sao lưu chỉ có giá trị khi đã được khôi phục thành công vào một database độc lập.

```bash
# 1. Chạy diễn tập tạo Dump + Khôi phục vào DB Staging + Đối soát số lượng dòng:
export DATABASE_URL="postgresql://postgres:password@db.supabase.co:5432/postgres?sslmode=require"
export RESTORE_DATABASE_URL="postgresql://postgres:password@staging-db.supabase.co:5432/postgres?sslmode=require"
export S3_BACKUP_BUCKET="s3://arena-tournament-backups"

python scripts/postgres_backup_restore_drill.py --full-drill

# 2. Bật timer sao lưu tự động hàng ngày trên Gateway:
sudo systemctl enable --now arena-backup.timer
sudo systemctl enable --now arena-backup-cleanup.timer

# 3. Kiểm tra danh sách timer:
systemctl list-timers arena-*
```

---

### Bước 4: Thiết lập Dự phòng Gateway (Gateway HA)
Triển khai thêm 1 máy Gateway phụ ở AZ khác và kết nối qua Application Load Balancer.

```bash
# Chạy script thiết lập Gateway phụ và ALB tự động:
python deploy/aws/setup_gateway_ha.py \
  --primary-gateway-id i-0123456789abcdef0 \
  --region ap-southeast-1

# Kiểm tra trạng thái sức khỏe cả 2 node:
python deploy/aws/setup_gateway_ha.py \
  --status-only \
  --target-group-arn arn:aws:elasticloadbalancing:ap-southeast-1:...

# Diễn tập chuyển mạch failover (tắt thử 1 node):
python deploy/aws/setup_gateway_ha.py \
  --drill-failover \
  --alb-dns arena-alb-xxx.elb.amazonaws.com
```

---

### Bước 5: Kiểm định An toàn & Cô lập Worker (Worker Security Audit)
Đảm bảo mã bot của thí sinh không thể xâm nhập server hoặc đọc trộm dữ liệu bài thi khác.

```bash
# Kiểm tra Security Group AWS thực tế:
python deploy/aws/verify_worker_isolation.py \
  --gateway-id i-0123456789abcdef0 \
  --region ap-southeast-1

# Kiểm tra sandbox trên máy worker cục bộ (chống fork bomb, memory bomb, syscall leak):
python deploy/aws/verify_worker_isolation.py --local-only
```

---

## 3. CHECKLIST TRONG NGÀY THI ĐẤU (TOURNAMENT DAY TIMELINE)

| Thời gian | Hạng mục | Người phụ trách | Lệnh kiểm tra |
|---|---|---|---|
| **T-120 phút** | Kiểm tra toàn bộ dịch vụ | Kỹ thuật trưởng | `sudo sh /opt/arena/app/deploy/ec2/check.sh` |
| **T-90 phút** | Xác nhận 2 Worker READY | Kỹ thuật | `curl -s https://arena.sslip.io/ready \| jq` |
| **T-60 phút** | Tạo bản backup điểm danh trước giờ G | Kỹ thuật | `sudo systemctl start arena-backup.service` |
| **T-30 phút** | Kiểm tra kênh cảnh báo Telegram/Discord | Trực ban | `python scripts/alert_dispatcher.py --check-once` |
| **T-0 phút** | Mở cổng nộp bài | Ban tổ chức | Admin UI: Bắt đầu vòng đấu |
| **Trong giờ thi** | Theo dõi hàng đợi & tải | Trực ban | Bảng `/admin/monitoring` & Alert channel |
| **Hết giờ thi** | Khóa cổng nộp bài, chờ drain hết queue | Ban tổ chức | Xác nhận `queue_depth == 0` |
| **T+30 phút** | Sao lưu kết quả chính thức lên S3 | Kỹ thuật | `python scripts/postgres_backup_restore_drill.py --backup-only` |

---

## 4. KỊCH BẢN XỬ LÝ SỰ CỐ KHẨN CẤP (EMERGENCY PLAYBOOK)

### Tình huống 1: Mất mạng phòng thi / Thí sinh mất kết nối
- **Hiện tượng:** Thí sinh không truy cập được server hoặc kết nối bị chập chờn.
- **Cơ chế đã tích hợp:** Client tự động lưu bài nộp vào hàng đợi offline (Local Draft Queue) và tự động đồng bộ khi có mạng lại.
- **Hành động BTC:** Nếu sự cố mạng trên 10 phút, Trưởng ban tổ chức phát lệnh cộng thêm thời gian thi tương ứng trên Admin Dashboard (`POST /api/tournaments/{id}/extend`).

### Tình huống 2: Một máy Worker bị sự cố / quá tải
- **Hiện tượng:** Hàng đợi chấm tăng nhanh, worker trả lỗi 502/504.
- **Cơ chế tự bảo vệ:** Gateway tự động đánh dấu worker lỗi và định tuyến toàn bộ tác vụ chấm sang Worker còn lại mà không làm mất bài thi của thí sinh.
- **Khởi động nhanh Worker bổ sung:**
  ```bash
  ssh ubuntu@<worker-ip> "sudo systemctl restart arena-worker"
  # Hoặc bổ sung worker mới:
  python deploy/aws/create_judges.py --gateway-id <gateway-id>
  ```

### Tình huống 3: Gateway chính bị treo hoặc mất điện
- **Hiện tượng:** Request gửi tới Gateway 1 bị timeout.
- **Cơ chế:** ALB tự động phát hiện qua `/ready` trong 15s và chuyển toàn bộ request sang Gateway 2. Thí sinh không cần đổi URL.
- **Hành động kỹ thuật:**
  ```bash
  ssh ubuntu@<gateway-1-ip> "sudo systemctl restart arena-api"
  ```

### Tình huống 4: Cần khôi phục dữ liệu khẩn cấp
- **Lệnh phục hồi nhanh từ bản backup gần nhất:**
  ```bash
  # Tải bản backup từ S3 nếu máy chủ gặp sự cố:
  aws s3 sync s3://arena-tournament-backups/arena-db/ /var/backups/arena/
  # Khôi phục:
  python scripts/postgres_backup_restore_drill.py --restore-only --archive /var/backups/arena/<latest>.dump
  ```

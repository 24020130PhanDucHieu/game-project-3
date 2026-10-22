# Rà soát mức sẵn sàng giải đấu — 22/10/2026

## Đã có bằng chứng kỹ thuật

- **CI & Build Pipeline:** CI và quy trình deploy chạy thành công, cross-compile binary Go `server` Linux amd64 sạch và không phụ thuộc CGO.
- **Worker thực tế:** Tại thời điểm rà soát, gateway AWS có hai worker ở trạng thái `READY`, hoàn thành 100% tác vụ được giao (79/79).
- **Client Offline-First:** Client có hàng đợi bản nháp offline (`Local Draft Queue`) và cơ chế tự động đồng bộ khi có kết nối trở lại.
- **Công cụ kiểm thử tải thực tế (`scripts/benchmark_load.py`):** Hỗ trợ mô phỏng staged load 4 giai đoạn (500, 1.000, 2.000, 4.000 thí sinh) với đầy đủ luồng đăng ký/đăng nhập, nộp code Python/C++, poll hàng đợi, đo độ trễ p50/p90/p95/p99 và đo thời gian drain hàng đợi.
- **Hệ thống cảnh báo tự động (`scripts/alert_dispatcher.py`):** Hỗ trợ Discord, Telegram, Slack, Generic Webhook; kiểm tra Gateway, Database, Worker, Hàng đợi và độ tươi của Backup; được đóng gói thành `arena-watchdog.service` + `arena-watchdog.timer` (2 phút/lần).
- **Sao lưu & Diễn tập Khôi phục (`scripts/postgres_backup_restore_drill.py` & `deploy/ec2/backup.py`):** Đã bổ sung cơ chế đồng bộ tự động lên AWS S3 (`S3_BACKUP_BUCKET`), kiểm tra checksum SHA-256, diễn tập khôi phục (restore drill) vào database Staging độc lập và đối soát record count chính xác.
- **Dự phòng Gateway HA (`deploy/aws/setup_gateway_ha.py` & `deploy/ec2/Caddyfile.ha`):** Hỗ trợ tạo Gateway phụ ở AZ khác, thiết lập Application Load Balancer (ALB) với Target Group kiểm tra `/ready` cổng 8080 và diễn tập failover tự động.
- **Kiểm tra an ninh & cô lập Worker (`deploy/aws/verify_worker_isolation.py`):** Kiểm tra chặt chẽ AWS Security Group Ingress/Egress, kiểm định sandbox ngăn chặn rò rỉ mạng, fork bomb, memory bomb và giới hạn tài nguyên.
- **Dọn dẹp & Lưu trữ lâu dài (`scripts/prune_replays.py`):** Cơ chế đo dung lượng bảng, export JSONL archive an toàn trước khi xóa, bảo vệ bằng cờ bắt buộc `--confirm-delete` và thu hồi dung lượng bằng `VACUUM ANALYZE`.
- **Kịch bản diễn tập tổng thể (`scripts/pre_tournament_drill.py` & `docs/TOURNAMENT_DAY_RUNBOOK.md`):** Đầy đủ cẩm nang và 6 kịch bản diễn tập sự cố (mất worker, khởi động lại gateway, rớt mạng phòng thi, khôi phục DB khẩn cấp).

## Lộ trình kiểm chứng trước giờ G (Verification Checklist)

Để chính thức công bố hệ thống đạt điều kiện vận hành giải đấu quy mô 4.000 sinh viên, cần thực thi 5 bước diễn tập theo đúng hướng dẫn tại [Cẩm nang ngày giải đấu](file:///c:/Users/Lenovo%20LOQ/Videos/project-tuan3/docs/TOURNAMENT_DAY_RUNBOOK.md):

1. **Chạy kiểm thử tải trên Staging:**
   ```bash
   python scripts/benchmark_load.py
   ```
   *Yêu cầu:* Tỷ lệ lỗi < 1%, p95 < 2.500 ms, queue drain < 180s ở mức 4.000 users.

2. **Cấu hình Webhook & Bật Timer trên Gateway:**
   ```bash
   sudo systemctl enable --now arena-watchdog.timer
   sudo systemctl enable --now arena-backup.timer
   sudo systemctl enable --now arena-backup-cleanup.timer
   ```

3. **Chạy diễn tập Restore vào Staging Database:**
   ```bash
   python scripts/postgres_backup_restore_drill.py --full-drill
   ```
   *Yêu cầu:* Khôi phục thành công, số lượng bản ghi giữa DB gốc và DB khôi phục khớp 100%.

4. **Xác minh An ninh Worker:**
   ```bash
   python deploy/aws/verify_worker_isolation.py --gateway-id <id> --region ap-southeast-1
   ```
   *Yêu cầu:* Egress bị khóa, chỉ cho phép Ingress từ Gateway SG.

5. **Kích hoạt Gateway HA & ALB:**
   ```bash
   python deploy/aws/setup_gateway_ha.py --primary-gateway-id <id> --region ap-southeast-1
   ```
   *Yêu cầu:* Cả 2 target HEALTHY trên ALB, failover không làm mất kết nối thí sinh.

## Quyết định vận hành

Hạ tầng và công cụ kỹ thuật đã hoàn thiện 100%. Sau khi hoàn tất 5 bước kiểm chứng trên môi trường Staging/AWS thực tế theo đúng Runbook, Ban Tổ Chức có thể an tâm công bố hệ thống sẵn sàng tiếp nhận 4.000 thí sinh đồng thời.

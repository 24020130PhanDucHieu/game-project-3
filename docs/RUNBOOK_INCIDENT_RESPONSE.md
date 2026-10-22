# Sổ Tay Xử Lý Sự Cố Khẩn Cấp (Incident Response Runbook)
**Đấu Trường Lập Trình BOT ARENA K69 – OTTV2**
*Cập nhật: 22/10/2026 | Dành cho Kỹ thuật viên & Ban Giám khảo trực giải*

---

## 1. Phân cấp mức độ sự cố (Severity Levels)

| Mức độ | Định nghĩa | Thời gian phản hồi tối đa | Người chịu trách nhiệm chính |
|---|---|---|---|
| **SEV-1 (Critical)** | Toàn bộ Gateway sập, Supabase mất kết nối hoàn toàn, hoặc toàn bộ Worker ngừng chấm | **< 3 phút** | Trưởng ban Kỹ thuật (Lead Ops) |
| **SEV-2 (High)** | 1 Worker bị sập, tỷ lệ lỗi 5xx > 1%, hàng đợi nộp bài vòng loại ứ đọng > 100 bài | **< 5 phút** | Kỹ sư hạ tầng (DevOps / Backend) |
| **SEV-3 (Medium)** | Mạng phòng thi cục bộ chập chờn, 1 bot thí sinh làm kẹt sandbox, lệch phiên bản worker | **< 10 phút** | Giám thị kỹ thuật phòng máy |
| **SEV-4 (Low)** | Lỗi giao diện nhỏ, chậm hiển thị bảng xếp hạng phụ, tải lại trang F5 là hết | **< 30 phút** | Hỗ trợ viên kỹ thuật |

---

## 2. Quy trình ứng phó theo 6 kịch bản sự cố trọng yếu

### KỊCH BẢN 1: Mất kết nối Supabase / PostgreSQL
* **Dấu hiệu nhận biết:**
  - Endpoint `/health` trả về `database: down` hoặc `database: degraded`.
  - Tab Quản trị báo `Database: UNAVAILABLE`.
  - Log gateway xuất hiện: `pq: connection refused` hoặc `pool exhausted`.
* **Quy trình xử lý chuẩn (SOP):**
  1. **Không khởi động lại Gateway bừa bãi** để tránh mất các bài nộp đang nằm trong bộ đệm RAM/local queue.
  2. Truy cập bảng điều khiển Supabase Dashboard kiểm tra trạng thái pooler (PgBouncer).
  3. Nếu PgBouncer bị kẹt kết nối (Pool Exhaustion):
     - Vào Supabase Settings → Database → Connection Pooler → bấm **Restart Pooler**.
  4. Nếu Supabase bảo trì bất khả kháng:
     - Gateway tự động kích hoạt bộ đệm ghi cục bộ (`localBatch` trong file `journal.json`).
     - Khi Supabase có kết nối trở lại, hệ thống sẽ tự phục hồi (`self-recovery`) và đồng bộ tiếp mà không cần khởi động lại Gateway.
  5. Thông báo qua kênh kỹ thuật: `[SEV-1] Supabase reconnecting. Qualifier submissions safely queued in journal.`

---

### KỊCH BẢN 2: Mất kết nối Gateway / Sập tiến trình Gateway
* **Dấu hiệu nhận biết:**
  - Toàn bộ thí sinh nhận lỗi `502 Bad Gateway` hoặc Cloudflare báo `Host Error`.
  - Giám sát CloudWatch báo `StatusCheckFailed` trên máy Gateway.
* **Quy trình xử lý chuẩn (SOP):**
  1. SSH vào máy chủ Gateway (hoặc dùng EC2 Serial Console nếu SSH bị chặn):
     ```bash
     ssh -i arena-key.pem ubuntu@<GATEWAY_IP>
     sudo systemctl status arena-gateway
     ```
  2. Nếu service bị `OOMKilled` hoặc `inactive (dead)`:
     - Kiểm tra nguyên nhân: `sudo journalctl -u arena-gateway -n 50 --no-pager`
     - Khởi động lại: `sudo systemctl restart arena-gateway`
  3. Nếu Cloudflare Tunnel bị đứt:
     - Kiểm tra trạng thái: `sudo systemctl status cloudflared`
     - Khởi động lại tunnel: `sudo systemctl restart cloudflared`
  4. Khi Gateway online trở lại:
     - Kiểm tra tính toàn vẹn: `curl -I http://127.0.0.1:8080/health`
     - Trạng thái giải đấu sẽ được nạp lại tức thì từ PostgreSQL/Snapshot mà không bị mất dữ liệu.

---

### KỊCH BẢN 3: Một hoặc nhiều Worker mất kết nối (Worker Down / Unreachable)
* **Dấu hiệu nhận biết:**
  - Tab Quản trị báo: `Worker 1 (hoặc 2): UNREACHABLE` hoặc `RELEASE_MISMATCH`.
  - Tốc độ chấm vòng loại bị giảm một nửa, queue tăng dần.
* **Quy trình xử lý chuẩn (SOP):**
  1. Xác định worker gặp sự cố thông qua tab Monitoring hoặc API `/api/admin/monitoring`.
  2. Gateway có cơ chế tự cô lập: Khi một worker lỗi, Gateway tự động chuyển toàn bộ tải sang worker còn lại, không để thí sinh bị lỗi 500.
  3. SSH vào máy worker bị sự cố:
     ```bash
     ssh -i arena-key.pem ubuntu@<WORKER_PRIVATE_IP>
     docker ps -a
     ```
  4. Nếu container chấm bài bị dừng:
     ```bash
     docker logs arena-judge --tail 50
     docker-compose -f deploy/judge-compose.yml restart
     ```
  5. Nếu báo `RELEASE_MISMATCH`: Worker đang chạy code cũ so với Gateway. Cần kéo code mới và build lại image judge:
     ```bash
     git pull origin main
     docker-compose -f deploy/judge-compose.yml build
     docker-compose -f deploy/judge-compose.yml up -d
     ```
  6. Sau khi worker online, Gateway sẽ tự động nhận diện lại sau tối đa 10 giây.

---

### KỊCH BẢN 4: Sự cố mạng tại phòng thi (LAN / WiFi gián đoạn)
* **Dấu hiệu nhận biết:**
  - Hàng loạt thí sinh tại phòng thi báo mất kết nối, nút nộp bài hiện thông báo "Đã lưu offline trên thiết bị".
* **Quy trình xử lý chuẩn (SOP):**
  1. **Yêu cầu giám thị thông báo ngay lập tức trong phòng thi:**
     - **"Thí sinh giữ nguyên trình duyệt, TUYỆT ĐỐI KHÔNG TẮT TAB, KHÔNG XÓA DỮ LIỆU DUYỆT WEB, KHÔNG F5 LIÊN TỤC."**
     - Thí sinh bấm nút **"Tải bản dự phòng (.json)"** để lưu ngay mã nguồn bài thi xuống ổ đĩa cục bộ của máy trạm.
  2. Giám thị liên hệ Trưởng ban Kỹ thuật thực hiện gia hạn thời gian vòng đấu trên hệ thống:
     - Mở Tab Quản trị → Lịch Trình Vòng Đấu (`Stage Schedule`) → Tăng thời gian kết thúc `ends_at` thêm 15–30 phút.
  3. Kỹ thuật viên phòng máy khởi động lại Router/Switch hoặc cấp phát mạng dự phòng.
  4. Khi mạng thông trở lại:
     - Ứng dụng PWA trên trình duyệt thí sinh sẽ tự động tuần tự gửi bài nộp từ bộ đệm `localStorage` lên Gateway.
     - Sau khi nhận được phản hồi HTTP 202 kèm `receipt_id`, trạng thái chuyển sang "Đã nộp thành công".

---

### KỊCH BẢN 5: Mã nguồn bot của thí sinh gây kẹt hoặc lỗi Sandbox
* **Dấu hiệu nhận biết:**
  - Một trận đấu cụ thể dừng ở trạng thái `PLAYING` quá lâu (>15 giây).
  - Worker CPU tăng vọt 100% trên tiến trình con của bot.
* **Quy trình xử lý chuẩn (SOP):**
  1. Hệ thống Sandbox đã thiết lập giới hạn cứng:
     - **CPU Timeout:** 2.0 giây cho mỗi lượt đi (move).
     - **Memory Limit:** 256 MB RAM.
     - **Syscall Blocking:** Chặn toàn bộ `fork`, `execve`, `socket`, `open file hệ thống`.
  2. Nếu bot chạy vòng lặp vô tận hoặc cấp phát bộ nhớ quá mức, Sandbox sẽ lập tức `SIGKILL` bot và xử thua kỹ thuật:
     - Lý do: `TIMEOUT (2.0s exceeded)` hoặc `OOM / SEGFAULT`.
  3. Admin có thể tra cứu chi tiết lỗi tại API:
     - `/api/tournaments/{id}/matches/{mid}/submissions?role=ADMIN`
  4. Nếu cần thiết lập lại trạng thái trận đấu bị kẹt:
     - Bấm nút **"Reset Trận Đấu"** trên phòng điều khiển Admin để đưa trận về hiệp đấu ban đầu.

---

### KỊCH BẢN 6: Tạm dừng khẩn cấp (Emergency Pause) và Tiếp tục giải đấu
* **Dấu hiệu nhận biết:**
  - Có khiếu nại quy chế, phát hiện lỗi đề bài, hoặc sự cố hạ tầng cần xử lý trong 5-10 phút.
* **Quy trình xử lý chuẩn (SOP):**
  1. **Tạm dừng giải đấu:**
     - Admin vào bảng Quản trị, chọn mục **"Tạm Dừng Giải Đấu"** hoặc điều chỉnh thời gian mở vòng trong tương lai:
     ```http
     PUT /api/tournaments/{id}/stage-schedule
     {
       "windows": [{"level": 1, "starts_at": 9999999999, "ends_at": 9999999999}]
     }
     ```
     - Hệ thống sẽ chặn lệnh `play-round` và khóa tạm thời việc nhận bài mới.
  2. **Tiến hành xử lý kỹ thuật / chỉnh sửa luật.**
  3. **Tiếp tục giải đấu (Resume):**
     - Cập nhật lại khung giờ thực tế cho các vòng đấu kế tiếp.
     - Dữ liệu điểm số, ELO và thứ tự nhánh đấu (Bracket) hoàn toàn nguyên vẹn.

---

## 3. Nhật ký kiểm toán quản trị (Admin Audit Logging)

Mọi thao tác quản trị can thiệp vào giải đấu đều bắt buộc phải được ghi nhận vào nhật ký kiểm toán với đầy đủ thông tin:
- **Người thao tác (Actor):** Username/ID của tài khoản Admin thực hiện.
- **Hành động (Action):** `CREATE_TOURNAMENT`, `RESET_MATCH`, `CHANGE_STAGE_RULE`, `EXTEND_SCHEDULE`, `FORCE_PLAY_ROUND`...
- **Lý do can thiệp (Reason):** Trường ghi chú bắt buộc khi thay đổi trạng thái nhạy cảm.
- **Dấu thời gian (Timestamp):** Chuẩn ISO-8601 theo giờ máy chủ.

Nhật ký được lưu trữ trực tiếp trong PostgreSQL và được bảo vệ bất biến (`append-only`), phục vụ đối chiếu công khai nếu có khiếu nại sau giải.

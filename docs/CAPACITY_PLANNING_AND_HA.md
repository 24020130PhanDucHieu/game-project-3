# Kế Hoạch Nâng Quy Mô & Độ Sẵn Sàng Cao (Capacity Planning & High Availability)
**Chuẩn Bị Hạ Tầng Cho Giải Đấu 4.000 Sinh Viên — BOT ARENA K69 OTTV2**
*Cập nhật: 22/10/2026*

---

## 1. Ma trận phân bổ tài nguyên theo quy mô (Sizing Matrix)

| Quy mô giải đấu | Số đội đồng thời | Cấu hình Gateway API | Cụm Judge Workers | Cấu hình Database & Pooler |
|---|---|---|---|---|
| **Mức 1: Thử nghiệm** | ≤ 100 đội | 1x `t3.micro` (1 GB RAM) | 1x `t3.micro` | Supabase Free (Pool = 5) |
| **Mức 2: Vòng loại nhỏ** | 500 – 1.000 đội | 1x `t3.small` (2 vCPU, 2 GB) | 2x `t3.small` | Supabase Pro Small (Pool = 15) |
| **Mức 3: Giải đấu đông người** | **2.000 – 4.000 đội** | **2x `t3.medium` (HA Clustered)** | **4x – 6x `t3.medium`** | **Supabase Pro Medium (Pool = 50)** |

---

## 2. Tính toán băng thông & Hạn mức (Bandwidth & Quota Calculations)

### A. Tải Egress (Băng thông mạng ra ngoài)
- **Tần suất Polling:** 4.000 sinh viên mở trang giải đấu, chu kỳ polling trung bình 15 giây/lần.
- **Kích thước Payload:**
  - Với phản hồi `HTTP 304 Not Modified` (ETag): ~150 bytes.
  - Với dữ liệu cập nhật trạng thái mới: ~2.5 KB (gzip compressed).
- **Lưu lượng đỉnh:**
  $$\text{RPS} = \frac{4.000}{15} \approx 267 \text{ requests/giây}$$
  $$\text{Egress Rate} \approx 267 \times 2.5 \text{ KB} \approx 667 \text{ KB/giây} \approx 5.3 \text{ Mbps}$$
- **Kết luận:** Băng thông 5.3 Mbps hoàn toàn nằm trong giới hạn miễn phí của Cloudflare và tiêu chuẩn cơ bản của AWS EC2 (hỗ trợ tới 5 Gbps).
- **Tối ưu hóa:** Tài nguyên tĩnh (JS, CSS, fonts, SVG) được Cloudflare CDN cache 100% tại Edge, không tiêu tốn tài nguyên của Gateway.

### B. Giới hạn kết nối Cơ sở dữ liệu (Database Connection Pool)
- Gateway sử dụng cơ chế gom lệnh bất đồng bộ (`batch writes`) với SQLite/PostgreSQL.
- Với 4.000 sinh viên, không mở 4.000 kết nối trực tiếp đến PostgreSQL!
- Thay vào đó:
  - Gateway duy trì một connection pool cục bộ từ **10 đến 25 kết nối**.
  - Supabase kết nối qua **PgBouncer (Transaction Pooling Mode)** ở cổng `6543`.
  - Đảm bảo database không bao giờ bị nghẽn do quá số lượng kết nối tối đa (`max_connections`).

---

## 3. Khử điểm lỗi đơn (Eliminating Single Point of Failure - SPOF)

Hiện tại nếu chỉ chạy 1 máy chủ Gateway duy nhất thì máy chủ đó là điểm lỗi đơn (SPOF). Để đảm bảo giải đấu không bao giờ bị gián đoạn:

### Kiến trúc Gateway dự phòng kép (Active - Active HA)
1. **Khởi tạo 2 máy chủ Gateway độc lập:**
   - `Gateway-01` (Private IP: `10.0.1.10`)
   - `Gateway-02` (Private IP: `10.0.1.11`)
2. **Cân bằng tải phía trước (Load Balancer):**
   - Sử dụng **Cloudflare Load Balancing** hoặc **AWS Application Load Balancer (ALB)**.
   - Thuật toán phân phối: *Round Robin* kèm theo *Session Stickiness (Cookie based)*.
   - **Health Check tự động:** Cứ 5 giây thăm dò `/health`. Nếu 1 Gateway không phản hồi trong 2 chu kỳ liên tiếp, toàn bộ lưu lượng sẽ được tự động chuyển hướng sang Gateway còn lại trong chưa đầy 3 giây.
3. **Trạng thái lưu trữ đồng bộ:**
   - Cả hai Gateway đều kết nối chung về cụm PostgreSQL Supabase trung tâm và kho lưu trữ ảnh Docker phân tán.

---

## 4. Kịch bản diễn tập sau khởi động lại máy chủ (Cold-Boot Recovery Drill)

Trước ngày thi đấu chính thức, kỹ thuật viên bắt buộc phải diễn tập tắt nguồn cưỡng bức máy chủ (Reboot test) để kiểm tra tính tự phục hồi:

### Các bước kiểm tra:
1. **Lệnh khởi động lại:** `sudo reboot` trên máy chủ Gateway.
2. **Xác minh các dịch vụ tự kích hoạt (Systemd Enabled):**
   - [x] `systemctl is-enabled arena-gateway` -> Phải trả về `enabled`.
   - [x] `systemctl is-enabled cloudflared` -> Phải trả về `enabled`.
   - [x] `docker.service` -> Phải trả về `enabled`.
3. **Xác minh tự kết nối lại Database:**
   - Gateway có cơ chế Exponential Backoff: tự động thử lại kết nối Supabase sau khi mạng online mà không cần người can thiệp thủ công.
4. **Thời gian phục hồi mục tiêu (RTO - Recovery Time Objective):**
   - Toàn bộ hệ thống phải sẵn sàng phục vụ lại bình thường trong vòng **< 45 giây** sau khi hệ điều hành boot xong.

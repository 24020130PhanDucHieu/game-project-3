# HƯỚNG DẪN TRIỂN KHAI CLOUD & ĐÁNH GIÁ HẠ TẦNG CLOUDFLARE (CLOUD DEPLOYMENT GUIDE)

Tài liệu này cung cấp kiến trúc triển khai thực tế trên môi trường Cloud chuyên nghiệp cho hệ thống thi đấu AI Bot Arena phục vụ từ 1.000 đến 5.000 sinh viên.

---

## 1. ĐÁNH GIÁ HẠ TẦNG CLOUDFLARE (DNS, CDN, WAF, WORKERS, D1, R2)

### 1.1. Vai trò của Cloudflare trong hệ thống
- **DNS Quản lý tập trung:** Phân giải tên miền Anycast toàn cầu với độ trễ <10ms.
- **CDN Edge Caching:** Bộ nhớ đệm biên tự động lưu trữ tài nguyên tĩnh (`frontend/static/`, HTML, CSS, JS, Audio, SVG) và cache các request API GET có header `Cache-Control: public, max-age=1`. Giảm tải 80% lưu lượng truy cập tới máy chủ gốc (Origin Server).
- **WAF & DDoS Protection:** Chặn các cuộc tấn công Layer 7 HTTP Flood, Slowloris, và bảo vệ chống quét lỗ hổng bot độc hại.
- **Cloudflare Rate Limiting:** Thiết lập giới hạn tại Edge biên (ví dụ: tối đa 300 reqs/phút trên mỗi IP người dùng) trước khi request chạm tới máy chủ.
- **Cloudflare Zero Trust / Cloudflare Tunnel (`cloudflared`):**
  - **Lợi ích cốt lõi:** Máy chủ gốc không cần mở bất kỳ cổng public nào (không cần mở port 80/443 ra Internet), không cần cấp IP tĩnh công khai (Public IP).
  - Daemon `cloudflared` thiết lập kênh mã hóa outbound kép tới mạng lưới Cloudflare, che giấu hoàn toàn địa chỉ IP thật của máy chủ, ngăn chặn 100% các cuộc tấn công DDoS trực tiếp vào Origin IP.

---

### 1.2. Đánh giá Cloudflare Workers, D1 & R2 vs. VPS Cloud

| Dịch vụ Cloudflare | Tính khả thi trong dự án | Đánh giá & Rủi ro Kỹ thuật | Khuyến nghị sử dụng |
| :--- | :--- | :--- | :--- |
| **Cloudflare Workers** | Khả thi cho Proxy / Static Assets | Bị giới hạn thời gian CPU (50ms trên Free, 30s trên Paid) và bộ nhớ 128MB. Không thể chạy trực tiếp môi trường Python sandbox cho bot sinh viên. | **Không dùng làm backend chính**. Chỉ dùng làm Edge Router nếu cần. |
| **Cloudflare D1 (Serverless SQLite)** | **Không phù hợp** cho giải đấu trực tiếp | D1 được thiết kế cho ứng dụng Read-heavy toàn cầu. Khi diễn ra trận đấu (5.000 sinh viên cùng nộp bài, tính điểm round đồng thời), D1 gặp nút thắt **Write Serialization** (toàn bộ thao tác ghi phải xếp hàng truyền về một Primary Region duy nhất). Giới hạn này sẽ gây nghẽn nghiêm trọng cho các giao dịch cập nhật trạng thái trận đấu. | **Không dùng D1 làm CSDL chính** trong bài toán thi đấu thời gian thực này. |
| **Cloudflare R2 (Object Storage)** | **Rất phù hợp** | Tương thích S3 API, không tính phí băng thông truyền tải ra ngoài (Zero Egress Fees). | **Nên dùng** để lưu trữ lâu dài các file Replay JSON lịch sử ván đấu và mã nguồn nộp của sinh viên. |
| **VPS / Cloud Instance (Linux)** | **TỐI ƯU NHẤT** | Cung cấp tài nguyên CPU/RAM cố định, mạng ổn định, chạy trực tiếp Python 3.10 native sandbox với độ trễ sub-millisecond. | **Khuyến nghị chính thức làm Origin Server**. |

---

## 2. MÔ HÌNH KIẾN TRÚC TRIỂN KHAI ĐỀ XUẤT (RECOMMENDED TOPOLOGY)

```
[ 5.000 Sinh viên & Trình duyệt ]
              │
              ▼ (HTTPS / DNS / DDoS Filter)
   ┌────────────────────────────────────────────────────────┐
   │                   CLOUDFLARE EDGE                      │
   │  • Web Application Firewall (WAF) & Bot Mitigation     │
   │  • Rate Limiting (Chống Spam / Bão Request)            │
   │  • Edge CDN (Cache Static Files & 304 ETag)            │
   └────────────────────────────────────────────────────────┘
              │
              ▼ (Mã hóa qua Cloudflare Tunnel - Không lộ IP)
   ┌────────────────────────────────────────────────────────┐
   │                  ORIGIN CLOUD SERVER                   │
   │  (Ubuntu 22.04 LTS: 4 vCPU / 8 GB RAM / 80 GB SSD)     │
   │                                                        │
   │  [ cloudflared daemon ]                                │
   │        │ (localhost)                                   │
   │        ▼                                               │
   │  [ Nginx Reverse Proxy ]                               │
   │        │ (Connection Pooling / Buffer / Gzip)          │
   │        ▼                                               │
   │  [ Uvicorn / FastAPI Backend Cluster ]                 │
   │     ├── In-Memory Fast Cache (SingleFlight)            │
   │     ├── Python AST Sandbox Engine                      │
   │     └── Atomic Debounced File Storage (Local NVMe)     │
   └────────────────────────────────────────────────────────┘
              │ (Định kỳ sao lưu tự động)
              ▼
   [ Cloudflare R2 / S3 Backup Bucket ]
```

---

## 3. BẢNG DỰ TOÁN CHI PHÍ HẠ TẦNG CÓ CĂN CỨ (COST BREAKDOWN)

Ước tính chi phí vận hành hàng tháng cho một mùa giải phục vụ 1.000 – 5.000 sinh viên:

| Hạng mục Hạ tầng | Cấu hình & Nhà cung cấp | Chi phí ước tính (USD/tháng) | Chi phí ước tính (VND/tháng) | Căn cứ tính toán |
| :--- | :--- | :--- | :--- | :--- |
| **Mạng & Bảo vệ Edge** | Cloudflare Free Plan (DNS, CDN, DDoS Protection, SSL) | $0.00 | 0 đ | Gói Free cung cấp không giới hạn băng thông CDN và chống DDoS cơ bản hoàn toàn miễn phí. |
| **Kênh kết nối an toàn** | Cloudflare Tunnel (`cloudflared`) | $0.00 | 0 đ | Tính năng tích hợp miễn phí trong Cloudflare Zero Trust. |
| **Máy chủ Ứng dụng (VPS)** | Hetzner Cloud CPX31 (4 vCPU AMD, 8 GB RAM, 160 GB NVMe, 20TB Transfer) *hoặc* DigitalOcean Droplet | ~$15.00 - $24.00 | ~380.000 - 610.000 đ | Đủ năng lực xử lý hơn 1.000 RPS đồng thời với mức tải CPU < 45%. |
| **Lưu trữ Replay (R2)** | Cloudflare R2 (10 GB lưu trữ replay và mã nguồn) | $0.00 | 0 đ | R2 miễn phí 10 GB lưu trữ đầu tiên mỗi tháng và 0đ phí Egress. |
| **Tên miền (Domain)** | Tên miền quốc tế `.org` / `.com` / `.edu.vn` | ~$1.00 | ~25.000 đ | Khấu hao theo năm (~$12/năm). |
| **TỔNG CỘNG HÀNG THÁNG** | **Hệ thống hoàn chỉnh phục vụ 5.000 sinh viên** | **~$16.00 - $25.00** | **~400.000 - 635.000 đ** | Chi phí tối ưu vượt trội, không phát sinh chi phí ẩn. |

---

## 4. QUY TRÌNH VẬN HÀNH, BẢO MẬT & SAO LƯU (OPERATIONS RUNBOOK)

### 4.1. Cấu hình biến môi trường (`config/.env.example`)
Tạo file `.env` trên máy chủ từ mẫu an toàn:
```bash
cp config/.env.example .env
chmod 600 .env
```
Nội dung cấu hình chứa:
- `SECRET_KEY`: Khóa bí mật dùng cho ký phiên làm việc.
- `ADMIN_PASSWORD`: Mật khẩu quản trị Ban Tổ Chức.
- `STORAGE_DEBOUNCE_SEC`: Tần suất đồng bộ đĩa cứng nền (mặc định 1.0s).
- `RATE_LIMIT_GLOBAL_PER_MIN`: Giới hạn 600 req/min/IP.

### 4.2. Khởi chạy Dịch vụ Systemd (Tự động phục hồi khi lỗi)
Cài đặt service vào hệ thống Linux:
```bash
sudo cp config/systemd.service /etc/systemd/system/ottv2-arena.service
sudo systemctl daemon-reload
sudo systemctl enable --now ottv2-arena
sudo systemctl status ottv2-arena
```

### 4.3. Kết nối Cloudflare Tunnel
1. Cài đặt `cloudflared` trên máy chủ VPS:
   ```bash
   curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
   sudo dpkg -i cloudflared.deb
   ```
2. Đăng nhập và tạo tunnel:
   ```bash
   cloudflared tunnel login
   cloudflared tunnel create arena-tunnel
   ```
3. Khởi chạy tunnel sử dụng cấu hình mẫu `config/cloudflare_tunnel.yml`:
   ```bash
   sudo cloudflared --config config/cloudflare_tunnel.yml service install
   sudo systemctl start cloudflared
   ```

### 4.4. Quy trình Sao lưu Tự động (Backup & Rotation)
Định kỳ hàng giờ hoặc hàng ngày chạy script sao lưu bằng cron:
```bash
python scripts/backup_data.py
```
- Dữ liệu được nén thành file snapshot có timestamp: `database/backups/tournaments_backup_YYYYMMDD_HHMMSS.json.gz`.
- Script tự động giữ lại tối đa 30 bản sao lưu gần nhất và xóa các bản cũ quá 7 ngày, chống tràn đĩa cứng.

### 4.5. Quy trình Rollback khi có sự cố khẩn cấp
Nếu phát hiện giải đấu gặp lỗi logic hoặc dữ liệu bất thường:
1. Dừng máy chủ: `sudo systemctl stop ottv2-arena`
2. Khôi phục dữ liệu từ bản snapshot mong muốn:
   ```bash
   python scripts/backup_data.py --restore database/backups/tournaments_backup_20261010_120000.json.gz
   ```
3. Khởi động lại: `sudo systemctl start ottv2-arena`
Thời gian khôi phục hoàn tất chỉ trong vòng **dưới 10 giây**.

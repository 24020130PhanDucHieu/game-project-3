# TÀI LIỆU HƯỚNG DẪN MÔI TRƯỜNG PHÁT TRIỂN CỤC BỘ (LOCAL DEVELOPMENT GUIDE)

Tài liệu này cung cấp hướng dẫn toàn diện để cài đặt, khởi chạy, kiểm thử và vận hành hệ thống **OTTV2 AI Bot Arena** trên máy phát triển cá nhân (Windows, macOS hoặc Linux).

---

## 1. YÊU CẦU MÔI TRƯỜNG (PREREQUISITES)

- **Python:** Phiên bản 3.10 trở lên.
- **Git:** Quản lý phiên bản mã nguồn.
- **Trình biên dịch C++ (Tùy chọn):** GCC / G++ (MinGW trên Windows, `build-essential` trên Linux) nếu muốn thử nghiệm bot bằng C++.
- **Docker & Docker Compose (Tùy chọn):** Nếu muốn chạy môi trường container hóa.

---

## 2. KHỞI CHẠY BẰNG PYTHON TRỰC TIẾP (DIRECT PYTHON)

### Bước 1: Clone và kích hoạt môi trường ảo
```bash
# Di chuyển vào thư mục dự án
cd project-tuan3

# Tạo môi trường ảo
python -m venv venv

# Kích hoạt môi trường ảo:
# Trên Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# Trên Linux / macOS:
source venv/bin/activate
```

### Bước 2: Cài đặt dependencies
```bash
pip install -r requirements.txt
```

### Bước 3: Thiết lập cấu hình môi trường
```bash
cp config/.env.example .env
```

### Bước 4: Khởi chạy máy chủ phát triển
```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
- **Địa chỉ truy cập Web:** `http://127.0.0.1:8000`
- **Tài liệu API Swagger tự động:** `http://127.0.0.1:8000/docs`
- **Healthcheck & Metrics:** `http://127.0.0.1:8000/health` và `http://127.0.0.1:8000/metrics`

---

## 3. KHỞI CHẠY BẰNG DOCKER & DOCKER COMPOSE

Dự án đã được cấu hình sẵn `Dockerfile` đa tầng an toàn và `docker-compose.yml`:

```bash
# Khởi chạy toàn bộ hệ thống
docker-compose up -d

# Xem log thời gian thực
docker-compose logs -f

# Dừng hệ thống
docker-compose down
```
Dữ liệu thi đấu được lưu trữ liên tục (persistent) tại Docker Volume `arena-data`.

---

## 4. BỘ LỆNH TỰ ĐỘNG HÓA VỚI MAKEFILE

Dự án hỗ trợ các lệnh tiện ích nhanh thông qua `Makefile`:

| Lệnh | Mục đích |
| :--- | :--- |
| `make run` | Khởi chạy server local với reload tự động |
| `make test` | Chạy bộ kiểm thử chức năng tự động |
| `make test-e2e` | Chạy 8 kịch bản kiểm thử toàn trình Arena |
| `make bench` | Thực thi kiểm thử chịu tải tăng dần 1K -> 3K -> 5K VUs |
| `make backup` | Tự động tạo bản sao lưu dữ liệu `.json.gz` |
| `make docker-up` | Khởi động hệ thống qua Docker Compose |

---

## 5. KIỂM THỬ HỒI QUY (REGRESSION TESTING)

Trước khi commit bất kỳ thay đổi nào, hãy đảm bảo tất cả các bài test vượt qua 100%:

```bash
# 1. Kiểm thử tích hợp tĩnh HTML / CSS / JS
python tests/test_static_html.py

# 2. Kiểm thử toàn trình vòng đời Đấu trường (8 kịch bản)
python tests/test_arena_lifecycle.py

# 3. Kiểm thử tải hiệu năng cao
python scripts/benchmark_load.py
```

---

## 6. SAO LƯU & PHỤC HỒI DỮ LIỆU CỤC BỘ

- **Sao lưu tức thì:**
  ```bash
  python scripts/backup_data.py
  ```
  File sao lưu được nén tại `database/backups/tournaments_backup_YYYYMMDD_HHMMSS.json.gz`.

- **Phục hồi (Rollback):**
  ```bash
  python scripts/backup_data.py --restore database/backups/<ten_file_backup>.json.gz
  ```

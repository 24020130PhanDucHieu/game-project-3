# 🎮 Freshman Bot Arena - Hệ Thống Giải Đấu OTTV2 ICPC K69

Hệ thống Đấu trường Lập trình Đối kháng Trí tuệ Nhân tạo dành cho **Tân sinh viên năm nhất K69** thi đấu tựa game Oẳn Tù Tì V2 (**OTTV2**) theo phong cách thi đấu thuật toán **ICPC**.

---

## 🏛️ Cấu Trúc Dự Án (Clean Architecture)

Dự án được chuẩn hóa theo đúng cấu trúc tiêu chuẩn phân tách rõ rệt giữa Tầng Điều phối (Go Backend API Gateway), Tầng Thực thi & Sandbox (Python Bot Runner Worker), và Tầng Giao diện Web (Modular Frontend):

```text
project-tuan3/
├── backend/
│   ├── go.mod
│   ├── go.sum
│   ├── cmd/
│   │   └── server/
│   │       └── main.go
│   ├── internal/
│   │   ├── config/
│   │   ├── handler/
│   │   │   ├── http/
│   │   │   └── websocket/
│   │   ├── middleware/
│   │   ├── service/
│   │   ├── repository/
│   │   ├── model/
│   │   ├── dto/
│   │   ├── adapter/
│   │   └── observability/
│   └── migrations/
├── frontend/
│   ├── pages/
│   ├── templates/
│   ├── css/
│   │   ├── base/
│   │   ├── layout/
│   │   ├── components/
│   │   ├── pages/
│   │   └── themes/
│   ├── js/
│   │   ├── core/
│   │   ├── api/
│   │   ├── auth/
│   │   ├── tournaments/
│   │   ├── matches/
│   │   ├── arena/
│   │   ├── websocket/
│   │   └── components/
│   └── assets/
├── bot-runner/
├── database/
├── config/
├── deploy/
├── scripts/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── load/
│   └── security/
├── docs/
├── .gitignore
├── .dockerignore
├── Makefile
└── README.md
```

---

## 🚀 Hướng Dẫn Vận Hành

### 1. Khởi chạy Bot Runner (Python Engine Worker)
```bash
make run-runner
# Hoặc: cd bot-runner && python main.py
```
> Lắng nghe tại: `http://127.0.0.1:8001`

### 2. Khởi chạy Backend (Go API Gateway & Static Server)
```bash
make run-backend
# Hoặc: cd backend && go run cmd/server/main.go
```
> Lắng nghe tại: `http://127.0.0.1:8080` (Tự động phục vụ API Gateway & Web Frontend)

### 3. Mở Đường Hầm Cloudflare Tunnel (Zero-Cost Public URL)
Mở cổng an toàn ra toàn cầu mà không cần IP tĩnh hay mở port modem:
```bash
make tunnel
# Hoặc: python scripts/start_cloudflare_tunnel.py 8080
# Hoặc chạy: .\cloudflared.exe tunnel --url http://127.0.0.1:8080
```
Terminal sẽ hiển thị đường link công khai có định dạng:
`https://<unique-id>.trycloudflare.com`

---

## 🧪 Kiểm Thử Hệ Thống (Automated Test Suite)

Chạy tất cả các bài kiểm thử:
```bash
make test
```
Hoặc chạy từng bộ riêng biệt:
- **Kiểm thử đơn vị luật & FSM:** `make test-unit`
- **Kiểm thử bảo mật cô lập Sandbox:** `make test-security`
- **Kiểm thử chịu tải hàng loạt:** `make test-load`

# Freshman Bot Arena

Nền tảng tổ chức giải đấu bot Oẳn Tù Tì V2 dành cho sinh viên năm nhất

Go API Gateway · Python Bot Runner · Vanilla JS Frontend

## Giới thiệu

**Freshman Bot Arena** là hệ thống tổ chức giải đấu bot Oẳn Tù Tì (Rock–Paper–Scissors) theo thể thức đấu loại trực tiếp. Người chơi nộp mã bot, hệ thống chạy bot trong môi trường sandbox, tự động xếp cặp, thi đấu và cập nhật bảng đấu theo thời gian thực.

Hệ thống phục vụ giải đấu ICPC tân sinh viên với khả năng chịu tải hàng nghìn người dùng đồng thời.

---

## Mục lục

- [Kiến trúc hệ thống](#-kiến-trúc-hệ-thống)
- [Cấu trúc thư mục](#-cấu-trúc-thư-mục)
- [Công nghệ sử dụng](#-công-nghệ-sử-dụng)
- [Chạy local](#-chạy-local)
- [Biến môi trường](#-biến-môi-trường)
- [Đăng nhập và vận hành giải](#-đăng-nhập-và-vận-hành-giải)
- [API Endpoints](#-api-endpoints)
- [Kiểm thử](#-kiểm-thử)
- [Build và triển khai](#-build-và-triển-khai)
- [Ghi chú Sandbox](#-ghi-chú-sandbox)
- [Tài liệu tham khảo](#-tài-liệu-tham-khảo)

---

## Kiến trúc hệ thống

Hệ thống theo mô hình **client-server phân tán** với ba tầng chính:

```text
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (HTML/JS/CSS)                   │
│          Vanilla JS · Shared State · WebSocket Client       │
└──────────────────────────┬──────────────────────────────────┘
                           │  REST API + WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│                    GO API GATEWAY (:8080)                   │
│   Middleware: Logger → Recovery → CORS → Rate Limit → Auth  │
│   Handler → Service → Repository → Database                 │
└──────────────────────────┬──────────────────────────────────┘
                           │  Internal Adapter
┌──────────────────────────▼──────────────────────────────────┐
│                  PYTHON BOT RUNNER (:8001)                  │
│   Sandbox Execution · FSM Engine · Matchmaker · Ranking     │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│        PostgreSQL (Production)  │  JSON Store (Local)       │
└─────────────────────────────────────────────────────────────┘
```

### Luồng xử lý chính

| Luồng | Mô tả |
| :--- | :--- |
| **HTTP API** | Client → Middleware (auth, CORS) → Handler → Service → Repository → DB |
| **WebSocket** | Cập nhật trạng thái giải, tiến độ trận, kết quả bot; tải lại snapshot khi reconnect |
| **Bot Execution** | Nộp code → Sandbox (timeout + giới hạn tài nguyên) → FSM Engine → Kết quả → Bracket tiến |

### Luồng triển khai một giải đấu

```text
1. Admin tạo giải đấu        →  Sinh cây bảng đấu
2. Đội đăng ký (MSSV/SBD)    →  Nhận tài khoản truy cập
3. Hệ thống xếp cặp          →  Dựa trên ranking
4. Bot thi đấu               →  Python runner chạy trong sandbox
5. Xử lý kết quả             →  Xác định đội thắng, tiến nhánh
6. Chung kết                 →  Tuyên bố vô địch
```

---

## Cấu trúc thư mục

```text
project-tuan3/
├── backend/               # Go API gateway, WebSocket, service và migration
│   ├── cmd/server/        # Điểm khởi động HTTP server
│   ├── internal/          # Handler, middleware, model, repository và service
│   └── migrations/        # Migration cơ sở dữ liệu PostgreSQL
├── bot-runner/            # Python worker và engine chạy các trận đấu bot
│   └── app/               # API, engine, matchmaker, repository và sandbox
├── frontend/              # Giao diện web HTML, JavaScript, CSS và SDK
│   ├── templates/         # Các template trang, partials và modal
│   ├── static/            # JavaScript, CSS và hình ảnh nguồn
│   ├── assets/            # SDK và tài nguyên frontend
│   └── dist/              # Bản build frontend để triển khai tĩnh (git bỏ qua)
├── config/                # Cấu hình môi trường, reverse proxy và tunnel
├── database/              # Schema và dữ liệu JSON dùng khi phát triển local
├── deploy/                # Docker Compose, Dockerfile và cấu hình Render
├── docs/                  # Tài liệu API, kiến trúc, triển khai và báo cáo
├── scripts/               # Script build, backup, benchmark và vận hành
├── tests/                 # Test unit, integration, e2e, load và security
├── data/                  # Tài nguyên và script phục vụ phát triển giao diện
├── Dockerfile             # Dockerfile ở cấp dự án
├── Makefile               # Các lệnh build, test và vận hành
└── README.md              # Tài liệu hướng dẫn dự án
```

> [!NOTE]
> Các thư mục `dist/`, file thực thi và dữ liệu tạm có thể được sinh tự động.
> Nên chỉnh sửa mã nguồn trong `backend/`, `bot-runner/` và `frontend/` thay vì các bản build.

### Chi tiết các module

<details>
<summary><b>🔷 Backend (Go)</b></summary>

- **`cmd/server/`** — Khởi động HTTP server, cấu hình routes và middleware
- **`internal/handler/`** — Xử lý HTTP requests và validation (`http/`, `websocket/`)
- **`internal/middleware/`** — Logging, recovery, CORS, rate limiting
- **`internal/model/`** — Cấu trúc dữ liệu và DTOs
- **`internal/repository/`** — Tầng trừu tượng truy cập dữ liệu (PostgreSQL)
- **`internal/service/`** — Business logic (quản lý giải đấu, matchmaking)
- **`migrations/`** — SQL migrations cho PostgreSQL

</details>

<details>
<summary><b>🐍 Bot Runner (Python)</b></summary>

- **`app/main.py`** — Entry point, khởi động worker
- **`app/core/`** — Cấu hình, cache, rate limiting
- **`app/api/`** — API endpoints giao tiếp với gateway
- **`app/engine/`** — Game logic: rules engine, FSM matching
- **`app/matchmaker/`** — Thuật toán xếp cặp và hệ thống ranking
- **`app/sandbox/`** — Chạy code bot trong môi trường cô lập
- **`app/models/`** — Data schemas (Pydantic)

</details>

<details>
<summary><b>🎨 Frontend</b></summary>

- **`templates/`** — HTML structure, được Go ghép khi khởi động
- **`static/`** — JS, CSS phục vụ động, hot-reload khi phát triển
- **`assets/bots_sdk/`** — Bot SDK và mẫu code
- **`dist/`** — Bản build tối ưu cho production

Các module JS chính:

| Module | Chức năng |
| :--- | :--- |
| `core/state.js` | Quản lý trạng thái dùng chung |
| `auth/` | Đăng nhập, phân quyền |
| `tournaments/` | Giao diện quản lý giải đấu |
| `arena/` | Giao diện thi đấu |
| `realtime/` | Đồng bộ WebSocket |
| `studio/` | Trình soạn thảo code bot |
| `history/` | Replay, lịch sử trận đấu |

</details>

Go ghép templates khi khởi động, phục vụ JavaScript/CSS tại `/static/` và SDK tại `/assets/`. Chỉ sửa source trong `templates/` và `static/`; **không sửa `dist/`**. Icon SVG nằm trong project, không cần tải thư viện icon.

`frontend/index.html` chỉ là trang tải nhỏ để các hosting cũ đang phục vụ trực tiếp thư mục `frontend/` vẫn hoạt động; nó ghép templates qua `static/js/template-loader.js`. Khi cấu hình hosting mới, dùng bản build `frontend/dist/` để trình duyệt nhận HTML hoàn chỉnh ngay từ đầu.

JavaScript dùng các script `defer` theo thứ tự trong `templates/partials/scripts.html`; các file tính năng dùng trạng thái chung từ `static/js/core/state.js`. File `static/js/app.js` khởi động sau khi toàn bộ tính năng đã tải. Xem thêm [frontend/README.md](frontend/README.md).

---

## 🛠 Công nghệ sử dụng

| Tầng | Công nghệ |
| :--- | :--- |
| **Backend** | Go 1.26 · [Gin](https://github.com/gin-gonic/gin) · [Gorilla WebSocket](https://github.com/gorilla/websocket) |
| **Bot Runner** | Python 3 · [FastAPI](https://fastapi.tiangolo.com/) · [Uvicorn](https://www.uvicorn.org/) · [Pydantic](https://docs.pydantic.dev/) |
| **Frontend** | HTML5 · Vanilla JavaScript (không framework) · CSS3 · SVG inline |
| **Database** | PostgreSQL (production) · JSON store (local) |
| **Triển khai** | Docker · Docker Compose · Nginx · Cloudflare Tunnel · Render |

---

## 🚀 Chạy local

### Yêu cầu

- Go 1.26+
- Python 3.10+
- (Tùy chọn) Docker & Docker Compose

### Các bước

**1. Cài đặt dependencies Python**

```powershell
cd bot-runner
python -m pip install -r requirements.txt
```

**2. Khởi động Bot Runner** (terminal 1)

```powershell
cd bot-runner
python main.py
```

**3. Khởi động Go Backend** (terminal 2)

```powershell
cd backend
go run ./cmd/server
```

**4. Mở trình duyệt**

```text
http://localhost:8080
```

> [!TIP]
> Khi phát triển local, backend dùng JSON store nếu chưa cấu hình `DATABASE_URL`.
> Khi deploy production, backend **yêu cầu** PostgreSQL qua `DATABASE_URL` để tránh mất dữ liệu khi container khởi động lại.

### Lệnh nhanh với Makefile

```bash
make help            # Xem danh sách lệnh
make run-backend     # Chạy Go API gateway (:8080)
make run-runner      # Chạy Python worker (:8001)
make test            # Chạy toàn bộ test
make frontend-build  # Build frontend tĩnh vào frontend/dist
make docker-up       # Khởi động Docker Compose
```

---

## ⚙ Biến môi trường

Cấu hình mẫu nằm tại [`config/.env.example`](config/.env.example).

### Backend (Go)

| Biến | Mô tả | Bắt buộc |
| :--- | :--- | :---: |
| `ADMIN_PASSWORD` | Mật khẩu đăng nhập Ban Tổ Chức | ✅ |
| `SESSION_SECRET` | Khóa ký phiên (mặc định dùng `ADMIN_PASSWORD`) | ⬜ |
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL | ✅ (production) |
| `CORS_ORIGIN` | Danh sách origin cách nhau bằng dấu phẩy | ✅ |
| `PORT` | Cổng HTTP server | ⬜ |

### Bot Runner (Python)

| Biến | Mô tả | Mặc định |
| :--- | :--- | :--- |
| `ENVIRONMENT` | Môi trường chạy | `production` |
| `SECRET_KEY` | Khóa bảo mật | — |
| `ALLOWED_ORIGINS` | Origin được phép | — |
| `DATA_DIR` | Thư mục lưu dữ liệu | `data` |
| `MAX_SUBMISSIONS_PER_MATCH` | Giới hạn bài nộp mỗi trận | `200` |
| `CACHE_ENABLED` | Bật cache in-memory | `true` |
| `CACHE_DEFAULT_TTL_SEC` | TTL cache mặc định (giây) | `2` |
| `RATE_LIMIT_ENABLED` | Bật rate limiting | `true` |
| `RATE_LIMIT_PER_MINUTE` | Giới hạn request mỗi phút | `600` |
| `RATE_LIMIT_SUBMIT_PER_MINUTE` | Giới hạn bài nộp mỗi phút | `60` |
| `SANDBOX_TIMEOUT_SEC` | Timeout chạy bot (giây) | `0.5` |
| `SANDBOX_MAX_WORKERS` | Số worker sandbox tối đa | `8` |

---

## 🔑 Đăng nhập và vận hành giải

- **Ban Tổ Chức**: Đặt `ADMIN_PASSWORD` trong biến môi trường backend. Không dùng mật khẩu mẫu trong mã nguồn.
- **Đội thi**: Dùng MSSV/SBD làm tài khoản, mật khẩu cố định là `k69` + MSSV/SBD.
  Ví dụ: `24020001` / `k6924020001`. Có thể đăng nhập ngay sau khi đăng ký đội, trước khi xếp lịch.
- **Chọn trận**: Admin và đội chọn trận trên cây bảng đấu trước khi vào tab Trận đấu. Khi chuyển giải, cần chọn trận thuộc giải đó.
- **Phiên đăng nhập**: Ký với thời hạn 7 ngày, giữ qua F5 hoặc restart nếu `SESSION_SECRET` ổn định. Nếu không cấu hình biến này, backend dùng `ADMIN_PASSWORD` làm cơ sở ký phiên. Thay đổi khóa ký làm phiên cũ hết hiệu lực.
- **Bảo mật**: API công khai không trả credential hash hoặc mã nguồn đội khác. WebSocket thông báo theo giải, giữ kết nối bằng heartbeat và tải lại snapshot khi kết nối trở lại.
- **Vòng đấu**: Máy chủ tự chuyển round theo thời điểm đã lưu. Mỗi round và mỗi trận mới cần bài nộp mới; không cần đăng nhập lại mỗi round. Không xếp lại nhánh hoặc xóa đội khi giải đã có kết quả.
- **Trạng thái trình duyệt**: Bản nháp, ngôn ngữ, vị trí replay, tab nhật ký và lựa chọn giải/trận được lưu trong trình duyệt theo tài khoản và trận.
- **CORS**: `CORS_ORIGIN` nhận danh sách origin cách nhau bằng dấu phẩy. Đặt đúng domain frontend khi triển khai.

---

## 🔌 API Endpoints

### Go Backend

| Nhóm | Đường dẫn | Mô tả |
| :--- | :--- | :--- |
| Auth | `/api/v1/auth` | Xác thực và quản lý phiên |
| Tournaments | `/api/v1/tournaments` | Tạo, quản lý và theo dõi giải đấu |
| Matches | `/api/v1/matches` | Quản lý trận đấu |
| Bots | `/api/v1/bots` | Nộp và thực thi bot |
| Arena | `/api/v1/arena` | Giao diện thi đấu realtime |
| WebSocket | `/ws` | Cập nhật trạng thái theo thời gian thực |

Chi tiết đầy đủ xem tại [docs/API.md](docs/API.md).

### Bot Runner

- Nộp và thực thi code
- Yêu cầu matchmaking
- Poll kết quả trận đấu

---

## 🧪 Kiểm thử

```powershell
# Test Go backend
cd backend
go test ./...

# Test unit (rules, FSM)
python -m unittest discover -s tests/unit -p "test_*.py"

# Test bảo mật sandbox
python tests/security/test_sandbox_security.py

# Build binary kiểm chứng
go build -C backend -o bin/arena-verification.exe ./cmd/server/main.go

# Test E2E (cần Playwright)
python -m pip install playwright
python -X utf8 tests/e2e/test_reliability.py

# Kiểm tra cú pháp worker
cd bot-runner
python -m py_compile main.py app/repository/database.py app/sandbox/runner.py
```

Hoặc chạy toàn bộ bằng một lệnh:

```bash
make test
```

### Phân loại test

| Thư mục | Loại test |
| :--- | :--- |
| `tests/unit/` | Game rules, FSM, credentials |
| `tests/integration/` | Luồng round, tích hợp hệ thống |
| `tests/e2e/` | Vòng đời arena, giải đấu đầy đủ, độ tin cậy |
| `tests/load/` | Kiểm thử tải |
| `tests/security/` | Bảo mật sandbox |

Kết quả và phạm vi kiểm thử: [docs/VERIFICATION_RELIABILITY.md](docs/VERIFICATION_RELIABILITY.md).

---

## 📦 Build và triển khai

### Docker

```powershell
docker build -t ottv2-arena -f deploy/Dockerfile .
```

Hoặc dùng Docker Compose:

```bash
make docker-build
make docker-up
```

### Hosting tĩnh (Cloudflare Workers/Pages)

```powershell
python scripts/build_frontend.py
```

Đặt thư mục assets/publish là **`frontend/dist`**. Lệnh build ghép cùng các template mà Go sử dụng và chép JS, CSS, SDK sang thư mục này.

Xem thêm: [docs/CLOUD_DEPLOYMENT.md](docs/CLOUD_DEPLOYMENT.md) · [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md)

---

## 🔒 Ghi chú Sandbox

Bot Python chạy trong subprocess có **timeout** và **giới hạn tài nguyên**.

> [!WARNING]
> Native C++ bị tắt ở production vì container hiện tại chưa cung cấp runtime cô lập riêng cho từng lần chạy.
> Có thể bật C++ trong môi trường local phục vụ phát triển; trước khi dùng C++ trong giải công khai, cần triển khai sandbox native riêng.

---

## 📚 Tài liệu tham khảo

| Tài liệu | Nội dung |
| :--- | :--- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Kiến trúc hệ thống chi tiết |
| [docs/API.md](docs/API.md) | Đặc tả API đầy đủ |
| [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md) | Hướng dẫn phát triển local |
| [docs/CLOUD_DEPLOYMENT.md](docs/CLOUD_DEPLOYMENT.md) | Triển khai lên cloud |
| [docs/BENCHMARK_REPORT.md](docs/BENCHMARK_REPORT.md) | Báo cáo hiệu năng |
| [docs/VERIFICATION_RELIABILITY.md](docs/VERIFICATION_RELIABILITY.md) | Kiểm chứng độ tin cậy |
| [docs/VERIFICATION_BATTLE_UI.md](docs/VERIFICATION_BATTLE_UI.md) | Kiểm chứng giao diện thi đấu |
| [docs/VERIFICATION_FRONTEND.md](docs/VERIFICATION_FRONTEND.md) | Kiểm chứng frontend |
| [docs/BASELINE_AUDIT.md](docs/BASELINE_AUDIT.md) | Kiểm toán baseline |

---

## 💡 Gợi ý cải tiến

- [ ] Thêm Docker health checks cho các service
- [ ] Triển khai circuit breaker cho các lời gọi API bên ngoài
- [ ] Bổ sung unit test toàn diện cho các edge case
- [ ] Tối ưu logic reconnect WebSocket cho mạng không ổn định
- [ ] Thêm API versioning cho tương thích ngược
- [ ] Cải thiện error logging và monitoring
- [ ] Thiết lập CI/CD pipeline tự động cho deploy

---
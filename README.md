# Freshman Bot Arena

Nền tảng tổ chức giải đấu bot Oẳn Tù Tì V2. Frontend được chia thành HTML templates, JavaScript theo chức năng và CSS theo thành phần; Go API gateway phục vụ web và Python worker xử lý giải đấu.

## Cấu trúc thư mục dự án

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
│   └── dist/              # Bản build frontend để triển khai tĩnh
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

> Các thư mục `dist/`, file thực thi và dữ liệu tạm có thể được sinh tự động. Nên chỉnh sửa mã nguồn trong `backend/`, `bot-runner/` và `frontend/` thay vì các bản build.

---

## Phân tích hệ thống chi tiết

### 1. Tổng quan về kiến trúc hệ thống

Hệ thống được thiết kế theo mô hình **client-server** phân tán với ba tầng chính:

- **Tầng Backend (Go)**: Xử lý API, WebSocket, quản lý tornei, authentication, và logic game core
- **Tầng Bot Runner (Python)**: Chạy các bot trong môi trường sandbox, thực thi code, quản lý trận đấu
- **Tầng Frontend (HTML/JS/CSS)**: Giao diện người dùng, quản lý torneio, xem kết quả, tương tác realtime

### 2. Phân tích từng thành phần

#### a) Backend (`backend/`)

**Mục đích**: Lớp trung gian và logic chủ yếu

- **`cmd/server/`**: Điểm khởi động HTTP server Go, cấu hình routes và middleware
- **`internal/`**: Chứa các module quan trọng:
  - **Handler**: Xử lý HTTP requests, validation
  - **Middleware**: Logging, recovery, CORS, authentication
  - **Model**: Dữ liệu structure, DTOs
  - **Repository**: Abstract layer cho data access
  - **Service**: Business logic (tournament management, matchmaking)
- **`migrations/`**: SQL migrations cho PostgreSQL schema evolution

**Luồng xử lý chính**:
1. Client request -> Go Gateway -> Middleware (auth, CORS) -> Handler -> Service/Repository -> Database
2. WebSocket connections maintained for real-time updates
3. Tournament bracket management với auto-progression

#### b) Bot Runner (`bot-runner/`)

**Mục đích**: Chạy và quản lý bot trong các trận đấu

- **`app/main.py`**: Entry point, khởi động worker
- **`app/core/`**: Cấu hình, cache, rate limiting
- **`app/api/`**: API endpoints cho bot-runner communication
- **`app/engine/`**: Game logic - rules engine, FSM matching
- **`app/matchmaker/`**: Matchmaking algorithms, ranking systems
- **`app/models/`**: Data schemas (Pydantic)

**Quá trình chạy bot**:
1. Submit bot code -> Sandbox execution với timeout/resources limit
2. Matchmaking: pairing bots dựa trên ranking
3. Game engine: FSM (Finite State Machine) matching giữa hai bots
4. Result collection và storage

#### c) Frontend (`frontend/`)

**Mục đích**: Giao diện người dùng

- **Templates (`templates/`)**: HTML structure, được Go merge khi khởi động
- **Static assets (`static/`)**: JS, CSS - được serve dynamically, hot-reload durante development
- **Assets (`assets/`)**: Bot SDK, mẫu code
- **Dist (`dist/`)**: Build sản phẩm - chứa HTML/CSS/JS tối ưu cho production

**Các module chính**:
- `core/state.js`: Shared state management
- `auth/`: Login, authorization
- `tournaments/`: Tournament management UI
- `arena/`: Battle interface
- `realtime/`: WebSocket synchronization
- `studio/`: Bot code editor
- `history/`: Replays, match history

#### d) Database & Storage

- **PostgreSQL**: Production schema (quando có DATABASE_URL)
- **JSON Store (`database/tournaments_store.json`)**: Local development fallback
- **Go summaries (`backend/go.mod`, `backend/go.sum`)**: Dependencies management

### 3. Luồng dữ liệu và giao tiếp

#### a) HTTP API Flow

```
Client → Go Backend (REST API)
  ↓
Authentication (ADMIN_PASSWORD / JWT-like session)
  ↓
Route handling (tournaments, matches, bots, auth)
  ↓
Business logic (matchmaking, bracket management)
  ↓
Database operations (PostgreSQL / JSON store)
  ↓
Response → Client
```

#### b) WebSocket Real-time Flow

```
Client ↔ Go Backend (WebSocket)
  │
  ├── Tournament state updates
  ├── Match progress notifications
  ├── Bot result streaming
  └── Snapshot reload on reconnect
```

#### c) Bot Execution Flow

```
Bot Code Submit → Python Bot Runner
  ↓
Sandbox Execution (Python subprocess với timeout)
  ↓
Game Engine (FSM matching)
  ↓
Result: Win/Loss/Draw → Backend → Frontend update
```

### 4. Chi tiết kỹ thuật

#### a) Go Backend

- Sử dụng **Chi router** cho routing
- **WebSocket** cho real-time updates
- **SQL migrations** cho schema management
- **Middleware chain**: logging → recovery → CORS → auth
- **Session management**: 7-day session với SESSION_SECRET

#### b) Python Bot Runner

- **Subprocess execution** với resource limits
- **Pydantic schemas** cho data validation
- **Rule engine** cho game logic
- **Ranking system** cho matchmaking
- **Cache layer** cho performance

#### c) Frontend Architecture

- **Vanilla JS** (không framework) - maintain lightweight
- **Deferred scripts loading** theo order trong partials
- **Shared state** qua `state.js`
- **Template merging** bởi Go server
- **SVG icons** inline (không dependencies)

### 5. Luồng triển khai tournament

1. **Tournament Creation**: Admin creates tournament → Bracket generated
2. **Team Registration**: Teams sign up với MSSV/SBD accounts
3. **Match Scheduling**: System pairs teams dựa trên ranking
4. **Bot Execution**: Python runner executes bot code trong sandbox
5. **Result Processing**: Winner determined → Bracket advances
6. **Final Determination**: Champion declared → Awards distributed

### 6. Khối quan trọng cần lưu ý

- **Authentication**: ADMIN_PASSWORD cho admin access, MSSV/SBD cho teams
- **Sandbox**: Python bot execution có timeout, C++ disabled ở production
- **Sessions**: 7-day expiry, phụ thuộc SESSION_SECRET
- **CORS**: Phải cấu hình chính xác domain frontend
- **Database**: Local development dùng JSON store, production cần PostgreSQL

### 7. Gợi ý cải tiến

1. **Add Docker health checks** cho các service
2. **Implement circuit breaker** cho external API calls
3. **Add more comprehensive unit tests** cho edge cases
4. **Optimize WebSocket reconnection logic** cho unstable networks
5. **Add API versioning** cho backward compatibility
6. **Implement proper error logging** và monitoring
7. **Add CI/CD pipeline** tự động cho deploy
8. **Document API endpoints** chi tiết hơn trong docs/API.md

---

## Cấu trúc bên trong các module quan trọng

*(Chi tiết có thể xem tại docs/ARCHITECTURE.md và docs/API.md)*

### Backend Routes (quantité):
- `/api/v1/auth` - Authentication
- `/api/v1/tournaments` - Tournament management
- `/api/v1/matches` - Match management
- `/api/v1/bots` - Bot submission and execution
- `/api/v1/arena` - Arena/ battle interface

### Frontend Pages:
- Trang đăng nhập, tạo/rejoin tournament
- Bảng đấu (bracket view)
- Trang trận đấu live
- History và replays
- Admin panel

### Bot Runner APIs:
- Submit code execution
- Matchmaking requests
- Result polling

## Cấu trúc frontend

```text
frontend/
├── templates/
│   ├── index.html         # Khung trang, ghép các template bên dưới
│   ├── pages/             # Tổng quan, bảng đấu, xếp hạng, trận đấu, đăng nhập...
│   ├── partials/          # Sidebar, SVG icons, danh sách scripts/styles
│   └── modals/            # Tạo/chọn giải, quản lý đội, replay, xem code...
├── static/
│   ├── js/                # core, auth, tournaments, arena, studio, history...
│   └── css/               # Style riêng cho từng thành phần/trang
├── assets/bots_sdk/        # Tài liệu và bot mẫu
└── dist/                  # Bản tự sinh để đưa lên hosting tĩnh (git bỏ qua)
```

Go ghép templates khi khởi động, phục vụ JavaScript/CSS tại `/static/` và SDK tại `/assets/`. Chỉ sửa source trong `templates/` và `static/`; không sửa `dist/`. Icon SVG nằm trong project, không cần tải thư viện icon.

`frontend/index.html` chỉ là trang tải nhỏ để các hosting cũ đang phục vụ trực tiếp thư mục `frontend/` vẫn hoạt động; nó ghép templates qua `static/js/template-loader.js`. Khi cấu hình hosting mới, dùng bản build `frontend/dist/` để trình duyệt nhận HTML hoàn chỉnh ngay từ đầu.

JavaScript hiện dùng các script `defer` theo thứ tự trong `templates/partials/scripts.html`; các file tính năng dùng trạng thái chung từ `static/js/core/state.js`. File `static/js/app.js` khởi động sau khi toàn bộ tính năng đã tải. Cách này giữ luồng đăng nhập, realtime và dữ liệu trình duyệt hiện có trong lần tách cấu trúc này. Xem thêm [frontend/README.md](frontend/README.md).

## Chạy local

Mở hai terminal:

```powershell
cd bot-runner
python main.py
```

```powershell
cd backend
go run ./cmd/server
```

Mở `http://localhost:8080`. Khi phát triển local, backend dùng JSON store nếu chưa cấu hình `DATABASE_URL`. Khi deploy production, backend yêu cầu PostgreSQL qua `DATABASE_URL` để tránh mất dữ liệu khi container khởi động lại.

## Đăng nhập và vận hành giải

- Đặt `ADMIN_PASSWORD` trong môi trường backend để bật đăng nhập Ban Tổ Chức. Không dùng mật khẩu mẫu trong mã nguồn.
- Đội dùng MSSV/SBD làm tài khoản, mật khẩu cố định là `k69` + MSSV/SBD (ví dụ `24020001` / `k6924020001`). Có thể đăng nhập ngay sau khi đăng ký đội, trước khi xếp lịch.
- Admin và đội chọn trận trên cây bảng đấu trước khi vào tab Trận đấu. Khi chuyển giải, cần chọn trận thuộc giải đó.
- Phiên ký có thời hạn 7 ngày và giữ qua F5 hoặc restart nếu `SESSION_SECRET` ổn định; nếu không cấu hình biến này, backend dùng `ADMIN_PASSWORD` làm cơ sở ký phiên. Thay đổi khóa ký làm phiên cũ hết hiệu lực.
- API công khai không trả credential hash hoặc mã nguồn đội khác. WebSocket thông báo theo giải, giữ kết nối bằng heartbeat và tải lại snapshot khi kết nối trở lại.
- Máy chủ tự chuyển round theo thời điểm đã lưu. Mỗi round và mỗi trận mới cần bài nộp mới; không cần đăng nhập lại mỗi round. Không xếp lại nhánh hoặc xóa đội khi giải đã có kết quả.
- Bản nháp, ngôn ngữ, vị trí replay, tab nhật ký và lựa chọn giải/trận được lưu trong trình duyệt theo tài khoản và trận.
- `CORS_ORIGIN` nhận danh sách origin cách nhau bằng dấu phẩy. Hãy đặt đúng domain frontend khi triển khai.

## Kiểm thử

```powershell
cd backend
go test ./...
cd ..
python -m unittest discover -s tests/unit -p "test_*.py"
python tests/security/test_sandbox_security.py
go build -C backend -o bin/arena-verification.exe ./cmd/server/main.go
python -m pip install playwright
python -X utf8 tests/e2e/test_reliability.py
cd bot-runner
python -m py_compile main.py app/repository/database.py app/sandbox/runner.py
```

## Đóng gói và triển khai — Bản tin triển khai


LẤY_DÒNG_MỚI

```powershell
docker build -t ottv2-arena -f deploy/Dockerfile .
```

TESTLINE_MARKER

Với Cloudflare Workers/Pages hoặc hosting tĩnh, chạy `python scripts/build_frontend.py` và đặt thư mục assets/publish là **`frontend/dist`**. Lệnh build ghép cùng các template mà Go sử dụng và chép JS, CSS, SDK sang thư mục này. Bản mới dùng URL assets `v=4.1`.

Kết quả và phạm vi kiểm thử: [docs/VERIFICATION_RELIABILITY.md](docs/VERIFICATION_RELIABILITY.md).

## Ghi chú sandbox

Bot Python chạy trong subprocess có timeout và giới hạn tài nguyên. Native C++ bị tắt ở production vì container hiện tại chưa cung cấp runtime cô lập riêng cho từng lần chạy. Có thể bật C++ trong môi trường local phục vụ phát triển; trước khi dùng C++ trong giải công khai, cần triển khai sandbox native riêng.

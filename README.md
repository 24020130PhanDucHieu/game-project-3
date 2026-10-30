# Freshman Bot Arena

Hệ thống tổ chức giải đấu lập trình bot Oẳn Tù Tì trên bàn cờ 9 × 9, quản lý vòng loại và chấm bài Giải AI. Người thi nộp chương trình; máy chấm chạy chương trình trong môi trường giới hạn tài nguyên và trả kết quả về hệ thống quản lý giải.

README mô tả mã nguồn và cách vận hành tại ngày 29/10/2026. Các số liệu kiểm tra tại một thời điểm không phải cam kết về công suất hoặc trạng thái hiện tại của máy chủ.

## 1. Chức năng

| Đối tượng | Chức năng chính |
| --- | --- |
| Khách | Xem tổng quan, giải đấu, bảng đấu, xếp hạng, trận đấu và hướng dẫn |
| Đội thi | Quản lý hồ sơ, nộp bot, xem kết quả, tham gia vòng loại và Giải AI |
| Ban tổ chức | Quản lý giải, luật từng giai đoạn, lịch thi đấu, đề AI, tài khoản, thông báo và hỏi đáp |
| Quản trị viên | Theo dõi máy chấm, tài nguyên, database, nhật ký và các thao tác quản trị được phân quyền |

Trợ lý AI hỗ trợ hỏi đáp dựa trên tài liệu và dữ liệu giải. Chức năng này cần khóa nhà cung cấp được cấu hình ở backend; không thay thế luật chính thức hoặc quyết định của ban tổ chức.

## 2. Kiến trúc

```text
Trình duyệt
    |
    | HTTPS: tải giao diện Next.js đã xuất tĩnh
    v
Cloudflare Workers Static Assets
    |
    | Trình duyệt gọi API qua HTTPS
    v
Go API gateway trên AWS EC2
    |-- Xác thực, phân quyền, giới hạn yêu cầu
    |-- Quản lý giải, hàng đợi, cache và lưu kết quả
    |-- PostgreSQL trên Supabase qua kết nối TLS
    |-- Máy chấm Python 1 qua mạng riêng
    |-- Máy chấm Python 2 qua mạng riêng
    |-- Nhà cung cấp AI và SMTP khi được cấu hình
```

Frontend không kết nối trực tiếp PostgreSQL và không giữ mật khẩu database. Go gateway là nơi điều phối và lưu dữ liệu. Máy chấm nhận dữ liệu cần thiết, thực hiện công việc rồi trả kết quả; không đóng vai trò database chính.

Luồng nộp bài gồm kiểm tra quyền và dữ liệu đầu vào, đưa công việc vào hàng đợi, chọn máy chấm còn khả năng xử lý, chạy chương trình, lưu kết quả rồi cập nhật giao diện. Trạng thái và lỗi phải lấy từ API; giao diện không tự tạo kết quả chấm.

## 3. Công nghệ và cấu trúc mã nguồn

| Thành phần | Công nghệ |
| --- | --- |
| Frontend | Next.js 16.4.2, React 19, TypeScript, Tailwind CSS 4 |
| API | Go theo `backend/go.mod`, Gin, PostgreSQL driver, WebSocket |
| Máy chấm | Python, FastAPI, Uvicorn, Wasmtime |
| Database | PostgreSQL; triển khai hiện tại dùng Supabase |
| Triển khai | Cloudflare Static Assets, AWS EC2, systemd; có cấu hình Docker |
| Kiểm thử | Go test/vet, Python unittest, Playwright, kiểm thử tích hợp và sandbox |

```text
backend/
  cmd/server/              Điểm khởi động Go API
  internal/                Handler, xác thực, repository, điều phối, monitoring
bot-runner/
  main.py                  API máy chấm
  app/                     Luật, engine, sandbox và xử lý bài thi
frontend/
  app/                     Điểm vào Next.js và CSS toàn cục
  components/arena/live/   Giao diện giải đấu, quản trị và banner
  public/offline/          Tài nguyên hỗ trợ chạy thử trong trình duyệt
database/                  Dữ liệu và tài liệu schema tham khảo
deploy/                    Docker, systemd, cấu hình triển khai mẫu
scripts/                   Build, deploy, backup, bảo trì và benchmark
tests/                     Unit, security, e2e và load tests
docs/                      Tài liệu chuyên đề, runbook và báo cáo kiểm tra
.github/workflows/         Kiểm thử và triển khai tự động
wrangler.jsonc             Cấu hình frontend Cloudflare
```

## 4. Frontend và trải nghiệm sử dụng

Giao diện chia thành hồ sơ đội, tổng quan, bảng đấu, xếp hạng, trận đấu, vòng loại, Giải AI, hướng dẫn và quản trị. Các khu vực quản trị phải được backend kiểm tra quyền, kể cả khi nút tương ứng đã bị ẩn trên giao diện.

Thanh điều hướng desktop mặc định chỉ hiện biểu tượng. Rê chuột vào sẽ tự mở rộng, rời chuột sẽ thu lại; không cần nút bấm. Khi dùng bàn phím, thanh mở trong lúc focus nằm bên trong. Phần mở rộng phủ lên nội dung thay vì đẩy trang qua lại. Trên màn hình nhỏ, menu vẫn hiển thị đầy đủ nhãn, quản lý focus và hỗ trợ đóng bằng Escape.

Banner tổng quan ưu tiên giải minh họa `k71 demo` khi có dữ liệu phù hợp. Banner tự đổi nội dung mỗi 4 giây khi có nhiều mục; dừng khi người dùng rê chuột, đặt focus, bấm tạm dừng hoặc khi trang bị ẩn. Việc đổi banner dùng dữ liệu đã tải, không gọi lại database sau mỗi 4 giây.

Hiệu ứng tập trung vào chuyển tab ngắn và nghiêng banner nhẹ. Không dùng vòng sáng bám chuột, hạt hoặc hiệu ứng nước. Chế độ giảm chuyển động và các mức hiệu ứng nhẹ/tắt hạn chế hoạt ảnh; nội dung vẫn sử dụng được. Giao diện có cả chế độ sáng và tối, tăng độ rõ của chữ phụ và dùng màu có chủ đích cho trạng thái giải, cảnh báo và quán quân.

Các tài nguyên engine offline được đồng bộ bằng `frontend/scripts/sync-offline-engine.mjs` trước khi chạy dev hoặc build. Chạy thử trong trình duyệt phục vụ minh họa và luyện tập; kết quả chính thức vẫn do máy chấm backend quyết định. Dữ liệu cục bộ hoặc cache trình duyệt không thay thế bản lưu trên server.

## 5. Go API và máy chấm

Go API mặc định chạy cổng `8080`. Worker Python mặc định chạy `127.0.0.1:8001`. Với nhiều máy chấm, `WORKER_URLS` chứa danh sách endpoint `/mutate-tournament`; kết nối production nên đi qua mạng riêng và có `WORKER_TOKEN`.

Phân biệt các giới hạn:

| Biến | Ý nghĩa |
| --- | --- |
| `JUDGE_CONCURRENCY` | Trần số tác vụ chấm đồng thời do gateway điều phối |
| `WORKER_CONCURRENCY` | Giới hạn điều phối trên mỗi worker |
| `WORKER_CAPACITY` | Khả năng nhận tác vụ được worker công bố/cấu hình |
| `QUALIFIER_WORKERS` | Mức song song của bộ xử lý vòng loại |
| `VALIDATION_WORKERS` | Mức song song của kiểm tra bài nộp |

Cụm gồm hai máy AWS, mỗi máy 2 tác vụ, và một máy Oracle Micro với 1 tác vụ: tổng cộng tối đa 5. Gateway dùng `JUDGE_CONCURRENCY=5`, `WORKER_CONCURRENCY=2`, `QUALIFIER_WORKERS=5`, `VALIDATION_WORKERS=5`. Hai AWS dùng `WORKER_CAPACITY=2`; Oracle dùng `WORKER_CAPACITY=1` và `AI_TASK_CACHE=8` vì chỉ có khoảng 1 GB RAM. Gateway đọc giới hạn từng worker từ phản hồi thật, không áp mức 2 tác vụ cho Oracle. Chi tiết cấu hình và khôi phục kết nối nằm trong [hướng dẫn máy chấm Oracle](docs/oracle-worker.md).

Không tăng song song chỉ dựa vào số CPU. Cần theo dõi RAM khả dụng, thời gian chấm, độ dài hàng đợi, timeout và tỷ lệ lỗi. Worker và gateway phải chạy phiên bản tương thích; `WORKER_RELEASE` hỗ trợ nhận diện phiên bản.

Sandbox có kiểm tra bảo mật riêng. C++ dùng chuỗi công cụ WASI/Wasmtime; Python cần cơ chế cô lập được hỗ trợ trên máy triển khai. Nếu cô lập không khả dụng, phải xử lý lỗi và sửa môi trường, không vô hiệu hóa bảo vệ để chạy mã không tin cậy. Xem [sandbox C++](docs/CPP_SANDBOX.md) và thư mục `tests/security`.

## 6. Database

### Kết nối và schema

Backend đọc `DATABASE_URL`; các tên tương thích `POSTGRES_URL` và `NEON_DATABASE_URL` chỉ được dùng khi biến chính không có. Production nên cấu hình rõ `DATABASE_URL` để tránh kết nối nhầm hệ thống cũ.

Supabase hiện được dùng như PostgreSQL, không phải dịch vụ xác thực tài khoản ứng dụng. Tài khoản đội và quản trị do backend quản lý. Dùng Session pooler cổng `5432` với TLS, không dùng Transaction pooler `6543` cho luồng cần session advisory lock.

```text
postgresql://postgres.PROJECT_REF:URL_ENCODED_PASSWORD@POOLER_HOST:5432/postgres?sslmode=require&connect_timeout=15
```

Đây chỉ là mẫu. Mật khẩu chứa ký tự đặc biệt phải được URL-encode. Không đưa chuỗi kết nối thật vào README, Git hoặc biến `NEXT_PUBLIC_*`.

Schema runtime được tạo/cập nhật trong các repository của backend. Không chạy `database/schema.sql` như bản migration thay thế cho schema đang dùng. Một phần dữ liệu giải lưu dưới dạng JSONB; đây không phải mô hình toàn bộ dữ liệu được tách thành bảng quan hệ riêng.

| Bảng hoặc nhóm dữ liệu | Vai trò |
| --- | --- |
| `tournaments` | Trạng thái và dữ liệu giải đấu |
| `arena_accounts` | Tài khoản ứng dụng |
| `arena_team_profiles` | Hồ sơ đội |
| `arena_qualifier_records` | Bản ghi vòng loại |
| `arena_notifications`, `arena_notification_reads` | Thông báo và trạng thái đã đọc |
| `arena_password_resets` | Yêu cầu khôi phục mật khẩu có thời hạn |
| `arena_password_audit_logs`, `arena_admin_audit_logs` | Nhật ký bảo mật và quản trị |
| `arena_gateway_lease` | Điều phối quyền xử lý của gateway |
| Dữ liệu trợ lý AI | Cache, hạn mức và thông tin phục vụ hỏi đáp |

Danh sách trên giúp định hướng; định nghĩa trong mã nguồn là căn cứ khi thay đổi schema. Bảng nghiệp vụ được bảo vệ bằng quyền database/RLS theo phần khởi tạo tương ứng. Không mở quyền đọc công khai cho dữ liệu tài khoản, mã bot hoặc nhật ký.

### Tối ưu truy vấn và egress

Pool PostgreSQL của repository giải giới hạn 8 kết nối mở, 2 kết nối rảnh, thời gian sống 5 phút và thời gian rảnh 1 phút. Cache có giới hạn và được vô hiệu hóa khi ghi dữ liệu; các phản hồi danh sách cần tránh kéo toàn bộ source bot và replay không cần thiết.

Egress là dữ liệu truyền ra, không phải dung lượng database. Database nhỏ vẫn có thể phát sinh egress lớn nếu bị đọc toàn bộ liên tục. Những việc cần theo dõi gồm số request, kích thước phản hồi, truy vấn JSONB lớn, polling, cache hit/miss và số client đang mở trang.

Deploy mã tối ưu, xóa bản ghi hoặc chuyển organization không hoàn lại lượng egress đã dùng. Số liệu hạn mức theo kỳ phải đối chiếu Supabase Usage hoặc API quản trị được cấp quyền. Số byte phản hồi của ứng dụng không đồng nghĩa với số liệu tính hạn mức Supabase.

### Bảo trì và sao lưu

Script `scripts/database_maintenance.py` dọn dữ liệu tạm theo chính sách có giới hạn: token khôi phục đã hết hạn, OTP quản trị cũ, cache AI hết hạn và bộ đếm hạn mức AI quá thời gian lưu. Cấu hình triển khai chạy mỗi 6 giờ, chia lô tối đa 500 bản ghi mỗi bảng với timeout và khóa để tránh chạy chồng.

Không dùng tác vụ này để xóa giải, tài khoản, bài nộp hoặc kết quả chấm. PostgreSQL vẫn cần autovacuum; việc xóa bản ghi không đồng nghĩa file database trên đĩa giảm ngay.

Backup định kỳ giữ 7 bản theo chính sách triển khai, xác minh checksum trước khi xóa bản cũ. Backup migration/thủ công không thuộc nhóm tự xóa đó. Thử phục hồi vào database riêng trước khi dùng backup cho sự cố thật; không thử restore lên production đang phục vụ.

Xem [bảo trì tài nguyên](docs/resource-maintenance.md), [tối ưu egress](docs/egress-optimization.md) và script `scripts/postgres_backup_restore_drill.py`.

## 7. Chạy trên máy phát triển

### Yêu cầu

- Git, Node.js 22 và npm.
- Go theo phiên bản khai báo trong `backend/go.mod` (hiện là 1.26.0).
- Python 3.11 là phiên bản dùng trong CI.
- PostgreSQL cho kiểm tra đầy đủ luồng dữ liệu; CI dùng PostgreSQL 17.
- Linux/Docker và công cụ WASI khi kiểm tra sandbox production.

Các lệnh dưới đây chạy từ thư mục gốc repository, mỗi dịch vụ trong một terminal riêng. Trên Windows có thể dùng `npm.cmd` thay `npm` nếu PowerShell chặn script npm.

### Cài dependency

```powershell
npm.cmd ci --prefix frontend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r bot-runner/requirements.txt
python -m pip install -r tests/requirements.txt
```

Trên Linux/macOS, kích hoạt môi trường bằng `source .venv/bin/activate`. Việc cài dependency không tự tạo database hoặc cấu hình sandbox đầy đủ.

### Chạy worker

```powershell
cd bot-runner
python main.py
```

### Chạy API

Trong terminal mới, đặt cấu hình cho database phát triển riêng:

```powershell
$env:DATABASE_URL = 'postgresql://USER:PASSWORD@localhost:5432/arena_dev?sslmode=disable'
$env:ADMIN_PASSWORD = 'CHANGE_TO_A_LOCAL_DEVELOPMENT_PASSWORD'
$env:SESSION_SECRET = 'CHANGE_TO_A_LONG_RANDOM_LOCAL_SECRET'
$env:ACCOUNT_ENCRYPTION_KEY = 'KEEP_A_STABLE_LOCAL_ENCRYPTION_SECRET'
$env:CORS_ORIGIN = 'http://localhost:3000'
cd backend
go run ./cmd/server
```

Các giá trị trên là placeholder. `sslmode=disable` chỉ dành cho database local trong ví dụ. Cấu hình môi trường của terminal này không tự truyền sang terminal khác. Không giả định Go tự đọc file `.env` chỉ vì file đó tồn tại.

### Chạy giao diện

```powershell
npm.cmd run dev --prefix frontend
```

Mở `http://localhost:3000`. Next dev chuyển tiếp API tới `127.0.0.1:8080` theo cấu hình mặc định. Khi trỏ đến API khác, cấu hình `NEXT_PUBLIC_API_URL` phù hợp rồi khởi động/build lại frontend.

### Build

```powershell
# Kiểm tra build Next thông thường
npm.cmd run build --prefix frontend

# Xuất bản tĩnh để Go hoặc Cloudflare phục vụ
python scripts/build_frontend.py

# Cách build dành cho Cloudflare từ root
npm.cmd run build
```

Hai lệnh xuất tĩnh tạo `frontend/dist`. `next start` dùng build Next thông thường, không dùng cho đầu ra static export. Không chạy đồng thời nhiều build vào cùng thư mục `.next`.

## 8. Cấu hình môi trường

Tham khảo file mẫu [deploy/ec2.env.example](deploy/ec2.env.example). Không commit file đã điền secret.

| Biến | Nơi dùng | Ghi chú |
| --- | --- | --- |
| `DATABASE_URL` | Backend | Chuỗi kết nối PostgreSQL |
| `ADMIN_PASSWORD` | Backend | Cấu hình tài khoản chủ theo cơ chế hiện có |
| `SESSION_SECRET` | Backend | Khóa phiên; phải giữ ổn định khi chuyển database |
| `ACCOUNT_ENCRYPTION_KEY` | Backend | Khóa mã hóa tài khoản; không tự đổi khi migration |
| `CORS_ORIGIN` | Backend | Danh sách origin được phép, phân cách dấu phẩy |
| `HOST`, `PORT` | Backend | Địa chỉ bind và cổng API |
| `WORKER_URL`, `WORKER_URLS` | Backend | Một hoặc nhiều endpoint máy chấm |
| `WORKER_TOKEN` | Gateway/worker | Secret dùng chung cho truy cập worker |
| `WORKER_RELEASE` | Worker | Nhận diện bản phát hành |
| `WORKER_PUBLIC_HOSTS` | Backend | Thông tin hiển thị máy chấm, không thay endpoint riêng |
| `NEXT_PUBLIC_API_URL` | Frontend | Địa chỉ API công khai, được đưa vào bản build |
| `ARENA_STATIC_EXPORT` | Build | Bật xuất tĩnh; script build đã đặt biến này |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Backend | Gửi email khôi phục và xác thực |
| `ADMIN_EMAIL` | Backend | Địa chỉ nhận xác thực quản trị |
| `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` | Backend | Khóa nhà cung cấp AI |
| `AI_PROVIDER`, `AI_MODEL` | Backend | Chọn nhà cung cấp và model được tài khoản hỗ trợ |
| `AI_ENABLED`, `AI_DAILY_PER_TEAM`, `AI_DAILY_BUDGET` | Backend | Bật/tắt và giới hạn trợ lý AI |

Không đưa service role key, mật khẩu PostgreSQL, SSH private key hoặc khóa AI vào frontend. Model có sẵn hay không phụ thuộc nhà cung cấp và tài khoản; cần kiểm tra thực tế trước khi đổi cấu hình.

## 9. Kiểm thử

```powershell
cd backend
go test ./...
go vet ./...
cd ..
python -m unittest discover -s tests/unit -p 'test_*.py'
python -m unittest discover -s tests/security -p 'test_*.py'
npm.cmd run build --prefix frontend
```

Các test PostgreSQL cần `ARENA_TEST_DATABASE_URL` trỏ đến database dùng riêng cho kiểm thử. Các test e2e cần dependency trình duyệt và binary server theo từng script; xem [.github/workflows/verify.yml](.github/workflows/verify.yml) để tái lập môi trường CI.

Những nhóm kiểm tra quan trọng trước phát hành:

1. Đăng nhập, phân quyền, hồ sơ và khôi phục mật khẩu.
2. Nộp bài, hàng đợi, khôi phục sau gián đoạn và điều phối nhiều máy chấm.
3. Luật, kết quả trận, vòng loại và chốt đội.
4. Giải AI, dữ liệu đề, chạy thử và chấm chính thức.
5. Giao diện desktop/mobile, sáng/tối, thao tác bàn phím, menu và chuyển tab.
6. Backup/restore, lỗi database và hành vi khi worker không sẵn sàng.

Test với dữ liệu mô phỏng kiểm tra hành vi giao diện, không xác nhận độ trễ API production hoặc sức chịu tải thật. Benchmark tải chỉ chạy trên môi trường được phép, với ngưỡng dừng và theo dõi tài nguyên.

## 10. Triển khai

### Cloudflare

Build command tại root là `npm run build`. File `wrangler.jsonc` phục vụ `frontend/dist` và cấu hình fallback SPA. Nếu thay URL API, phải build lại vì biến frontend công khai được đóng vào bản build.

Push GitHub chưa có nghĩa deployment đã thành công. Cần kiểm tra log Cloudflare, commit được deploy và tải lại trang để xác minh bản frontend mới. Nếu giao diện cũ vẫn xuất hiện, kiểm tra deployment trước, sau đó mới kiểm tra cache trình duyệt/service worker.

### AWS

Workflow [.github/workflows/deploy-aws.yml](.github/workflows/deploy-aws.yml) chạy trên push `main` hoặc kích hoạt thủ công. Nó dùng secret của GitHub Actions để triển khai; repository không chứa giá trị secret.

```powershell
python scripts/deploy_aws.py --check-only
python scripts/deploy_aws.py
```

Đọc [hướng dẫn EC2](docs/AWS_EC2.md) trước khi triển khai sang máy mới. `--skip-tests` chỉ là tùy chọn khẩn cấp, không phải quy trình phát hành thường ngày. Worker cần được cập nhật đồng bộ với gateway khi giao thức hoặc engine thay đổi.

### Docker

```powershell
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml logs -f
```

Đặt biến môi trường cần thiết trước khi chạy. Cấu hình worker tách riêng nằm trong `deploy/judge-compose.yml`; một lệnh Compose không tái tạo các máy AWS, Oracle và đường hầm SSH của cụm production.

## 11. Monitoring và xử lý sự cố

Theo dõi trạng thái API, độ trễ, tỷ lệ lỗi, RAM/CPU/đĩa, số tác vụ chấm, hàng đợi, worker không khả dụng, kết nối PostgreSQL và tốc độ tăng dữ liệu. Biểu đồ cần ghi rõ nguồn số liệu, thời gian cập nhật và khoảng thời gian đo.

Số liệu hệ điều hành/backend và số liệu billing của Supabase là hai nguồn khác nhau. Khi không có quyền/API lấy một chỉ số, hiển thị chưa có dữ liệu thay vì thay bằng số 0 hoặc tự suy diễn. Đợt rà soát tài nguyên trước đó không xác minh trực tiếp tổng egress tính hạn mức của Supabase.

| Dấu hiệu | Kiểm tra đầu tiên |
| --- | --- |
| Giao diện không gọi được API | URL build, HTTPS, CORS, health API và log gateway |
| Banner đứng yên | Có nhiều giải hay không, trạng thái pause, hover/focus và tab đang ẩn |
| Không có hiệu ứng nghiêng | Mức hiệu ứng, reduced motion và khả năng hover của thiết bị |
| Bài nộp chờ lâu | Hàng đợi, số slot đang dùng, worker health, timeout và RAM |
| Egress tăng nhanh | Tần suất request, payload lớn, truy vấn toàn snapshot, polling và cache |
| Database báo hết kết nối | Pool, truy vấn lâu, transaction rảnh và số tiến trình gateway |
| Worker báo sandbox unavailable | Phụ thuộc hệ điều hành, quyền cô lập và log sandbox |
| Mất dữ liệu sau đổi database | Kiểm tra URL đích và bản restore; đổi URL không tự sao chép dữ liệu |

Xem [monitoring](docs/MONITORING.md), [runbook sự cố](docs/RUNBOOK_INCIDENT_RESPONSE.md), [vận hành ngày thi](docs/TOURNAMENT_DAY_RUNBOOK.md) và [báo cáo ngày 29/10/2026](docs/health-review-20261029.md).

## 12. Tài liệu liên quan và quy trình đóng góp

- [Kiến trúc](docs/ARCHITECTURE.md), [API](docs/API.md).
- [Vòng loại](docs/QUALIFIERS.md), [Giải AI](docs/AI_CUP.md), [luật từng giai đoạn](docs/STAGE_RULES.md).
- [Email](docs/EMAIL_SETUP.md), [quản trị mật khẩu](docs/ADMIN_PASSWORD.md).
- [Nhiều máy chấm](docs/MULTI_JUDGE.md), [năng lực và dự phòng](docs/CAPACITY_PLANNING_AND_HA.md).
- [Điều kiện phát hành](docs/RELEASE_READINESS.md).

Một số tài liệu lịch sử còn mô tả Render, Neon hoặc luồng frontend cũ. Khi có khác biệt, đối chiếu mã nguồn, workflow và cấu hình triển khai đang chạy; không sao chép nguyên các lệnh cũ vào production.

Trước khi gửi thay đổi, kiểm tra diff, chạy kiểm thử phù hợp, cập nhật tài liệu liên quan và bảo đảm không đưa secret hoặc dữ liệu cá nhân vào commit. Thay đổi schema, khóa mã hóa hoặc cơ chế hàng đợi cần có kế hoạch backup và rollback. Thay đổi UI nên được kiểm tra ở desktop/mobile, cả sáng/tối và bằng bàn phím.

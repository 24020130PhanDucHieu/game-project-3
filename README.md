# Freshman Bot Arena

Nền tảng tổ chức giải đấu bot Oẳn Tù Tì V2. Bản đang chạy sử dụng giao diện tĩnh (`frontend/index.html`, `frontend/app.js`, `frontend/styles.css`), Go API gateway và Python worker cho logic giải đấu.

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

## Đóng gói và triển khai

`deploy/render.yaml` mô tả dịch vụ Render. Cần cấu hình `DATABASE_URL` và `ADMIN_PASSWORD` trong Render trước khi deploy; các biến này không được lưu trong repository. Có thể build container bằng:

```powershell
docker build -t ottv2-arena -f deploy/Dockerfile .
```

Đẩy source lên GitHub chỉ cập nhật repository. Muốn phát hành dịch vụ, cần kết nối repository với Render và cấu hình secrets/database ở trên. Render phục vụ luôn frontend tại URL web service. Nếu dùng thêm Cloudflare Workers để phục vụ assets, phải triển khai lại cả thư mục `frontend/`; bản này dùng URL assets `v=3.0` để tránh lấy JavaScript cũ từ cache.

Kết quả và phạm vi kiểm thử: [docs/VERIFICATION_RELIABILITY.md](docs/VERIFICATION_RELIABILITY.md).

## Ghi chú sandbox

Bot Python chạy trong subprocess có timeout và giới hạn tài nguyên. Native C++ bị tắt ở production vì container hiện tại chưa cung cấp runtime cô lập riêng cho từng lần chạy. Có thể bật C++ trong môi trường local phục vụ phát triển; trước khi dùng C++ trong giải công khai, cần triển khai sandbox native riêng.

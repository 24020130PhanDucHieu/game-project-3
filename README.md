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
- Khi đăng ký đội, hệ thống tạo mã truy cập ngẫu nhiên và chỉ trả mã một lần trong phản hồi thêm đội. Ban Tổ Chức cần gửi mã đó riêng cho đại diện đội.
- Phiên đăng nhập có thời hạn; đăng nhập lại nếu phiên hết hạn hoặc máy chủ khởi động lại.
- API công khai không trả credential hash hoặc mã nguồn đội khác. WebSocket gửi thông báo cập nhật theo trận để giao diện tải lại trạng thái mới.
- `CORS_ORIGIN` nhận danh sách origin cách nhau bằng dấu phẩy. Hãy đặt đúng domain frontend khi triển khai.

## Kiểm thử

```powershell
cd backend
go test ./...
cd ..
python -m unittest discover -s tests/unit -p "test_*.py"
python tests/security/test_sandbox_security.py
cd bot-runner
python -m py_compile main.py app/repository/database.py app/sandbox/runner.py
```

## Đóng gói và triển khai

`deploy/render.yaml` mô tả dịch vụ Render. Cần cấu hình `DATABASE_URL` và `ADMIN_PASSWORD` trong Render trước khi deploy; các biến này không được lưu trong repository. Có thể build container bằng:

```powershell
docker build -t ottv2-arena -f deploy/Dockerfile .
```

Đẩy source lên GitHub chỉ cập nhật repository. Muốn phát hành dịch vụ, cần kết nối repository với Render và cấu hình secrets/database ở trên.

## Ghi chú sandbox

Bot Python chạy trong subprocess có timeout và giới hạn tài nguyên. Native C++ bị tắt ở production vì container hiện tại chưa cung cấp runtime cô lập riêng cho từng lần chạy. Có thể bật C++ trong môi trường local phục vụ phát triển; trước khi dùng C++ trong giải công khai, cần triển khai sandbox native riêng.
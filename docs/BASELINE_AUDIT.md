# Hiện trạng kỹ thuật

## Thành phần đang được triển khai

- `backend/`: Go API gateway, HTTP handlers, WebSocket hub, middleware và repository JSON/PostgreSQL.
- `bot-runner/`: FastAPI worker nội bộ xử lý đột biến dữ liệu giải và chạy game engine.
- `frontend/app/`, `frontend/components/arena/`, `frontend/lib/api-client.ts`: giao diện Next.js gọi Go API.
- `deploy/`: Docker Compose và Render blueprint.

Go phục vụ bản Next.js static export tại `frontend/dist/` sau khi chạy `python scripts/build_frontend.py`.

## Đã gia cố

- Lưu JSON nguyên tử và tuần tự hóa các cập nhật trên cùng giải; PostgreSQL được đọc trực tiếp để tránh dùng cache cũ.
- Bearer session có hạn dùng cho Ban Tổ Chức và đội; thao tác nhạy cảm yêu cầu quyền phù hợp.
- API trả thông tin giải công khai đã lọc credential hash và mã nguồn; đội chỉ xem mã của mình trong trận được xác thực.
- WebSocket gửi cập nhật theo trận; frontend tự kết nối lại và tải trạng thái mới.
- CORS theo allowlist, giới hạn tần suất API, health endpoint và cấu hình production bắt buộc PostgreSQL.
- Python bot chạy subprocess có timeout, giới hạn tài nguyên và lọc biến bí mật khỏi môi trường con.

## Giới hạn cần biết trước khi mở giải công khai

- Production hiện tắt chạy mã C++ native. Muốn bật lại cần một runner OS-isolated riêng cho mỗi lần chạy.
- Phiên đang lưu trong bộ nhớ; sau khi máy chủ khởi động lại, người dùng cần đăng nhập lại.
- Cần cấu hình `DATABASE_URL`, `ADMIN_PASSWORD` và `CORS_ORIGIN` trong môi trường triển khai trước khi phát hành.
- Test API end-to-end cần chạy Go gateway và Python worker cùng lúc; không chạy các test mutate cũ vì chúng giả định API công khai cho thao tác tổ chức.

# Frontend chính ARENA OTTV2

## Chạy và build

- Từ gốc repository: `python scripts/build_frontend.py` tạo bản Next.js static trong `frontend/dist` cho Cloudflare và Go.
- Phát triển: khởi động API Go cổng 8080; trong thư mục này chạy `npm ci` rồi `npm run dev`.
- Cần Python và Node.js 22. Không đưa file `.env`, khóa SSH hoặc dữ liệu giải thật vào Git.

## Nguồn giao diện và nghiệp vụ

`app/page.tsx` dùng `components/arena/live-portal.tsx`. Trước build/dev, script prepare ghép template thật, gắn phiên bản theo nội dung cho CSS/JS và sao chép assets. Runtime cũ tiếp tục quản lý DOM, auth, API, WebSocket, lịch thi, vòng loại, offline và xử lý sự cố. React chỉ sở hữu vùng bao ngoài, không dựng lại vùng DOM này khi chuyển tab.

Sửa template/style/logic đang phát hành tại `../frontend/`. Thư mục `generated` và bản sao `public/static`, `public/assets` là sản phẩm build, không commit. Các component `ArenaApp`, `*-view`, modal React và `lib/arena-data` từ mẫu thiết kế được giữ để tham khảo; **không phải trang production**, không nối chúng trở lại trang chính khi còn dữ liệu hoặc thao tác mô phỏng.

Đây là bước chuyển đổi kết hợp, chưa phải thay toàn bộ runtime bằng React. API và schema không thay đổi để phục vụ giao diện.

## Kiểm thử

Build frontend trước, build backend kiểm thử rồi chạy `tests/e2e/test_portal_integrity.py` với `ARENA_REQUIRE_NEXT=1`. Chạy thêm `test_reliability.py`, `test_offline_shell.py`, `test_offline_submission_sync.py`. CI kiểm tra portal trước bước deploy AWS; `skip_tests` chỉ dành cho xử lý khẩn cấp có chủ đích.

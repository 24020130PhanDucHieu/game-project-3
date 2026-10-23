# Trạng thái chuyển giao diện Next.js

Trang phát hành đi từ `frontend/app/page.tsx` đến `ArenaApp`. Dữ liệu và thao tác đang hiển thị được gọi qua `frontend/lib/api-client.ts` tới Go API; Go bảo vệ các route bằng phiên đăng nhập và quyền. Giao diện Vanilla JS cũ đã được gỡ khỏi source và gói phát hành.

## Build và triển khai

- Chạy `python scripts/build_frontend.py` từ gốc repository. Script build Next.js static export vào `frontend/dist/`; Go phục vụ bản này nếu có.
- Phát triển local: chạy Go ở cổng 8080 và `npm run dev` trong `frontend`. Next.js chuyển tiếp API và WebSocket tới Go.
- Mã bot mẫu nằm trong `examples/bots_sdk/`, tách khỏi frontend.

## Kiểm tra

- Workflow deploy và regression chạy `tests/e2e/test_next_portal.py` trên gateway Go và worker cục bộ, kiểm tra đăng ký, đăng nhập đội, đăng nhập Admin và trang Next.js.
- Backend test xác nhận static export không cần thư mục asset legacy.
- Các component mẫu chưa được import vào trang chính chỉ là mã tham khảo; trước khi đưa lên trang phát hành cần nối với API thật và kiểm tra quyền.

Ứng dụng Next.js hiện chưa cung cấp chế độ nộp bài offline. Không mô tả service worker hoặc hàng đợi offline của giao diện cũ là tính năng đang phát hành.

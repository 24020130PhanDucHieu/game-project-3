# Frontend

## Chỉnh giao diện

- `templates/index.html`: khung trang.
- `templates/pages/`: HTML từng tab và màn hình đăng nhập.
- `templates/modals/`: HTML các hộp thoại.
- `templates/partials/sidebar.html`: điều hướng và danh tính tài khoản.
- `templates/partials/icons.html`: bộ icon SVG dùng chung.
- `static/css/`: CSS theo trang/thành phần. `base.css` giữ biến màu, `icons.css` giữ avatar đội và huy chương; `battle-presentation.css` giữ icon quân cờ, Live Action, nhật ký và thanh công cụ nộp bot.

## Chỉnh logic

- `static/js/core/`: API, trạng thái dùng chung, lưu phiên/giao diện, bot mẫu và tiện ích.
- `static/js/auth/`: đăng nhập, phân quyền, chọn trận của đội.
- `static/js/tournaments/`: danh sách giải, tải dữ liệu, tạo giải và cây bảng đấu.
- `static/js/arena/`: phòng trận, bàn cờ, hiệp đấu và điều khiển replay nội tuyến.
- `static/js/realtime/`: WebSocket theo giải và đồng bộ giữa các tab trình duyệt.
- `static/js/studio/`: trình soạn thảo, bản nháp và nộp bot.
- `static/js/history/`: bài nộp, nhật ký, lịch sử hiệp/trận và replay.
- `static/js/teams/`, `admin/`, `practice/`, `pages/`, `ui/`: các tính năng còn lại.
- `static/js/app.js`: khởi động và khôi phục ứng dụng.

Các script dùng chung lexical scope như phiên bản cũ và được tải bằng `defer`. Khai báo trạng thái dùng chung ở `core/state.js`; trạng thái riêng của replay/editor được giữ gần tính năng tương ứng. Khi thêm script, khai báo trong `templates/partials/scripts.html` trước `app.js`. Các callback `window.*` phục vụ nút HTML hiện tại. Không khởi động ứng dụng bên trong file tính năng.

## Chạy và xuất bản

Go phục vụ templates trực tiếp, nên không có bước build bắt buộc khi chạy backend. Khởi động lại Go sau khi sửa HTML templates; JS/CSS được đọc từ source, F5 để tải lại.

Xuất bản frontend lên hosting tĩnh:

```powershell
python scripts/build_frontend.py
```

Đưa **nội dung `frontend/dist/`** lên hosting (Cloudflare đặt thư mục publish/assets là `frontend/dist`). Có thể xem bản build bằng `python -m http.server 8082 --directory frontend/dist`; để kết nối backend local khác cổng, đặt `ARENA_API_URL` trong localStorage và cấu hình `CORS_ORIGIN` của backend tương ứng.

`dist` là kết quả build, không commit và không dùng làm source. Builder chỉ dùng thư viện chuẩn Python; không cần Node, npm hoặc CDN để ghép trang hay cung cấp icon.

Trang `frontend/index.html` ở thư mục gốc là đầu vào tương thích cho hosting cũ đang publish `frontend/`. Nó chỉ tải và ghép những template cùng domain qua `static/js/template-loader.js`. Giao diện vẫn được chỉnh trong `templates/`; hosting mới nên dùng `dist` để giảm số yêu cầu lúc mở trang.

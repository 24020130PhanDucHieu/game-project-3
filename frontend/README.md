# Frontend Next.js của ARENA OTTV2

`app/page.tsx` hiển thị `components/arena/arena-app.tsx`. Trang này đọc dữ liệu từ Go API qua `lib/api-client.ts` và chỉ báo thao tác thành công sau khi API trả kết quả. Không dùng dữ liệu mẫu cho các màn đang phát hành.

## Chạy local

1. Khởi động Go API ở cổng 8080.
2. Trong `frontend`, chạy `npm ci` rồi `npm run dev`.
3. Next.js chuyển tiếp `/api/*` tới Go. WebSocket local kết nối trực tiếp tới cổng 8080. Nếu dùng backend khác, đặt `NEXT_PUBLIC_API_URL` trước khi build.

## Đóng gói

Từ gốc repository chạy `python scripts/build_frontend.py`. Script chạy Next.js static export và tạo `frontend/dist` cho Go hoặc static host. Frontend chọn API cùng origin khi Go phục vụ trang; bản Cloudflare dùng `NEXT_PUBLIC_API_URL` nếu có, nếu không sẽ dùng địa chỉ API mặc định trong `lib/api-client.ts`. Cấu hình `CORS_ORIGIN` của Go phải chứa domain frontend khi hai bên khác origin.

## Hợp đồng dữ liệu

- Giải, trận, bảng xếp hạng: `/api/tournaments/*`, `/api/ranking`.
- Xác thực, hồ sơ, thông báo: `/api/session`, `/api/teams/*`, `/api/notifications/*`.
- Vòng loại: `/api/qualifiers/*`; phản hồi HTTP 202 nghĩa là bài đã vào hàng đợi, kết quả chấm được cập nhật sau.
- Chạy bot và xem lại: `/api/bots/*`, API trận và WebSocket `/ws/tournaments/:id`.
- Quản trị: các route yêu cầu token ADMIN; giao diện không tự cấp quyền.

Các component mẫu cũ trong `components/arena` không được import vào `app/page.tsx`. Khi thêm chức năng, nối với API và trạng thái server trước khi đưa nó lên trang chính.

## Kiểm tra

Chạy `npm run build` trong `frontend`, sau đó chạy `python scripts/build_frontend.py` từ gốc repository để xác minh đường đóng gói static thực tế.

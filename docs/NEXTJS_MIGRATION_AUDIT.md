# Kiểm tra chuyển giao diện Next.js — 23/10/2026

## Kết luận hiện tại

Frontend chính hiện dùng Next.js theo cách chuyển đổi kết hợp: `frontend/app/page.tsx` chỉ mở `LivePortal`, chứa HTML và runtime nghiệp vụ thật sinh từ `frontend-cu/templates` và `frontend-cu/static`. CSS `reference-redesign.css` cung cấp giao diện theo mẫu đã chọn. Không dùng iframe, không dùng dữ liệu giả trong luồng phát hành.

Các component React mẫu còn giữ trong thư mục để tham khảo thiết kế, nhưng `ArenaApp` không được import vào trang chính. Bảng thiếu sót bên dưới ghi lại tình trạng **bản prototype React**, không phải các luồng đang dùng trong `LivePortal`. Chưa thể coi việc chuyển đổi là viết lại toàn bộ nghiệp vụ bằng React.

Lệnh phát hành: `python scripts/build_frontend.py`. Cần Python, Node.js 22 và npm. Script cài dependency theo `package-lock.json` nếu chưa có, kiểm tra TypeScript, build Next static export rồi xuất `frontend/dist`. Giữ đường dẫn output này cho Cloudflare. Go ưu tiên phục vụ `frontend/dist` nếu có; nếu chưa build sẽ dùng template nguồn.

Lệnh phát triển Next: chạy `npm run dev` trong `frontend`, backend tại cổng 8080. API và WebSocket được chuyển tiếp tới Go. Sửa chức năng thực tế trong `frontend/` và legacy source trong `frontend-cu/`, chạy lại prepare/build để đồng bộ; không chỉnh các bản sao trong `frontend/public/static`, `frontend/public/assets` hoặc `frontend/generated`.

Service worker của bản static export lưu cả Next chunks và runtime vào cache có mã phiên bản theo build; API, token và bài nộp không được cache bởi service worker. Hàng đợi nộp bài vẫn dùng runtime bền vững hiện có. Máy chưa từng tải đủ tài nguyên khi online không thể tự mở lần đầu khi offline.

Backend đã bỏ mật khẩu Admin fallback, khôi phục giới hạn phiên theo giải/trận, yêu cầu đăng nhập khi chạy bot, kiểm tra đội hiện tại trước khi trả lịch sử bài nộp và giới hạn CORS theo danh sách origin cụ thể.

## Các lỗi đã sửa trong lần kiểm tra

- API đăng nhập đội gửi `username`, đọc `session_token` và thông tin `team` đúng hợp đồng Go.
- Đăng nhập Admin đọc `session_token`; không báo thành công khi server từ chối.
- Đăng ký, yêu cầu khôi phục và đổi mật khẩu hiển thị lỗi API thay vì nuốt lỗi.
- Đổi mật khẩu gửi `reset_token` đúng hợp đồng.
- Client hiển thị thông báo lỗi từ trường `detail` của Go.
- Khởi tạo vai trò khách; ẩn trang/menu Admin với khách và đội; ẩn hồ sơ đội với vai trò khác.
- Nút đăng xuất trên header gọi API đăng xuất và xóa phiên.
- Ẩn chuông thông báo với khách.
- Loại bỏ URL API tùy ý lấy từ localStorage trước khi gửi Bearer token.
- Sửa các tham chiếu TypeScript lỗi; bật lại kiểm tra TypeScript trong production build.

## Những phần còn thiếu so với frontend cũ

| Luồng | Bằng chứng trong bản Next.js | Điều kiện trước khi chuyển |
|---|---|---|
| Chọn giải/trận và nộp mã | `match/match-view.tsx` gửi ID cố định `tourn-k69-m2`, `QF-02` | Lấy ID thật, gọi chọn trận để cấp phiên theo trận, kiểm tra đúng đội và hiệp |
| Vòng loại | `qualifier-view.tsx` chưa sử dụng các phương thức API vòng loại | Nối đăng ký, bài nộp, lịch sử, khóa/gia hạn, xếp hạng và xét đi tiếp |
| Offline | `app-state.tsx` giữ outbox trong React state, xóa sau timer và báo server đã nhận | Lưu bền theo tài khoản, gửi idempotent, chỉ xóa khi có xác nhận server |
| Chạy Boss | `modals/practice-modal.tsx` di chuyển quân bằng Math.random | Dùng kết quả sandbox thật và hiển thị lỗi máy chấm |
| Sửa kết quả/rollback | `admin/incident-panel.tsx` dùng trận và đội mẫu | Gọi correction API với token phiên bản, lý do, nhật ký và kiểm tra nhánh đi tiếp |
| Luật và lịch vòng | `modals/tournament-modals.tsx` có thao tác mô phỏng bằng timer | Đọc/lưu API thật và xử lý xung đột phiên bản |
| Quản lý đội/nhánh | `team-manager-modal.tsx`, `bracket-swap-modal.tsx` sửa mảng local | Nối thêm/xóa/bốc thăm/đổi nhánh và xử loại với server |
| Hồ sơ | `edit-profile-modal.tsx` lưu bằng timer | Đọc/lưu profile thật, giới hạn đúng chủ tài khoản |
| Thông báo | `broadcast-modal.tsx` dùng initialNotifications và timer | Đọc/gửi/đánh dấu đã đọc qua API |
| Theo dõi và bảng xếp hạng | Có dữ liệu fallback mẫu trong `admin-view.tsx`, `secondary-views.tsx` | Bỏ fallback mẫu; hiển thị trạng thái tải/lỗi/rỗng, nối dữ liệu thật |
| Hết phiên | Client phát `arena-session-expired` nhưng shell chưa đăng ký xử lý đầy đủ | Thu hồi UI quyền và đóng các modal nhạy cảm ngay khi hết phiên |

## Kiểm tra đã thực hiện

- `node node_modules/typescript/bin/tsc --noEmit`: đạt sau sửa lỗi.
- `node node_modules/next/dist/bin/next build`: đạt, có chạy TypeScript.
- Middleware Go bảo vệ các route quản trị bằng `adminOnly`, các thao tác trận bằng `matchSession`/`matchAdmin`; cần kiểm thử âm trực tiếp trên từng nhóm API trước khi kết luận toàn hệ thống an toàn.

## Cổng phát hành

Kiểm thử trên dữ liệu dùng riêng: khách/đội A/đội B/Admin; đăng nhập sai và hết phiên; truy cập chéo đội; vòng loại đầy đủ; trận Bo5 đến vô địch; khóa thời gian; offline rồi kết nối lại; restart worker/API; rollback và đồng bộ hai trình duyệt. Không dùng tài khoản hay dữ liệu giải thật cho các kiểm thử có ghi/xóa.

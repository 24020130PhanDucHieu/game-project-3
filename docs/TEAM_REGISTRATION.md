# Đăng ký và quản lý tài khoản đội

Đội bấm **Đăng ký đội thi** tại thanh bên hoặc trang đăng nhập, nhập mã sinh viên, tên đội và mật khẩu. Tài khoản đăng nhập được ngay cả khi chưa được thêm vào giải. Mã sinh viên là duy nhất, không phân biệt chữ hoa/chữ thường. Mật khẩu giữ nguyên khoảng trắng và phân biệt hoa/thường.

Trong **Bàn Quản Trị**, Admin xem mã sinh viên, tên đội và mật khẩu, tìm kiếm tài khoản, chọn **Thêm vào giải đấu** rồi chọn giải. Máy chủ kiểm tra trùng đội, sức chứa và việc giải đã bắt đầu thi đấu. Danh sách tự cập nhật mỗi 10 giây khi đang mở; có nút Làm mới.

**Xóa** loại tài khoản khỏi danh sách và vô hiệu hóa các phiên đăng nhập hiện tại. Kết quả và tên đội trong lịch sử giải được giữ lại. Mã sinh viên đã xóa vẫn được giữ làm dấu xóa để ngăn phiên cũ hoặc đăng ký lại chiếm danh tính. Muốn rút đội khỏi một giải chưa thi đấu, sử dụng Xóa đội trong phần quản lý đội của giải đó.

## Lưu trữ

- PostgreSQL: bảng `arena_accounts(student_id TEXT PRIMARY KEY, data JSONB NOT NULL)` được tạo tự động khi máy chủ khởi động; dùng cùng kết nối với kho giải đấu.
- Chạy local: `accounts_store.json` nằm cùng thư mục với `DB_PATH`, ghi qua tệp tạm và thay thế sau khi ghi thành công.
- Tài khoản cũ trong danh sách giải được nhập vào kho tài khoản với mật khẩu cũ `k69+MSSV`. Việc nhập không thay thế mật khẩu do người đăng ký chọn và không phục hồi tài khoản đã xóa.
- Mật khẩu đăng nhập được băm bcrypt. Bản phục vụ chức năng Admin xem mật khẩu được mã hóa AES-GCM, gắn với mã sinh viên. Không đưa các giá trị này vào dữ liệu giải, phản hồi công khai hoặc trình duyệt đội.
- Khóa mã hóa lấy lần lượt từ `ACCOUNT_ENCRYPTION_KEY`, `SESSION_SECRET`, `ADMIN_PASSWORD`. Giữ nguyên khóa đã dùng để mã hóa khi restart/deploy. Nếu muốn tách khỏi mật khẩu Admin, cấu hình `ACCOUNT_ENCRYPTION_KEY` **trước lần chạy đầu tiên**. Đổi khóa sau đó cần chuyển đổi dữ liệu đã mã hóa; chỉ đổi biến môi trường sẽ khiến mật khẩu cũ không thể hiển thị.
- Local không có các biến trên sẽ tạo khóa riêng `accounts_store.json.key`. Sao lưu khóa cùng dữ liệu. Các tệp tài khoản và khóa được bỏ qua bởi Git và Docker build.

## API

| Phương thức | Đường dẫn | Quyền |
|---|---|---|
| POST | `/api/teams/register` | Công khai; `student_id`, `team_name`, `password` |
| POST | `/api/teams/login` | Công khai; `username`, `password` |
| GET | `/api/admin/accounts` | Admin; phản hồi `Cache-Control: no-store` |
| DELETE | `/api/admin/accounts/:studentId` | Admin |
| POST | `/api/admin/accounts/:studentId/enroll` | Admin; `tournament_id` |

Máy chủ xác thực mật khẩu đăng ký cho cả endpoint đăng nhập toàn hệ thống lẫn endpoint đăng nhập theo trận cũ. Việc xác thực nội bộ với bot runner vẫn do gateway thực hiện sau bước này.

## Kiểm thử

`go test ./...` từ `backend` kiểm tra Go, gồm mã hóa/lưu qua restart, đăng ký trùng đồng thời và xóa tài khoản.

`python -X utf8 tests/e2e/test_registration.py` sử dụng máy chủ Go đã build (biến `ARENA_TEST_SERVER`), Python worker và Chrome headless với dữ liệu tạm. Kiểm tra đăng ký qua UI, đăng nhập chưa có giải, F5, quyền Admin, mật khẩu riêng, thêm vào giải, chọn trận, restart và thu hồi phiên sau khi xóa.

Kiểm thử local dùng kho JSON; chưa xác minh trên PostgreSQL thật hoặc bản web triển khai.

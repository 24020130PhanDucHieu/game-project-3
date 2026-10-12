# Kiểm thử độ ổn định — 2026-10-12

Đã chạy server Go thật, worker Python thật và ba phiên Chrome riêng cho Admin, đội Đỏ và đội Xanh. Database JSON nằm trong thư mục tạm; không chỉnh sửa giải đang chạy trên hosting.

## Kết quả

- `go test ./...`: đạt, gồm phiên qua restart, chữ ký sai/hết hạn, lỗi kết nối database khác với thiếu ID, khôi phục round khi worker lỗi và tách sự kiện giữa hai giải dùng cùng ID trận.
- Unit Python: 10 test đạt.
- Sandbox: 6 test đạt, gồm import bị cấm, introspection, timeout và hạn chế C++ production.
- `tests/e2e/test_reliability.py`: 19 nhóm tình huống đạt; không có exception JavaScript trong trình duyệt.
- `node --check frontend/app.js`, `git diff --check`: đạt.

## Các luồng đã kiểm tra

1. Tạo giải, giới hạn số đội, trùng MSSV, mật khẩu mặc định, xếp nhánh và đăng nhập trước khi xếp lịch.
2. Admin/đội phải chọn trận; nút trận thật mở đúng phòng, đội không được vào trận khác.
3. Nháp code và bài nộp truyền qua WebSocket sang Admin; chỉ đủ hai bài hợp lệ mới mở nút bắt đầu.
4. F5/chuyển tab giữ tài khoản, giải/trận, code, vị trí replay và tab nhật ký. Restart gateway giữ phiên và bài nộp đã lưu.
5. Round chạy, kết quả và tỉ số trên cây cập nhật, máy chủ chuyển round khi Admin đang ở tab khác; round mới cần nộp lại code và giữ đăng nhập.
6. Đội xem mã nguồn của chính mình; tài khoản công khai hoặc phiên đội khác không đọc được mã riêng.
7. Dry-run phát hiện lỗi thật; C++ local được biên dịch/thực thi; đấu thử Python có bàn cờ kết quả.
8. Nút xóa giải hoạt động; xóa giải khác giữ nhánh hiện tại, xóa giải đang xem hủy lựa chọn trận cho các máy đang kết nối.
9. Chạy trọn giải bốn đội: ba trận hoàn tất, đội thắng lên đúng nhánh, trận mới yêu cầu bài nộp mới và giải có quán quân.
10. Replay, lịch sử bài nộp, bảng xếp hạng, bảo vệ kết quả khỏi việc xếp lại nhánh và đăng xuất.

## Phạm vi

Kiểm thử xuyên suốt dùng JSON local. Lỗi đọc PostgreSQL được kiểm tra bằng driver thử; không chạy thao tác xóa/nộp bài trên các giải production của người dùng. C++ native vẫn bị tắt ở production theo chính sách sandbox hiện có; dropdown ngôn ngữ phản ánh khả năng của máy chủ.

Sau khi cập nhật từ phiên bản cũ, cần đăng nhập lại một lần để tạo phiên ký mới. Các lần F5 và triển khai tiếp theo giữ phiên khi khóa ký ổn định.

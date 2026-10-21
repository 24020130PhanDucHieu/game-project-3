# Kiểm thử logic ngày 22/10/2026

## Lỗi đã sửa sau khi rà bản mới

- Loại bỏ thời gian giả định 42 ms và tỷ lệ 100% khi chưa có tác vụ; sửa công thức tính tỷ lệ để không đếm trùng lượt lỗi.
- Ghi nhận từng lần điều phối kể cả mất kết nối/429/5xx. Thời gian tính riêng mỗi lần thử, host lấy từ cấu hình thật, không gán cố định địa chỉ máy.
- Bỏ số dung lượng database mẫu khi truy vấn thất bại; chỉ trả giá trị đo được. ANALYZE trả lỗi thật, không tuyên bố thu hồi đĩa hay tái tạo chỉ mục.
- Ô đặc biệt chỉ hoạt động theo luật đã chọn; tránh trường hợp UI/validation nói luật chuẩn nhưng engine tự áp dụng bẫy/cổng.
- Thêm kiểm thử kết quả đầy đủ và kết quả không dựng replay phải giống nhau; kiểm tra các tổ hợp thường, sương mù/trộn/đảo, ô đặc biệt.
- Thêm hồi quy đếm trạng thái PENDING/ERROR của trận vòng loại và học capacity worker mà không vượt giới hạn gateway.

## Kết quả kiểm thử

- Go: toàn bộ `go test ./... -count=1 -timeout=10m` đạt; build server đạt. Các kiểm thử PostgreSQL yêu cầu biến môi trường riêng không chứng minh database production.
- Linux container 700 MiB / 1.5 CPU: 49 unit test Python/C++ và 17 security test đạt.
- Node: hàng đợi nộp offline, 11 trường hợp validator offline, giữ trạng thái khi API gián đoạn đạt.
- Chromium: monitoring thành công/mất kết nối, chống chèn HTML, kích thước bàn cờ 390/768/1440px đạt.
- Hai worker thật local: nhận bài đồng thời, mất một worker, hoàn tất trận; restart giữ điểm và biên nhận đạt.
- Hàng đợi: worker ngừng, restart gateway, chống nhận trùng, khóa vòng đợi chấm, phục hồi và gia hạn đạt.
- Offline E2E: không ghi server khi offline, tự gửi khi kết nối lại, chỉ một bài hợp lệ được lưu đạt.
- Reliability E2E: đăng nhập/phân quyền, draft và F5, điều kiện bắt đầu hiệp, đồng bộ kết quả, trận tập Python/C++, giải 4 đội đến vô địch, replay/xem mã nguồn, xếp hạng, xóa giải và đăng xuất đạt; không có ngoại lệ JavaScript trong luồng kiểm thử.

## Giới hạn

Các kiểm thử dùng dữ liệu tạm, không chấm lại hoặc thay kết quả giải thật. Smoke tải 3 đội không phải kiểm chứng sức chứa hàng nghìn người. Thay đổi source/GitHub chưa chứng minh AWS đang chạy đúng phiên bản. Cần cập nhật đồng bộ gateway/worker và nghiệm thu trên staging trước giải đông người.

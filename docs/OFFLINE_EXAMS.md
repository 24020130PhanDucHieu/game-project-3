# Nộp bài khi phòng thi mất mạng

## Điều thí sinh cần biết

- Nếu đã mở trang thi trước khi mất mạng, trình duyệt có thể giữ mã nguồn/bản nộp chờ đồng bộ trên **thiết bị và trình duyệt đó**. Không xóa dữ liệu trình duyệt, đổi thiết bị hay dùng chế độ ẩn danh. Nên tải mã nguồn xuống file để có bản dự phòng riêng.
- Thông báo “đã lưu trên thiết bị” chỉ xác nhận bản cục bộ. Khi có mạng trở lại, giữ trang mở và kiểm tra trạng thái/lịch sử nộp cho đến khi server xác nhận. Không coi toast lưu cục bộ là biên nhận.
- Server quyết định giờ nhận bài. Bản lưu offline gửi sau hạn có thể bị từ chối. Ban tổ chức phải công bố và thực hiện gia hạn phù hợp nếu sự cố mạng ảnh hưởng phòng thi.
- Kiểm tra mã nguồn và chạy thử với Boss cần API/sandbox từ server; chức năng đó không được bảo đảm hoạt động khi mất hoàn toàn kết nối. Trang chưa tải trước khi mất mạng cũng không được bảo đảm mở được.

## Giám thị và ban tổ chức

1. Ghi nhận thời điểm, phạm vi sự cố và thông báo cho kỹ thuật/đội thi.
2. Nếu cần, gia hạn mốc nhận bài trên server trước khi yêu cầu thí sinh đồng bộ; kiểm tra chính sách hạn với từng vòng.
3. Khi mạng hồi phục, yêu cầu thí sinh kiểm tra danh sách bài nộp trên server và trạng thái chấm. Xử lý bài không có xác nhận theo quy chế đã công bố, không dựa chỉ vào đồng hồ máy thí sinh.
4. Diễn tập quy trình này trên staging với trình duyệt, service worker, đăng nhập hết hạn và nhiều lần mất mạng trước giải chính.

Ở vòng loại API trả HTTP 202 với `id` của bài nộp nếu tiếp nhận vào hàng đợi. Trong trận chính phản hồi và trạng thái bài nộp có luồng riêng. Không có trường chung `receipt_id` được API hiện tại cam kết.

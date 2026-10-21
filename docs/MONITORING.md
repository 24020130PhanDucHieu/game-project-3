# Giám sát vận hành giải đấu

## Đã triển khai trong mã nguồn

Tab quản trị cập nhật mỗi 10 giây khi đang hiển thị, chỉ tài khoản admin được đọc API `/api/admin/monitoring`.

- Từng worker: host từ cấu hình thật, probe `/health`, độ trễ, số tác vụ gateway đang giao và giới hạn đồng thời; phát hiện sai phiên bản bằng `WORKER_RELEASE` nếu được cấu hình.
- Database: kiểm tra kết nối có thời hạn.
- Hàng đợi vòng loại: tổng bài QUEUED và trận QUEUED/RUNNING/FAILED. Bài QUEUED gồm bài đang xử lý hoặc chờ thử lại; không phải số người đang đứng chờ chính xác.
- API: uptime, goroutine, heap Go. Heap không phải RAM toàn EC2, số core không phải CPU utilization.
- Tiến độ nộp của giải được chọn: đội có ít nhất một cờ code_submitted trong các trận. Không dùng chỉ số này để kết luận đủ bài cho hiệp hiện tại.
- Nếu kết nối thất bại, trạng thái chuyển sang chưa xác minh; dữ liệu cũ không được xem là xác nhận hệ thống khỏe.

## Khi có sự cố

| Dấu hiệu | Việc cần làm |
|---|---|
| Worker UNREACHABLE | Kiểm tra service worker, private IP, security group và log máy đó. |
| RELEASE_MISMATCH | Đồng bộ phiên bản worker với gateway trước khi tiếp tục chấm. |
| Database UNAVAILABLE | Tạm dừng bắt đầu trận mới, kiểm tra Supabase/kết nối; không xóa bài đã nhận. |
| Hàng đợi tăng liên tục | Kiểm tra worker và thời gian chạy bot; thêm capacity dựa trên đo tải thực tế. |
| Giao diện báo chưa xác minh | Kiểm tra API/network và thời gian cập nhật cuối; không suy đoán dữ liệu cũ là hiện tại. |

## Điều kiện còn cần trước giải đông người

1. Giám sát host bằng CloudWatch hoặc agent: CPU, RAM, swap, đĩa, OOM; dashboard hiện tại chưa đo các thông số này.
2. Cảnh báo chủ động tới người trực khi API/database/worker lỗi kéo dài, hàng đợi vượt ngưỡng. Tab web không gửi cảnh báo khi đã đóng trình duyệt.
3. Backup ngoài máy chủ, kiểm tra tuổi backup và diễn tập restore vào database riêng.
4. Đo tải với số đội mục tiêu, báo p95 nhận bài/trả kết quả và thử mất một worker. Chưa có căn cứ bảo đảm 4.000 người nhận kết quả tức thì.
5. Chốt quy trình offline: lưu bài tại máy, xác nhận receipt server sau đồng bộ; chạy thử boss cần kết nối tới máy chấm.

Monitoring chỉ quan sát, không tự sửa dữ liệu hay tự chạy lại trận. Việc phát hành mã nguồn và xác minh phiên bản đang chạy trên AWS là hai bước riêng.

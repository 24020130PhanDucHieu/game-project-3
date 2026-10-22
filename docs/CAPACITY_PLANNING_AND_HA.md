# Kế hoạch năng lực và độ sẵn sàng cao

Tài liệu này là **kế hoạch**, không mô tả hạ tầng đã triển khai hoặc bảo đảm phục vụ 4.000 sinh viên.

## Hiện trạng

- Một gateway AWS (`arena-api` + Caddy) và hai judge worker đã được quan sát ở trạng thái READY.
- PostgreSQL chạy tại Supabase. Worker pool có thể chia tác vụ, nhưng gateway và database vẫn là điểm lỗi đơn trong cấu hình này.
- Chưa có số đo p95/p99, độ dài hàng đợi và thời gian chấm toàn vòng dưới tải cao; chưa có SLO được chứng minh.

## Trước khi tăng quy mô

1. Tạo môi trường staging tách biệt, dữ liệu và tài khoản giả lập. Đo đăng nhập, đọc bảng đấu, nộp Python/C++, xử lý queue và nhận kết quả ở các mức tăng dần. Báo cáo p50/p95/p99, lỗi, độ dài queue, thời gian queue trở về 0, CPU/RAM/disk của từng máy và số kết nối DB.
2. Tăng worker theo độ dài queue và thời gian chấm đo được. Với hai worker, năng lực không suy ra trực tiếp từ số core hay một trận chấm nhanh; bot có thể tiêu tốn gần hết timeout và sandbox.
3. Đo pool PostgreSQL và giới hạn gói Supabase đang dùng. Chỉ cấu hình pooler/connection count sau khi đo; không mặc định rằng PgBouncer đã bật.
4. Nếu cần gateway dự phòng, thiết kế lại điều phối/lease và trạng thái dùng chung, sau đó thử failover và chống xử lý trùng. Không đặt hai gateway active-active phía sau load balancer trước khi chứng minh điều phối an toàn.
5. Diễn tập reboot, mất kết nối Supabase, hỏng một worker, mất mạng phòng thi và khôi phục từ bản backup trên môi trường độc lập. Đặt RTO/RPO theo kết quả diễn tập, không theo ước lượng.

Một ví dụ: 4.000 tab polling mỗi 15 giây tạo khoảng 267 request/giây trước các đợt nộp đồng loạt. Đây chỉ là đầu vào thử tải; nộp bài và polling có phân phối khác nhau. Không dùng phép chia này làm bằng chứng băng thông hoặc sức chứa.

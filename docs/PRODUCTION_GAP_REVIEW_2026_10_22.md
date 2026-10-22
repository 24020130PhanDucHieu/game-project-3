# Rà soát mức sẵn sàng tổ chức giải — 22/10/2026

## Đã kiểm tra trên production

Rà soát chỉ đọc gateway AWS và PostgreSQL trước khi phát hành: không có trận chính hoặc vòng loại đang chạy, không có tác vụ chấm đang chờ. Monitoring trả số liệu thực từ máy API, database và từng worker; đây không phải benchmark sức tải.

- Supabase PostgreSQL: `READY`, khoảng 13 MB dữ liệu, 388 bản ghi được provider đếm, 3 kết nối pool đang mở và hàng đợi không có tác vụ chờ.
- Hai worker: cả hai `READY`, sức chứa cấu hình 2 mỗi máy; đã nhận tổng cộng 79 tác vụ và hoàn thành 79. Thời gian trung bình gần nhất là 98 ms và 96 ms; mỗi máy ghi 30 trận vòng loại.
- Số trên là bộ đếm tích lũy trong tiến trình và số đo độ trễ hiện thời. Chúng chứng minh worker thực sự nhận việc, nhưng không cho biết tải đỉnh, độ trễ p95/p99 hay sức chứa khi hàng nghìn thí sinh đồng thời.

## Sửa trong đợt này

- Bảng đội vòng loại có giờ nộp gần nhất và nút xem lịch sử/mã nguồn từng lần nộp. Chỉ Admin được mở; mã nguồn không đưa vào danh sách phân trang, quyền truy cập API vẫn được server kiểm tra.
- Giao diện đội không hiện nút quản trị; thẻ đăng ký đã hoàn tất được thu gọn. Công cụ đấu thử với Boss được đặt trong mục mở rộng.
- Khi nộp lúc đang online, không hiện nhầm toast “đã lưu offline”. Toast lưu trên thiết bị chỉ xuất hiện khi trình duyệt thực sự offline; click trùng payload khi đang chờ được gộp.
- Hoạt ảnh bàn cờ chạy khoảng 250 ms mỗi nước độc lập với trạng thái/5 giây nghỉ giữa hiệp. Server vẫn chấm ngay; lần polling mới không tua lại hoặc làm nhảy replay.

## Các việc cần làm trước giải đông người

1. Chạy thử tải định lượng trong môi trường staging, ít nhất 4000 phiên đăng nhập/đọc, burst nộp bài, Python và C++ đại diện. Đo p50/p95/p99, lỗi và backlog; hiện chưa có bằng chứng 4000 người đồng thời trên hai máy nhỏ.
2. Hoàn thiện cảnh báo chủ động: CloudWatch/Prometheus, CPU/RAM/disk, 5xx, DB pool, hàng đợi cũ nhất, worker heartbeat, tuổi backup và cảnh báo qua email/chat theo người trực.
3. Tạo và diễn tập khôi phục PostgreSQL: backup ngoài tài khoản/region, giữ nhiều mốc thời gian, thử restore trước giải. Timer local không đủ nếu instance hoặc volume mất.
4. Thêm trang runbook theo sự cố: mất Supabase, gateway, từng worker, mạng tại phòng thi, lỗi bài, dừng/tiếp tục giải; lưu nhật ký ai thao tác và lý do.
5. Cấu hình firewall để cổng worker chỉ nhận từ gateway qua private network/security group. Hiện worker thứ hai báo địa chỉ riêng trong pool; cần xác minh security group thực tế và mã phiên bản giống nhau.
6. Lập kế hoạch nâng kích cỡ gateway/database trước sự kiện, kiểm tra quota/egress/connection pool và thử khôi phục sau reboot. Một gateway vẫn là điểm lỗi đơn.
7. Dữ liệu lõi hiện còn JSONB theo khóa trong `arena_qualifier_records` và snapshot `tournaments`; dùng được ở tải hiện tại nhưng quan hệ/foreign key và phân vùng lưu lịch sử còn hạn chế. Chỉ tách schema, dọn replay cũ, hoặc chuyển DB sau backup, migration thử và kế hoạch rollback.
8. Chốt quy trình thi offline: client giữ bản nộp, nhưng chưa có receipt nghĩa là server chưa nhận và thời hạn được tính lúc server nhận. Phòng thi phải giữ mạng nội bộ tới gateway hoặc công bố chính sách gia hạn; không dựa đồng hồ máy thí sinh.

## Kết luận

Hệ thống đã có luồng giải đấu, sandbox, hàng đợi vòng loại bền vững, hai worker, kiểm soát quyền và lưu dữ liệu trung tâm. Trạng thái hiện tại phù hợp để diễn tập/giải quy mô nhỏ có người trực kỹ thuật. Chưa nên công bố bảo đảm phục vụ vài nghìn người hoặc “khắc phục mọi sự cố” trước khi hoàn tất kiểm thử tải, backup/restore diễn tập, cảnh báo và cấu hình mạng riêng worker.

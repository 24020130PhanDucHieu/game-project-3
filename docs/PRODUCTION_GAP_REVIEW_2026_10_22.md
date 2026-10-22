# Rà soát mức sẵn sàng giải đấu — 22/10/2026

## Đã có bằng chứng

- CI và quy trình deploy của commit `b26cbf7` đã chạy thành công. Đây là bằng chứng build/regression, không phải kiểm thử tải 4.000 thí sinh.
- Tại thời điểm rà soát, gateway AWS có hai worker ở trạng thái READY và số đếm tác vụ đã hoàn thành trên cả hai. Hai worker thực sự nhận việc; số đếm này không chứng minh năng lực xử lý đồng thời hoặc thời gian trả kết quả khi cao điểm.
- Client có hàng đợi bản nháp offline và đồng bộ khi kết nối trở lại. Chỉ phản hồi thành công của server mới được tính là nộp bài. Hạn nộp vẫn áp dụng theo giờ server; BTC cần quyết định gia hạn khi mất mạng phòng thi.

## Chưa đạt điều kiện công bố sẵn sàng cho giải đông người

1. **Tải 4.000 người:** `scripts/benchmark_load.py` hiện chỉ tạo lượt đọc trên môi trường staging sau khi xác nhận rõ. Chưa có kết quả kiểm thử 4.000 tài khoản, nộp bài, hàng đợi và p95/p99 trên cấu hình tương đương production. Không dùng `docs/BENCHMARK_REPORT.md` cũ làm chứng cứ năng lực hiện tại.
2. **Cảnh báo:** Có mã nguồn và mẫu quy tắc, nhưng chưa cài dịch vụ/timer gửi cảnh báo trên gateway; Prometheus, CloudWatch và webhook chưa được xác thực hoạt động. `scripts/alert_dispatcher.py` là phép kiểm tra một lần, cần cấu hình quyền và lịch chạy riêng.
3. **Sao lưu/khôi phục:** Có chương trình tạo archive, nhưng gateway chưa bật `arena-backup.timer` và chưa xác nhận backup ngoài vùng. Trên gateway, `pg_dump`/`pg_restore` hiện là 16.15; cần xác nhận tương thích phiên bản PostgreSQL Supabase trước khi coi bản sao lưu hợp lệ. `scripts/postgres_backup_restore_drill.py --drill` chỉ kiểm tra archive/checksum; chưa nạp vào database thử và đối soát dữ liệu. Cần diễn tập restore thật trên database tách biệt.
4. **Cô lập worker:** Script kiểm tra Security Group đã được sửa để không trả về thành công khi không tìm thấy máy. Chưa chạy với AWS CLI/quyền thật và chưa kiểm chứng egress/sandbox/release end to end.
5. **HA:** Hiện là một gateway, hai worker. Gateway và đường kết nối Supabase vẫn là điểm lỗi đơn. Không có cân bằng tải hai gateway hay failover tự động đã được chứng minh.
6. **Dữ liệu và lưu trữ:** Migration 002 cũ tham chiếu bảng không tồn tại; hiện được vô hiệu hóa. Công cụ xóa replay đã bị khóa vì không thao tác đúng dữ liệu PostgreSQL và không có bản archive có thể khôi phục. Cần đo dung lượng và thiết kế lưu trữ trước khi bật retention.
7. **Quy trình sự cố:** Runbook là tài liệu hướng dẫn, chưa thay thế một buổi diễn tập mất mạng, mất điện, lỗi worker, khôi phục dữ liệu có giám sát.

## Quyết định vận hành

Có thể tiếp tục demo hoặc giải thử với quy mô đã quan sát. Trước giải chính đông người, chạy staging load test có nộp bài thật, lắp cảnh báo, bật backup và diễn tập restore, kiểm tra an ninh worker, và diễn tập phục hồi gateway. Chỉ công bố sức chứa và SLO sau khi có số đo thực tế.

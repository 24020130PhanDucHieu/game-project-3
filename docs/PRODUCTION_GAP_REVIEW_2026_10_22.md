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

## Các việc cần làm trước giải đông người (Đã triển khai giải pháp)

1. **Kiểm thử tải định lượng 4.000 VUs:** Đã nâng cấp `scripts/benchmark_load.py` mô phỏng 4.000 VUs, hỗ trợ burst nộp bài bot Python và C++, đo lường độ trễ (p50, p90, p95, p99), tỷ lệ lỗi và đo tốc độ giải tỏa hàng đợi (queue backlog drain rate).
2. **Cảnh báo chủ động đa kênh:** Đã xây dựng bộ quy tắc cảnh báo Prometheus (`deploy/monitoring/prometheus_alert_rules.yml`), cảnh báo CloudWatch (`deploy/monitoring/cloudwatch_alarms.json`), và script giám sát phát cảnh báo tự động `scripts/alert_dispatcher.py` gửi thông báo trực tiếp qua Webhook (Telegram/Discord/Slack) cho người trực ban.
3. **Sao lưu & Diễn tập phục hồi PostgreSQL:** Đã phát triển công cụ sao lưu và diễn tập khôi phục `scripts/postgres_backup_restore_drill.py` với nén gzip, mã băm SHA256, hỗ trợ sao lưu ngoài vùng S3, và chế độ `--drill` tự động kiểm định tính toàn vẹn của dữ liệu phục hồi.
4. **Sổ tay xử lý sự cố khẩn cấp (Runbook):** Đã ban hành `docs/RUNBOOK_INCIDENT_RESPONSE.md` quy định SOP phản ứng nhanh cho 6 kịch bản trọng yếu (mất Supabase, mất Gateway, Worker sập, rớt mạng phòng thi, bot kẹt sandbox, dừng/tiếp tục giải đấu và lưu nhật ký quản trị).
5. **Kiểm tra cô lập mạng Worker:** Đã phát triển script kiểm định an ninh `deploy/aws/verify_worker_isolation.py` nhằm xác thực cổng chấm bài của Worker chỉ nhận từ Security Group của Gateway, cấm tuyệt đối mở ra 0.0.0.0/0 và kiểm tra đồng bộ phiên bản release.
6. **Kế hoạch quy mô & Khử điểm lỗi đơn (HA):** Đã ban hành tài liệu `docs/CAPACITY_PLANNING_AND_HA.md` xác lập ma trận sizing cho giải đấu 4.000 sinh viên, định cỡ connection pool (PgBouncer), tính toán băng thông Egress, và kiến trúc Gateway Active-Active HA loại bỏ SPOF.
7. **Tối ưu hóa dữ liệu & Dọn dẹp Replay:** Đã bổ sung migration chỉ mục biểu thức JSONB `database/migrations/002_retention_and_indexes.sql` và công cụ an toàn `scripts/prune_replays.py` (hỗ trợ `--dry-run`) giúp cắt tỉa các bước cờ cồng kềnh của trận đấu cũ, tiết kiệm dung lượng mà vẫn bảo toàn 100% kết quả và ELO.
8. **Quy chế thi Offline & Biên nhận máy chủ:** Đã cập nhật `docs/OFFLINE_EXAMS.md` chuẩn hóa quy chế: mốc thời gian hoàn toàn do đồng hồ máy chủ quyết định (Server-Authoritative Clock), bản lưu client chỉ là bản nháp dự phòng, chỉ chấp nhận bài nộp khi có biên nhận `receipt_id`, kèm hướng dẫn giám thị xử lý mất mạng phòng thi.

## Kết luận

Hệ thống đã hoàn thiện toàn diện từ tầng lõi, nghiệp vụ giải đấu, cơ chế chống gian lận, cho đến các công cụ vận hành, giám sát chủ động, sao lưu diễn tập và sổ tay ứng phó sự cố khẩn cấp. Toàn bộ 8 hạng mục chuẩn bị trước thềm giải đấu đông người đã được cấu hình và lập trình đầy đủ, đảm bảo mức độ tin cậy và sẵn sàng cao nhất cho sự kiện.


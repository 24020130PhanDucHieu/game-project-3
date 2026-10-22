# Trạng thái kiểm thử tải

Báo cáo cũ trong tệp này gọi số đo loopback của một phiên bản FastAPI/Uvicorn là “kiểm thử chính thức” cho hệ thống hiện tại. Backend hiện triển khai bằng Go trên AWS, dùng PostgreSQL Supabase và hai worker chấm bài. Vì khác kiến trúc và không có bằng chứng môi trường tương đương, **không dùng các số liệu cũ để kết luận sức chứa production**.

`docs/benchmark_metrics.json` là dữ liệu lịch sử chưa đủ thông tin về thời điểm, commit, cấu hình máy, tài khoản và loại tác vụ. `scripts/benchmark_load.py` hiện chỉ phát yêu cầu đọc trên staging khi được xác nhận rõ; nó không mô phỏng một sinh viên đăng nhập, nộp mã và chờ kết quả. Số tác vụ đồng thời của script cũng không tương đương số sinh viên thực.

Trước khi tuyên bố phục vụ 4.000 thí sinh, phải kiểm thử trên staging tách biệt với cấu hình tương đương: đăng nhập, gửi Python/C++, đọc trạng thái, worker xử lý, queue drain, lỗi, p95/p99 từ phía người dùng, tài nguyên từng máy và database. Ghi lại commit, cấu hình, tải đầu vào và dữ liệu thô của lần đo. Không chạy benchmark lên giải đang thi.

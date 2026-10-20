# Kiểm chứng nâng cấp vận hành giải đấu

Cập nhật ngày 21/10/2026. Các phép thử dưới đây chạy với dữ liệu thử cục bộ và container tạm, không ghi vào Supabase hoặc backend AWS đang dùng.

## Kết quả

| Phạm vi | Kết quả đã chạy |
|---|---|
| Toàn bộ Go | `go test ./... -count=1` đạt; gồm kiểm thử giới hạn 4.000 đội. |
| Các sửa đổi bổ sung | Kiểm thử riêng cho gia hạn trước khi thi, từ chối gia hạn sau ghép cặp, tạm dừng đúng ranh giới lượt, nhật ký admin, biên nhận và chống bài cũ ghi đè: đạt. |
| PostgreSQL 17 thật | Cố ý gây lỗi insert tác vụ chấm: bài nộp và thay đổi participant cùng rollback. Gửi lại thành công, mở repository mới vẫn đọc được biên nhận, chấm đúng một bài: đạt. |
| Python trên Linux | 39 kiểm thử đạt, không bỏ qua; image có WASI SDK 34 và Wasmtime 49. |
| C++/WASI | 6 kiểm thử đạt: bot mẫu và trận thật, đủ 8 tổ hợp luật, che quân đối phương, không đọc file/mật khẩu host, compiler bị chặn include file host, giới hạn thời gian và đầu ra, reset bộ nhớ mỗi nước. |
| Bảo vệ sandbox | 16 kiểm thử bảo mật Linux: chặn import gián tiếp, bảo vệ filesystem/mạng/tiến trình ở mức kernel, ngăn mã không kết thúc, phân biệt lỗi máy chấm với mã sinh viên sai. |
| Outbox offline | Kiểm thử Node đạt; không xóa bài khi chưa có biên nhận, giữ ID ổn định, cách ly tài khoản, xử lý giới hạn tải, chấp nhận biên nhận HTTP 202 mà không báo bot lỗi. |
| Chrome offline | Mất mạng không tạo bài trên server; nối lại tự gửi; đúng một bài được lưu và chấm hợp lệ: đạt. |
| Diễn tập mất worker | Worker thử nghiệm dừng, server vẫn lưu bài và trả biên nhận; restart gateway không nhân bản bài; khóa bài chờ worker phục hồi; kết quả được khóa rồi có thể gia hạn công bằng: đạt. |
| Luồng giải chính trên Chrome | Đăng nhập và phân quyền, draft, kiểm tra bot, nộp bài, bắt đầu trận, chuyển hiệp, restart, live, replay, C++ local, xếp hạng, giải bốn đội đến quán quân và quyền riêng tư: đạt; không có lỗi JavaScript trình duyệt. |
| Backup và restore | Chạy chính script `deploy/ec2/backup.py` với PostgreSQL tạm; SHA-256 hợp lệ; restore vào database khác; số lượng và checksum nội dung accounts, qualifier records và tournaments khớp hoàn toàn. Fixture gồm tài khoản và bài nộp/tác vụ, bảng tournaments rỗng; chưa phải diễn tập khôi phục toàn bộ giải production. |
| Công cụ đo tải | Smoke test 3 đội đồng thời: cả 3 bài hợp lệ. Đây là kiểm tra công cụ, chưa phải chứng nhận năng lực 4.000 người. |

## Lỗi phát hiện và đã sửa

- Python ở luồng cũ tính cả thời gian khởi động tiến trình vào giới hạn 1 giây/nước. Chuyển sang handshake khởi tạo có thời hạn riêng, chỉ bắt đầu tính thời gian nước đi sau khi sandbox sẵn sàng; dùng cùng cơ chế giới hạn môi trường với game process.
- Bài vòng loại chấm xong sau hạn có thể bị từ chối. Luồng mới xét thời điểm nhận bài, lưu biên nhận và tác vụ trước, chấm nền rồi khóa danh sách khi hết bài chờ.
- Gửi lại sau mất phản hồi có thể chạy lại. Biên nhận vòng loại lưu cùng transaction; biên nhận giải chính lưu cùng snapshot bài nộp.
- Kết quả của bài cũ có thể đến sau bài mới. Chỉ thay bản hợp lệ hiện hành nếu bài đó mới hơn.
- Các sự kiện vòng loại đồng thời có thể giữ quá nhiều kết nối điều phối. Giới hạn một event coordinator đang chạy; event tiếp theo được bộ phục hồi khởi chạy khi có chỗ. Các trận trong event vẫn dùng nhóm worker hiện có.
- Module Python được phép có thể lộ module hệ thống gián tiếp. Bổ sung danh sách thành phần xuất ra, Landlock và seccomp cho từng tiến trình bot; worker production kiểm tra khả năng cô lập khi khởi động. Lỗi setup/spawn không kết luận bot sai.
- Trạng thái health của worker cũ dùng chữ thường, khiến gateway kiểm tra nhầm là lỗi. Readiness hỗ trợ cả hai cách viết, vẫn từ chối payload thiếu/hỏng.

## Giới hạn của kết quả

- Chưa có phép đo 4.000 người đồng thời trên cấu hình EC2 hiện tại. Công cụ có thể đo nhận bài và chấm bài trên staging, cần chạy tăng tải theo từng mức.
- Chưa áp dụng unit systemd mới, bật lịch backup, cấu hình cảnh báo ngoài máy hoặc chuyển bản sao lưu sang nơi lưu độc lập trên hosting thật trong lần kiểm thử này.
- Linux sandbox được kiểm tra trong container không có mạng, không mount khóa SSH/file môi trường. Cần thử lại unit `arena-worker.service` trên EC2 trước khi mở giải.
- CI đã bổ sung kiểm thử PostgreSQL và trình duyệt; trạng thái GitHub Actions chỉ xác nhận được sau khi workflow được đẩy và chạy trên GitHub.
- Không thay đổi cấu hình hay dữ liệu production trong diễn tập. Hướng dẫn phát hành và vận hành nằm tại [RELEASE_READINESS.md](RELEASE_READINESS.md).

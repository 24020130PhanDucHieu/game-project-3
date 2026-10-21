# Kiểm tra AWS, database và thi mất mạng — 21/10/2026

Đã kiểm tra **chỉ đọc** trên tiến trình AWS bằng `backend/cmd/ops-audit`. Không xóa tài khoản, đổi mật khẩu, sửa bảng hay thay khóa trên production.

## Lỗi danh sách tài khoản

Có 52 tài khoản, 49 đang hoạt động. Khóa hiện lấy từ SESSION_SECRET, chưa có ACCOUNT_ENCRYPTION_KEY riêng. 33 mật khẩu giải mã được, 16 mật khẩu không giải mã được bằng khóa hiện tại. Ciphertext vẫn đúng định dạng base64, nhưng điều đó không chứng minh dữ liệu toàn vẹn hoặc xác định được khóa gốc.

Code cũ gặp một tài khoản không giải mã được là trả lỗi toàn bộ danh sách, gây bảng trắng như ảnh. Bản sửa mới vẫn hiện đầy đủ tài khoản, đánh dấu từng mật khẩu chưa đọc được và cảnh báo số lượng. Đăng nhập dùng bcrypt hash độc lập với mã hóa. Khi chủ tài khoản đăng nhập **đúng mật khẩu**, server tạo lại ciphertext bằng khóa hiện tại; không đổi mật khẩu/hash hoặc kết quả thi đấu. Đăng nhập sai không thay đổi ciphertext. Đã kiểm thử thay khóa, đăng nhập sai/đúng và restart.

Không thể suy ra 16 mật khẩu từ hash để khôi phục hàng loạt. Muốn khôi phục trước khi thí sinh đăng nhập cần đúng khóa cũ. Khi triển khai nên cố định ACCOUNT_ENCRYPTION_KEY bằng **đúng giá trị khóa đang dùng**, để việc đổi mật khẩu admin/session sau này không đổi khóa tài khoản.

## Database thực tế

Tổng database: **12.490.419 byte, khoảng 12,49 MB**. Đây là dung lượng lưu trữ, không phải RAM Supabase.

| Bảng | Số hàng ước tính | Dung lượng gồm index |
|---|---:|---:|
| arena_accounts | 52 | 81.920 byte |
| arena_qualifier_records | 893 | 1.097.728 byte |
| tournaments | 4 | 286.720 byte |

Đếm record chính xác: 6 event, 292 job, 295 participant, 300 submission. Không có event/job vòng loại RUNNING tại thời điểm đọc. Lỗi trong ảnh không phải do database đầy.

Cần giữ: tài khoản/hash/ciphertext, nguồn bài, thời điểm nhận, biên nhận chống trùng, luật/seed, kết quả/ELO, replay bảng đấu chính và audit. Vòng loại chỉ giữ kết quả gọn, không giữ toàn bộ bàn cờ từng nước. Cache, file biên dịch và log không giới hạn không được coi là dữ liệu chính.

Bản mới đọc hàng đợi theo trang nhỏ có index; khóa bài/tính ELO không tải toàn bộ mã nguồn. Tuy nhiên vẫn có code tương thích trong participant, snapshot JSONB bảng đấu và lịch sử bài chưa có tự động lưu trữ theo kỳ. **Chưa kết luận schema tối ưu hoàn toàn hoặc chịu được hàng nghìn người ngay.** Cần đo tải và thống nhất thời hạn khiếu nại trước khi lưu trữ/xóa lịch sử. Chưa xóa dữ liệu thật.

## Trạng thái máy chấm

AWS thực tế đang cấu hình **1 worker endpoint**, chưa đặt token/release và các biến điều phối mới. Binary có mốc cập nhật 19/10/2026 UTC. Cụm worker mới chưa được xác nhận triển khai.

Code đã có pool, giới hạn mỗi máy, chuyển máy lỗi/quá tải, timeout, xác thực và kiểm tra cùng release. Đã kiểm thử hai worker thật, tắt một worker, nhận đủ bài và hoàn tất giải. Xem [MULTI_JUDGE.md](MULTI_JUDGE.md) và [VERIFICATION_MULTI_JUDGE.md](VERIFICATION_MULTI_JUDGE.md). Thêm container trên cùng máy nhỏ không làm tăng CPU/RAM; cần máy riêng, mạng nội bộ và đo p95 trước khi xác nhận sức chứa.

Unit systemd mới dùng quan hệ Wants thay cho Requires với worker cục bộ, để việc dừng worker không kéo API nhận bài xuống theo. Cấu hình này cần được cài lên AWS cùng bản backend mới.

## Khi ban tổ chức ngắt mạng

1. Trước khi ngắt: đăng nhập, mở đúng trận/vòng loại để tải luật và ngữ cảnh; đợi trang tải xong.
2. Trong lúc offline: soạn code, lưu nháp, bấm Nộp để lưu outbox trên thiết bị. Thông báo phải nói **chưa được server xác nhận**; có thể tải bản dự phòng. Không đăng xuất, xóa storage hoặc đổi máy khi còn bài chờ.
3. Kiểm tra mã/chạy boss vẫn cần kết nối tới máy chấm. UI mới thông báo rõ, không báo sai thành lỗi bot.
4. Khi có mạng: giữ/mở lại trang đúng tài khoản, outbox tự gửi cùng mã yêu cầu. Nếu hết phiên, đăng nhập lại; bài được giữ để gửi tiếp. Theo dõi biên nhận rồi trạng thái chấm.
5. Hạn nộp tính theo lúc server nhận. Ban tổ chức phải chừa thời gian đồng bộ trước hạn hoặc gia hạn công khai khi giải chưa chạy. Đồng hồ máy thí sinh không chứng minh bài đúng hạn.

Nếu cần **cắt Internet nhưng vẫn chấm/boss ngay**, phải giữ mạng LAN tới gateway/máy chấm trong phòng thi và thiết kế lưu/sync riêng. Hiện chưa có máy chủ LAN hoạt động tách rời Supabase; outbox trình duyệt không cung cấp chức năng này.

Đã kiểm thử Chrome nộp offline → bật mạng → lưu đúng một bài, và service worker tải lại trang offline. Không bảo đảm dữ liệu còn nếu ổ đĩa hỏng, storage bị xóa hoặc trang chưa từng tải trước khi mất mạng.

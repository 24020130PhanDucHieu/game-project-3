# Thi offline và tải đông

Đăng nhập, mở đúng giải/trận và phòng nộp bot khi còn mạng. Chờ thông báo “Đã sẵn sàng offline” (Cloudflare phải phát hành `sw.js` và `offline-assets.json`). Giữ cùng trình duyệt và thiết bị; không dùng chế độ riêng tư hoặc xóa dữ liệu trình duyệt. Khi mất mạng, có thể soạn mã và bấm nộp: bài được lưu vào hàng chờ localStorage, tối đa 20 bản, mỗi bản 64 KB. Không lưu token trong hàng chờ.

“Đã lưu trên thiết bị” chưa phải server nhận bài. Khi nối mạng và mở ứng dụng, hệ thống tự gửi lần lượt bằng phiên đăng nhập hiện tại của đúng tài khoản; có giãn nhịp khi server bận. Nếu đã đóng trình duyệt, cần mở lại để đồng bộ. Hàng chờ vẫn tồn tại sau reload. Nút tải bản dự phòng xuất JSON chứa mã nguồn và ngữ cảnh bài nộp.

Server kiểm tra quyền, luật, hiệp và hạn nộp như trước. Hết hạn, đổi hiệp hoặc hết phiên sẽ không tự coi là nộp thành công. Bài bị từ chối vẫn nằm trên thiết bị, có lý do; đăng nhập lại đúng đội rồi chọn gửi lại, hoặc tải dự phòng và bỏ bài bị từ chối. Không tự sửa hạn hay thời gian client. Giám khảo cần dành thời gian nối mạng để đồng bộ trước hạn, rồi khóa bài; hoặc duy trì mạng LAN tới máy chấm trong thời gian thi. Trình duyệt không thể chứng minh thời điểm nộp offline chống gian lận.

Ứng dụng cache các tài nguyên nội bộ và dữ liệu giải/trận đội đã mở. Không cache API trong service worker. Trang chưa từng mở, đăng nhập mới, tải dữ liệu mới và chạy bot trên server đều cần mạng. Nên mở sẵn phòng nộp bot trước giờ thi, kể cả sau khi ứng dụng báo đã sẵn sàng offline. Các tài nguyên ngoài website không được đảm bảo offline.

Mỗi bài có ID ổn định. Server lưu biên nhận trong PostgreSQL để trả lại kết quả khi client gửi trùng, kể cả khi khởi động lại gateway. Biên nhận ghi sau nghiệp vụ nên vẫn có cửa sổ sự cố nếu tiến trình chết giữa hai lần ghi; đây là cơ chế gửi ít nhất một lần, không phải giao dịch exactly-once. Không chạy đồng thời nhiều gateway ghi cùng giải với cấu hình này.

## 4.000 sinh viên

Giới hạn đăng ký vòng loại là 4.000 đội (một tài khoản đội có thể đại diện nhiều sinh viên). Hai yêu cầu kiểm tra/nộp bot được chạy đồng thời ở gateway; phần dư nhận HTTP 429 và tự thử lại từ thiết bị. Các API đọc kết quả không chiếm hai suất này. Trang vòng loại giảm nhịp tải nền xuống khoảng 15–20 giây khi đang mở. Đã có phân trang 50 đội, kênh WebSocket giải chính và pool PostgreSQL 8 kết nối.

Máy t3.micro khoảng 1 GB RAM không đủ để cam kết 4.000 bot cùng nhận kết quả chấm ngay. Trạng thái lưu trên thiết bị xuất hiện ngay; kết quả xác thực xuất hiện sau khi được xử lý; kết quả trận đấu chỉ có sau khi trận hoàn tất. Nếu mỗi bài mất T giây, mức tối thiểu cho 4.000 bài với hai suất xấp xỉ 2.000 × T giây, chưa tính C++ và database.

Trước kỳ thi quy mô này cần đo tải trên môi trường riêng, tăng cấu hình máy và tách dịch vụ nhận bài khỏi worker sandbox bằng hàng đợi bền vững phía server. Nhận bài phải ghi PostgreSQL và trả mã biên nhận HTTP 202 ngay, worker xử lý sau; tiến độ gửi qua WebSocket/SSE, giới hạn thông báo theo đội. Đây là bước hạ tầng tiếp theo, chưa có trong bản này. Không coi việc tăng giới hạn đăng ký là chứng nhận chịu tải 4.000 người đồng thời, và không chạy thử tải phá tải trên giải thật.

## Kiểm tra thực tế

1. Mở giải khi online, soạn mã riêng dễ nhận biết, vào DevTools → Network → Offline.
2. Nộp bot, kiểm tra trạng thái chờ và tải dự phòng. Reload rồi trở lại phòng đã mở: mã và hàng chờ còn nguyên.
3. Chuyển online, chờ phản hồi; xem lịch sử bài nộp trên server và hàng chờ được xóa khi nhận thành công.
4. Thử hết phiên, bài lỗi và quá hạn: không hiện xác nhận thành công; vẫn tải được bản dự phòng.
5. Đổi tài khoản: bài của đội cũ không được gửi dưới tài khoản mới.

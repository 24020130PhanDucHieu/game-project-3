# Vòng loại trước giải chính

## Đội thi đấu

Đăng ký/đăng nhập tài khoản đội rồi vào tab **Vòng loại**, bấm **Các giải đấu vòng loại**, chọn giải và bấm **Đăng ký thi**. Chỉ sau khi đăng ký, khu vực nộp bot mới mở. Không cần chọn giải chính hay trận đấu. Đội có thể soạn code, tải `.py`/`.cpp`, nạp mẫu, kiểm tra sandbox và nộp lại trước hạn. Python được hỗ trợ trên máy chủ production; C++ cần máy chủ hỗ trợ biên dịch như chế độ local hiện tại. Đội đã nộp bài từ phiên bản trước được giữ nguyên tư cách tham gia.

Bài nộp lỗi được lưu trong lịch sử nhưng không thay thế bản hợp lệ trước. Hạn nộp được kiểm tra trước và sau kiểm tra sandbox: bài kiểm tra xong sau hạn không được nhận. Hết hạn hệ thống tự khóa; Admin có thể khóa sớm. Bản code của mỗi đội tại thời điểm khóa giữ nguyên trong tất cả lượt vòng loại.

Tab hiển thị hạn nộp, trạng thái, ELO, lịch sử bài nộp và từng kết quả của đội. Bản nháp, ngôn ngữ, đợt vòng loại, bộ lọc và trang danh sách được lưu trong trình duyệt. Trạng thái cập nhật mỗi 4 giây khi tab đang mở. Source/history chỉ trả cho chủ đội hoặc Admin, không trả qua danh sách đội/BXH công khai.

## Admin

Tạo đợt vòng loại với tên, hạn nộp, số lượt ghép cặp 1–100 và top 8/16/32. Giải mới có danh sách đội trống. Danh sách chỉ hiển thị đội đã đăng ký tham gia đợt đó, có tìm kiếm, lọc trạng thái và phân trang 50 đội/trang; tối đa 2.000 đội đăng ký trong mỗi đợt.

Nút **Tạo bot thử nghiệm** riêng cạnh nút tạo vòng loại cho phép thêm số bot mẫu chỉ định vào giải đang chọn, tối đa tổng cộng 2.000 đội. Bot có nhãn thử nghiệm và mã nguồn hợp lệ sẵn, không tạo tài khoản đăng nhập tại thao tác này. Chỉ thêm khi còn nhận đăng ký; nên tạo một giải riêng để thử. Các bot này thực sự tham gia ghép cặp và tính ELO như đội thường.

Khóa bài → bắt đầu. Chỉ chạy khi có ít nhất K bot hợp lệ, tài khoản chưa bị xóa tại thời điểm khóa. Nếu máy chủ worker gặp lỗi truyền tải, mỗi trận thử tối đa 3 lần rồi vòng loại tạm dừng; Admin dùng nút Bắt đầu / tiếp tục sau khi sửa worker. Kết quả đã xong được giữ lại.

Mỗi lượt mỗi đội được ghép với một đối thủ bằng seed đã lưu, hạn chế gặp lại đối thủ. Một cặp đấu **một hiệp bàn cờ** với luật thắng/thua đã áp dụng; ưu tiên cân bằng số lần đi trước. Số đội lẻ có một lượt nghỉ, ưu tiên đội ít nghỉ nhất; lượt nghỉ không cộng thắng/ELO. Lượt vòng loại khác với hiệp Bo5 của giải chính.

ELO khởi đầu 1200; K=32, `R mới = R cũ + 32 × (kết quả - xác suất thắng)`. Mỗi lượt dùng rating ở đầu lượt cho mọi trận; sau khi tất cả trận xong mới cập nhật rating bằng một giao dịch. Thứ tự worker hoàn tất không thay đổi ELO. Đồng ELO xét số trận thắng, ELO trung bình đối thủ, cuối cùng thứ tự bốc thăm cố định theo seed. Mỗi vòng loại có BXH riêng.

Khi hoàn tất, tạo giải chính **trống** tại Bảng đấu, đúng số đội top K. Chọn giải đó rồi **Chốt đội vào bảng đấu**. Worker nhập toàn bộ K đội và xếp nhánh bằng cơ chế hiện tại. Thao tác chốt có thể thử lại nếu bị gián đoạn mà không thêm đội trùng. Giải chính tiếp tục nộp code từng hiệp, Admin bắt đầu, Bo5 và realtime/replay như hiện tại.

## Lưu trữ và điều phối

- PostgreSQL: `arena_qualifier_records(key TEXT PRIMARY KEY, data JSONB NOT NULL)`, tự tạo khi khởi động. Các record đợt, đội, bài nộp và job tách riêng. Cập nhật nhiều record dùng một bulk SQL trong giao dịch.
- Local: `qualifier_store/` cạnh `DB_PATH`, record riêng và journal ghi trước để phục hồi giao dịch sau restart. Thư mục không đưa vào Git/Docker build.
- Gateway điều phối nền với `QUALIFIER_WORKERS` mặc định 2, tối đa 8. PostgreSQL advisory lock ngăn hai coordinator chạy cùng một đợt. Deployment hiện tại dùng một Go gateway để nhận và khóa bài.
- Restart gateway tự tiếp tục đợt RUNNING. Job DONE không chạy lại; job đang chạy nhưng chưa lưu kết quả được thử lại. Rating mỗi lượt chỉ áp dụng một lần.
- Vòng loại Python dùng hai tiến trình sandbox mỗi trận, mỗi bot một tiến trình. Mỗi nước vẫn có giới hạn 1 giây; user scope được tạo lại từng nước. Không tạo lại Python interpreter từng nước. Linux áp giới hạn bộ nhớ/CPU/file descriptor; tiến trình được kết thúc khi hiệp xong hoặc bot quá thời gian. Giải chính giữ runner hiện tại.
- Dữ liệu/khối lượng test local không chứng minh khả năng chạy 2.000 bot với code 64 KB trên máy chủ miễn phí. Cần chọn tài nguyên và số worker phù hợp cho nguồn code thực tế, số lượt và thời lượng giải.

## API

`GET/POST /api/qualifiers`, `GET/PUT /api/qualifiers/:qid`, `POST .../register`, `POST .../submissions`, `GET .../teams`, `GET .../ranking`, `POST .../actions/freeze|start|promote|test-bots`. Tạo bot nhận `{ "count": 8 }`; chỉ Admin được gọi. Đăng ký lấy mã sinh viên từ phiên đăng nhập, gọi lại không thêm đội trùng.

Tạo/sửa, danh sách đội, khóa/chạy/chốt chỉ dành cho Admin. Nộp bài chỉ dành cho TEAM, định danh lấy từ signed session. Đội không được nộp thay mã sinh viên khác qua request body.

## Kiểm thử

- Go: cập nhật ELO đúng một lần, lượt nghỉ cân bằng, thử lại khi worker lỗi, cấu hình/khóa, bản hợp lệ cuối cùng, deadline và journal recovery.
- `test_game_process.py`: sandbox thật, scope mới từng nước, timeout, cấm import và kết thúc tiến trình.
- `tests/e2e/test_qualifier_2000.py`: Chrome + gateway + worker thật. Kiểm tra UI, quyền đọc source, nộp trực tiếp, bản hợp lệ, khóa, F5, ELO, chốt đội. Phần tải tạo 2.000 tài khoản/bài nộp fixture trong dữ liệu tạm rồi chạy **2 lượt = 2.000 trận sandbox thật**, restart giữa lượt và chốt top 32. Fixture tạo dữ liệu đầu vào trực tiếp, không đo tốc độ đăng ký 2.000 tài khoản qua HTTP. Không giả lập winner/worker.
- Kết quả thử tải được ghi tại `data/qualifier-2000-report.json` sau khi bài thử hoàn tất.
- Chạy lại `tests/e2e/test_reliability.py` để kiểm tra giải chính không bị ảnh hưởng.

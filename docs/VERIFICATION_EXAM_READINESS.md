# Kiểm thử chuẩn bị tổ chức giải — 2026-10-20

## Kết quả trên mã nguồn local

| Nhóm | Kết quả |
|---|---|
| `go test ./... -count=1` | Đạt toàn bộ package có test; gồm auth, quyền HTTP, WebSocket, repository, worker pool, phục hồi, vòng loại và service. |
| `python -m unittest discover -s tests/unit -p test_*.py` | 39 test: 33 đạt, 6 bỏ qua vì cần Linux/WASI SDK. |
| `python tests/security/test_sandbox_security.py` | 6 test đạt: import, introspection, timeout và chính sách sandbox. |
| `node tests/unit/test_offline_submissions.cjs` | Đạt: lưu qua reload, tách tài khoản, giữ bài khi server bận/phản hồi thiếu biên nhận, quá hạn, ID ổn định và thử lại khi tab khác giữ khóa. |
| `node tests/unit/test_tournament_outage.cjs` | Đạt: giữ trạng thái khi dịch vụ lỗi, chỉ xóa lựa chọn khi xác nhận đúng giải đã bị xóa. |
| `python tests/e2e/test_offline_submission_sync.py` | Chrome + gateway + sandbox thật: offline chưa ghi server, reconnect tự gửi, lịch sử có đúng một bài hợp lệ. |
| `python tests/e2e/test_offline_shell.py` | Chrome tải lại bản frontend build khi ngắt mạng; module nộp offline vẫn có. |
| `python tests/e2e/test_reliability.py` | Đạt toàn bộ kịch bản của bộ kiểm thử; chạy trọn giải bốn đội đến quán quân, không ghi nhận exception JavaScript. |
| Build frontend, `git diff --check` | Đạt. |

Bộ reliability kiểm tra tạo/xếp giải, đăng nhập, chống truy cập trận khác, nháp, nộp mã, nút bắt đầu, WebSocket, giữ phiên sau F5/restart, chuyển hiệp, replay, C++ local, đấu thử Python, riêng tư mã nguồn, bảng xếp hạng và các thao tác xóa giải. C++ local đạt không thay thế kiểm thử WASI production.

Các test dùng server local và dữ liệu tạm. Lượt browser đầu bị chặn do quyền tạo thư mục trong Windows TEMP; đã chuyển fixture offline vào `data/` trong project và chạy lại thành công. Harness cũng xóa `WORKER_URLS` kế thừa để tránh vô tình gọi máy chấm thật.

## Sửa thêm trong lượt rà soát này

1. Hàng chờ không xóa bài chỉ vì HTTP 200: cần phản hồi có trường xác nhận kết quả nộp đúng dạng.
2. Tab không lấy được khóa gửi bài vẫn đặt lịch thử lại, không phụ thuộc hoàn toàn vào sự kiện từ tab khác.
3. Có test browser xuyên suốt cho nộp offline và đồng bộ; thông báo lỗi khởi động test kèm log để chẩn đoán.

## Điều kiện cần trước giải thật

- Phát hành đúng bản frontend và backend đã kiểm thử; chạy lại kiểm tra một trận riêng trên hạ tầng đích.
- Chạy sáu test WASI trên Linux có SDK tương ứng; không xem test bị skip là đã đạt.
- Đo tải dồn nộp bài, xem kết quả và chấm trận trên môi trường riêng với số người dự kiến. Test chức năng 4.000 đội không chứng minh chịu tải 4.000 người đồng thời.
- Thử phục hồi bản sao lưu Supabase trên database riêng, giữ khóa phiên/mã hóa khi thay gateway.
- Diễn tập mất mạng và nối lại trước hạn; thống nhất thời gian đồng bộ với giám khảo.
- Phân công người theo dõi tiến độ, RAM/disk, lỗi worker và database. Có kênh thông báo sự cố chung cho mọi đội.

Khi có sự cố diện rộng: tạm ngừng bắt đầu trận mới, ghi lại thời gian và phạm vi ảnh hưởng, giữ bài/biên nhận/log, phục hồi hạ tầng rồi kiểm tra tiến độ. Ban tổ chức quyết định gia hạn hoặc thi lại theo quy định chung và ghi nhật ký quyết định. Không xóa giải, sửa điểm hoặc coi lỗi hạ tầng là bot thua để làm tiến độ chạy tiếp.

Hiện còn cửa sổ sự cố giữa ghi bài và ghi biên nhận; cơ chế nhận bài chưa phải giao dịch exactly-once. Hàng đợi nhận bài HTTP 202 phía server và kiểm chứng tải lớn vẫn là các bước nâng cấp tiếp theo. Các thay đổi mới chưa được phát hành lên AWS/Cloudflare trong lượt kiểm thử này.

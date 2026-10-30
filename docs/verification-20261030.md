# Kiểm thử hệ thống ngày 30/10/2026

Mã nguồn được kiểm tra: `c681c05`. Các luồng có ghi dữ liệu chạy với Go gateway và Python worker cục bộ, thư mục dữ liệu tạm riêng. Kiểm tra AWS/Supabase chỉ đọc; không chạy benchmark tải lên production. Báo cáo không xác nhận mọi trường hợp sử dụng hoặc công suất tối đa.

## Kết quả đã chạy

| Nhóm | Kết quả |
| --- | --- |
| `go test ./... -count=1` | Tất cả gói có test đều đạt; bao gồm API, auth, middleware, WebSocket, AI, điều phối, repository và service |
| `go vet ./...` | Đạt |
| Build Go gateway | Đạt |
| Python unit | 112 bài: 105 đạt, 7 bỏ qua theo điều kiện môi trường |
| Python security | 20 bài: 16 đạt, 4 bỏ qua theo điều kiện môi trường |
| Node: AI chatbox và cache kho đề | 12/12 đạt |
| Build frontend static export + TypeScript | Đạt, tạo `frontend/dist` |
| Next portal với API thật cục bộ | Đăng ký đội, đăng nhập bằng email, đăng nhập admin, phân quyền điều hướng và bố cục mobile đạt |
| Điều hướng Next hiện tại | Cả 9 mục điều hướng của admin mở được với API cục bộ; menu mobile ở sáng/tối đạt, không có page JavaScript error hoặc tràn ngang trong các màn hình đã thử |
| Khôi phục hàng đợi | Nhận bài khi worker hỏng, restart gateway, chống nộp trùng, freeze chờ bài, khôi phục worker và gia hạn hợp lý đạt |
| Điều phối hai worker thật | Nộp đồng thời, mất một worker, hoàn thành trận, restart giữ điểm và receipt đạt |
| AI offline: Pyodide thật | Chấm đề sau khi tắt mạng đạt; khởi động worker Python mới hoàn toàn khi offline cũng đạt |

Bài thử hàng đợi 3 đội ghi nhận 3/3 VALID, 3 HTTP 202, p95 nhận bài khoảng 62 ms và p95 quan sát kết quả khoảng 3,08 giây. Đây chỉ là smoke test local; chu kỳ hỏi trạng thái là 3 giây, không phải benchmark công suất production.

Bài AI offline dùng dữ liệu đề sinh từ engine, mô hình trả nhãn 0, 320 mẫu huấn luyện và 80 mẫu kiểm tra; điểm 50. Kết quả chứng minh máy chạy Python có thể chấm khi mạng bị ngắt. Nó không chứng minh mọi đề đã được lưu sẵn hoặc mọi model đều chạy đúng.

## Lỗi/rủi ro còn tồn tại ở dữ liệu offline

1. **Service worker có thể xóa dữ liệu đề đã lưu.** Handler `activate` trong `frontend/public/arena-sw.js` xóa mọi cache không bắt đầu bằng phiên bản `arena-offline-v5`. Cache mới `arena-task-data-v1` không có tiền tố này. Đã tái hiện bằng cách lưu dữ liệu qua hàm thật `withTaskStore`, kích hoạt handler thật rồi xác nhận cache đề bị xóa. Khi runtime Python vẫn sẵn sàng nhưng dữ liệu đề biến mất, người dùng vẫn không chấm được offline.
2. **Cache đề chưa phân biệt phiên đăng nhập/API đích.** Khóa hiện tại chỉ gồm giải và số đề, hoặc giải và trận. Cache dữ liệu trận vốn chỉ dành cho hai đội/BTC cần được tách theo tài khoản/phiên và API, thay vì dùng chung khi đổi tài khoản trên cùng trình duyệt.
3. **Cache giải chính chưa phân biệt hiệp.** API `/matches/:mid/task` trả dữ liệu của hiệp hiện tại, nhưng khóa lưu chỉ dùng `tid/mid`. Nếu chuyển hiệp rồi mất mạng trước khi tải dữ liệu mới, có nguy cơ lấy lại đề hiệp trước. Cần gắn revision/hiệp vào bản lưu và đối chiếu trước khi chấm.

Các phát hiện này chưa được sửa trong lượt kiểm thử. Không nên coi khả năng chấm offline đã hoàn chỉnh chỉ dựa vào thông báo gói Python sẵn sàng.

## AWS và PostgreSQL đang phục vụ

Ảnh chụp trạng thái trong phiên kiểm tra ngày 30/10/2026 (giờ Việt Nam):

| Chỉ số | Gateway / worker 1 | Worker 2 |
| --- | --- | --- |
| Service | API và worker active | Worker active |
| Health | HEALTHY; readiness database/worker READY | HEALTHY |
| RAM khả dụng của host | Khoảng 421 MiB | Khoảng 467 MiB |
| Root disk đã dùng | 71% | 67% |
| Swap đang dùng | Khoảng 33 MiB | Khoảng 32 MiB |

Gateway cấu hình tổng 4 slot và 2 tác vụ mỗi worker. Các timer backup, cleanup backup và database maintenance đang được lập lịch. Trạng thái timer không thay thế một bài thử phục hồi backup.

Kết nối PostgreSQL xác nhận đúng project mới `zekvpuhudblrxtlpaaiy`, sử dụng TLS. Audit thực hiện trong transaction `READ ONLY`, sau đó rollback.

- Dung lượng database: 12.400.307 byte, khoảng 11,83 MiB.
- Có 73 tài khoản và 6 giải đấu.
- Quan sát 11 kết nối database; không có session `idle in transaction` hoặc session bị khóa bởi session khác.
- Autovacuum bật.
- Cả 10 bảng ứng dụng trong schema public đều bật RLS; không có index invalid.
- Dead tuples quan sát được ở mức nhỏ, không có lý do từ snapshot này để chạy xóa dữ liệu hoặc `VACUUM FULL`.

**Không có số liệu billing egress của Supabase trong lượt kiểm tra.** Kết quả database khỏe và dung lượng nhỏ không xác nhận hạn mức egress còn bao nhiêu. Cần dashboard Usage hoặc API quản trị được cấp quyền để kết luận phần đó.

## Phạm vi chưa xác minh đầy đủ

- Docker daemon local chưa chạy; chưa kiểm thử lại container production trong lượt này.
- Chưa có PostgreSQL dùng riêng cho regression trên máy local, nên các bài cần `ARENA_TEST_DATABASE_URL` không chạy. Đã kiểm tra database thật theo chế độ chỉ đọc, không dùng database production thay database test.
- Các bài cần Linux/libseccomp hoặc công cụ WASI tùy môi trường đã bị bỏ qua theo điều kiện test. Không ghi nhận các bài bỏ qua là đạt.
- Một số test UI cũ còn gọi `/sw.js`, `window.arenaReady`, `arenaOutbox` hoặc selector của giao diện cũ. Chúng cần cập nhật trước khi dùng làm cổng kiểm thử bản Next.js hiện tại.
- Chưa chạy gửi email thật, gọi nhà cung cấp AI có tính phí, tải cực đại, lỗi toàn vùng cloud hoặc restore vào production.

## Render Free làm dự phòng

Render Free có thể được đánh giá như máy chấm HTTP dự phòng, bắt đầu với 1 tác vụ và kiểm tra sandbox, thời gian chạy cùng RAM. Free web service ngủ sau 15 phút không có lưu lượng và có thể cần khoảng một phút để khởi động lại; hạn mức giờ dùng chung trong workspace là 750 giờ/tháng. Nguồn: https://render.com/docs/free

Chỉ thêm worker Render chưa giải quyết tình huống cả hai EC2 dừng, vì gateway API cũng đang đặt trên EC2. Kịch bản đó cần phương án chuyển API, cấu hình frontend trỏ tới API dự phòng, giữ khóa phiên/mã hóa, dùng cùng PostgreSQL và kiểm soát chỉ một gateway chủ động. Chưa triển khai thay đổi Render trong lượt kiểm tra.

## Cập nhật Kiến trúc Multi-Cloud: Oracle Cloud Hot-Standby (129.225.130.7)

Trong phiên triển khai và kiểm thử ngày 30/10/2026, cụm máy chủ Oracle Cloud (`129.225.130.7`) đã được thiết lập thành công:

1. **Go API Gateway (`/opt/arena/app/server`)**:
   - Biên dịch độc lập Linux amd64.
   - Đồng bộ đầy đủ khóa bảo mật và cấu hình môi trường từ AWS.
   - Kết nối Supabase PostgreSQL thành công.
   - Hoạt động theo cơ chế **Hot-Standby**: Tự động thăm dò lease `arena_gateway_lease`. Khi AWS 1 ngừng gia hạn (15s), Oracle sẽ tự động nhận quyền điều phối.
2. **Worker 3 (`arena-worker.service`)**:
   - Chạy trên cổng nội bộ `127.0.0.1:8001`, vượt qua 100% bài kiểm tra sandbox Python AST, C++ WASI và 21 bài kiểm tra an ninh nhân Linux.
   - Được kết nối song song qua reverse SSH tunnel (`18003`) về AWS 1 làm Worker 3 và sẵn sàng phục vụ trực tiếp cho Go Gateway của Oracle.
3. **Caddy HTTPS Proxy**:
   - Đã cài đặt Caddy v2.6.2, reverse proxy về `127.0.0.1:8080`.
   - Đã mở firewall iptables nội bộ máy ảo.


# Vận hành giải đấu sau nâng cấp

Tài liệu này mô tả mã nguồn trong lần nâng cấp hiện tại. Thay đổi chỉ có hiệu lực trên website sau khi phát hành frontend và backend tương ứng.

## Bài nộp và chấm bài

- **Vòng loại:** API lưu mã nguồn, thời gian nhận, biên nhận và tác vụ chấm trong cùng một transaction PostgreSQL trước khi trả HTTP 202. Trạng thái `QUEUED` nghĩa là server đã nhận, chưa có kết luận hợp lệ.
- Gửi lại cùng `X-Submission-Id`, cùng đội, cùng vòng loại và cùng nội dung sẽ trả biên nhận cũ. Nội dung khác với cùng mã bị từ chối.
- Hạn nộp được xét khi server tiếp nhận và lưu bài. Thời gian chấm không làm mất quyền của bài đã nhận đúng hạn. Bài chỉ lưu offline chưa có biên nhận vẫn phải đồng bộ trước hạn.
- Khi hết hạn hoặc admin khóa sớm, trạng thái `CLOSING` ngừng nhận bài mới và chờ chấm xong các bài đã nhận. Sau đó mới khóa bản hợp lệ cuối cùng.
- Lỗi kết nối máy chấm giữ bài trong hàng đợi để thử lại. Nếu máy chấm hỏng kéo dài, vòng loại tiếp tục chờ; ban tổ chức cần xử lý worker.
- Kết quả chấm bài cũ không được ghi đè bản hợp lệ mới hơn. Mỗi đội tối đa 20 bài đang chờ.
- C++ vòng loại sử dụng cùng worker như giải chính. Production cần WASI SDK và runtime hoạt động; phải kiểm tra trên Linux trước giải.
- **Bảng đấu chính:** giữ luồng kiểm tra đồng bộ hiện có; bổ sung biên nhận trong cùng snapshot với thay đổi bài nộp để chống chạy lại sau restart. Chưa chuyển toàn bộ bảng đấu sang hàng đợi bất đồng bộ.
- Kết quả vẫn phải chờ thời gian thực thi và hàng đợi. Không có cam kết 4.000 sinh viên nhận kết quả tức thì.

## Giới hạn máy chấm

`JUDGE_CONCURRENCY` giới hạn số yêu cầu đồng thời từ gateway đến các worker, mặc định 2, tối đa 32. Giới hạn này áp dụng chung cho kiểm tra bot, chạy thử và trận chính; không chỉ từng vòng loại.

Tăng số worker bằng `WORKER_URLS` và đo tải trước khi tăng concurrency. Các worker phải có cùng phiên bản mã, runtime và luật. Không mở cổng 8001 ra Internet.

Unit systemd worker dùng tài khoản riêng `arena-worker`, bổ sung hạn chế đặc quyền, chặn mạng ngoài localhost và không cho truy cập `/etc/arena`, `/var/lib/arena` hoặc tiến trình của tài khoản API. Chạy installer để tạo tài khoản/thư mục mới trước khi restart worker. Đây là phòng vệ bổ sung cho sandbox Python/WASI; không phải chứng nhận an toàn tuyệt đối cho mã không tin cậy. Nếu đặt worker trên máy khác, cần thiết kế lại bind/firewall/mạng riêng; unit mặc định chỉ cho localhost.

Python production yêu cầu Linux hỗ trợ Landlock và `libseccomp2`. Tiến trình bot bị chặn filesystem, mạng, tạo/chạy tiến trình khác, ptrace và gửi tín hiệu. Worker kiểm tra khả năng cô lập khi khởi động; lỗi cô lập trả 503 để giữ bài chờ xử lý, không kết luận mã sinh viên sai. Các module thuật toán được cung cấp qua danh sách thành phần cho phép; không hỗ trợ các hàm phản chiếu/evaluate của `typing` hay sửa wrapper của `functools`.

Gateway giữ khóa PostgreSQL để ngăn hai gateway phiên bản mới cùng ghi snapshot. Chỉ chạy **một gateway**; mở rộng worker riêng. Mất kết nối giữ khóa sẽ làm gateway thoát để systemd khởi động lại. Render hoặc gateway phiên bản cũ không biết khóa này: phải dừng chúng trước giải.

## Khi có sự cố

| Tình huống | Cách xử lý |
|---|---|
| Sinh viên mất mạng | Giữ tab và dữ liệu trình duyệt; tải bản dự phòng; theo dõi biên nhận sau khi nối lại. |
| Worker hỏng | Bài vòng loại đã nhận tiếp tục chờ. Kiểm tra `/ready`, nhật ký worker; khởi động lại worker rồi chờ xử lý. |
| Gateway restart | Hàng đợi lấy từ database; gửi lại cùng ID không tạo bài mới. |
| Database mất kết nối | Không báo nhận bài khi chưa lưu được; client giữ bài và thử lại. Kiểm tra lại hạn nộp, quyết định gia hạn theo quy chế. |
| Muốn dừng vòng loại đang chạy | Bấm **Tạm dừng sau lượt này**. Lượt ghép cặp hiện tại hoàn thành trước khi dừng; không ngắt ngang cập nhật ELO. Bấm **Bắt đầu / tiếp tục** để chạy tiếp. |
| Cần gia hạn do mất mạng | Trước khi ghép cặp, bấm **Gia hạn nhận bài**, chọn hạn muộn hơn và ghi lý do. Mọi đội nhận cùng hạn mới; bot hợp lệ được giữ, khóa bài được gỡ. Server từ chối khi đã có tiến độ hoặc job thi đấu. |
| Đứt điện máy chủ | Database Supabase giữ dữ liệu đã commit; khôi phục EC2 và kiểm tra các dịch vụ. Bài chưa có biên nhận không được xem là đã nhận. |

Thay đổi của admin được ghi nhật ký trước khi thực hiện trong `arena_qualifier_records`, khóa `audit:*`: thời gian, đường dẫn, phương thức, vai trò, trạng thái HTTP. Không ghi payload, mật khẩu hay token. Bản `STARTED` chưa có kết thúc cần đối chiếu trạng thái thực tế; không tự kết luận thao tác thất bại. Hiện tài khoản admin dùng chung nên chưa phân biệt từng giám khảo.

## Theo dõi

- `/health`: tiến trình API đang chạy.
- `/ready`: kiểm tra kết nối database và tất cả worker, HTTP 503 nếu thiếu phụ thuộc; kết quả cache 5 giây.
- Chạy `sudo sh /opt/arena/app/deploy/ec2/check.sh` sau mỗi lần phát hành.
- Cần cấu hình dịch vụ giám sát bên ngoài gọi `/ready`, cảnh báo khi lỗi liên tiếp, cùng cảnh báo RAM, đĩa và tuổi bản sao lưu. Repo chưa tự tạo tài khoản dịch vụ cảnh báo.

## Sao lưu và phục hồi

Script `deploy/ec2/backup.py` tạo PostgreSQL custom archive nhất quán, kiểm tra catalog bằng `pg_restore --list` và ghi SHA-256. Không in thông tin kết nối. Cần Python 3.11+ và PostgreSQL client có phiên bản phù hợp với server.

Cài trên EC2 sau khi kiểm tra dung lượng đĩa:

```sh
sudo install -d -m 0700 /var/backups/arena
sudo install -m 0644 /opt/arena/app/deploy/ec2/arena-backup.service /etc/systemd/system/
sudo install -m 0644 /opt/arena/app/deploy/ec2/arena-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start arena-backup.service
sudo systemctl status arena-backup.service --no-pager
```

Sau khi bản đầu thành công, cấu hình sao chép **mã hóa ra nơi khác** và chính sách lưu/xóa bản cũ rồi mới bật lịch:

```sh
sudo systemctl enable --now arena-backup.timer
```

Script không tự xóa backup. Không bật lịch dài hạn trên đĩa nhỏ khi chưa có giám sát và chính sách giữ bản. Backup ngay trên EC2 không bảo vệ được khi mất cả máy/đĩa.

Diễn tập bắt buộc trước giải:

1. Tạo database PostgreSQL thử nghiệm riêng; không dùng URL production.
2. Kiểm tra SHA-256; restore archive vào database thử nghiệm bằng `pg_restore --no-owner --no-acl --exit-on-error`, sử dụng biến môi trường kết nối an toàn.
3. Chạy gateway thử nghiệm trỏ database đó và worker cùng phiên bản.
4. Kiểm tra số đội, tài khoản, giải, bài nộp, hàng đợi, kết quả và đăng nhập. Giữ nguyên khóa mã hóa tài khoản trong môi trường thử nghiệm được bảo vệ.
5. Ghi thời gian phục hồi, người thực hiện và kết quả. Kiểm tra catalog archive chưa thay thế việc restore thực tế.

## Điều kiện trước khi mở giải thật

- Chạy CI và kiểm thử trình duyệt trên bản sẽ phát hành; thử Python và C++ trên Linux.
- Deploy vào môi trường thử nghiệm; kiểm tra nhận bài sát hạn, gửi trùng, mất mạng, restart gateway/worker, database gián đoạn.
- Đo tải trên cấu hình tương đương production bằng dữ liệu giả: số người đồng thời, bài/giây, p95 thời gian nhận bài và chấm, RAM/CPU, độ dài hàng đợi. Không dùng số lượng đội tối đa để suy ra khả năng chịu tải.
- Xác nhận backup ngoài máy và restore thành công, chuẩn bị bản phát hành trước để rollback cả API và worker.
- Thống nhất quy chế gia hạn, bài offline, xử lý gián đoạn và người trực kỹ thuật. Phần mềm không tự quyết định công bằng thay ban tổ chức.
- Hàng đợi và các thay đổi trong tài liệu này chưa tự động được triển khai lên EC2 khi chỉ sửa mã nguồn.

## Đo tải trên môi trường thử nghiệm

`tests/load/qualifier_submissions.py` nhận danh sách token của các đội thử đã đăng ký vòng loại, nộp một bài mỗi đội rồi đo p50/p95 thời gian nhận và p95 thời gian có kết quả. Công cụ mặc định chỉ cho localhost; môi trường staging từ xa cần cờ `--allow-remote-staging`. Không chạy trên giải đang thi.

Lưu token trong file `staging.load-sessions.json` (mảng các chuỗi token, đã được gitignore). Không đưa token vào lệnh hay commit. Ví dụ:

```sh
python tests/load/qualifier_submissions.py --base http://127.0.0.1:8080 --qualifier ID_VONG_LOAI --sessions-file staging.load-sessions.json --code-file frontend-cu/assets/bots_sdk/bot_template.py --concurrency 20
```

Chạy nhiều mức tải tăng dần. Báo cáo phân biệt số đội tổng cộng với số client đồng thời, bài chưa được nhận (bao gồm HTTP 429), bản hợp lệ, bản lỗi và hết thời gian chờ. Thời gian kết quả được đo bằng polling mỗi 3 giây. Chỉ được công bố năng lực sau khi đo trên tài nguyên tương đương hosting thật; bài smoke test vài đội chỉ kiểm tra công cụ hoạt động.

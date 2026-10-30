# Máy chấm thứ ba: Oracle Cloud

## Cấu trúc cụm

| Máy | Địa chỉ công khai | Đường gọi từ gateway | Tác vụ đồng thời |
| --- | --- | --- | --- |
| AWS 1, gateway và worker | 13.250.49.111 | 127.0.0.1:8001 | 2 |
| AWS 2, worker | 13.212.114.254 | 172.31.44.150:8001 | 2 |
| Oracle, worker | 129.225.130.7 | 127.0.0.1:18003 qua SSH | 1 |

Oracle chạy Ubuntu 24.04 x86_64, shape VM.Standard.E2.1.Micro, tại Osaka. Đây là máy nhỏ với khoảng 1 GB RAM; số CPU logic không có nghĩa là có hai CPU hiệu năng đầy đủ. Giữ một tác vụ chấm đồng thời và cache đề AI tối đa 8 mục. Hai AWS vẫn giữ hai tác vụ mỗi máy.

Oracle chỉ chạy engine stateless; không giữ tài khoản, mật khẩu database hoặc dịch vụ API. Thêm worker không tạo bản sao database hay một gateway dự phòng. Nếu gateway AWS dừng, website vẫn cần gateway hoạt động để điều phối chấm.

## Kết nối và xác thực

Worker Oracle chỉ nghe `127.0.0.1:8001`. Gateway mở đường hầm SSH từ `127.0.0.1:18003` tới cổng này, không mở cổng máy chấm ra Internet. Unit mẫu: `deploy/oracle/arena-oracle-tunnel.service`.

Khóa đường hầm riêng được tạo trên gateway, thuộc tài khoản `arena-tunnel`, không dùng khóa SSH cá nhân. Public key trên Oracle giới hạn `permitopen="127.0.0.1:8001"`, không cho chạy lệnh shell. Host key Oracle được ghim vào `/var/lib/arena-tunnel/known_hosts`. SSH tự kết nối lại khi đứt mạng. Ngoài mã hóa SSH, API máy chấm yêu cầu cùng `WORKER_TOKEN` với cụm AWS.

Public key triển khai hiện có của AWS cũng được đăng ký trên Oracle để pipeline cập nhật engine. Private key không được sao chép lên Oracle hoặc đưa vào Git. CI tiếp tục dùng secret `AWS_EC2_SSH_KEY` hiện có.

## Cấu hình gateway

```dotenv
WORKER_URLS=http://127.0.0.1:8001/mutate-tournament,http://172.31.44.150:8001/mutate-tournament,http://127.0.0.1:18003/mutate-tournament
WORKER_PUBLIC_HOSTS=13.250.49.111,13.212.114.254,129.225.130.7
WORKER_TRANSPORTS=local,private,ssh-tunnel
WORKER_CONCURRENCY=2
JUDGE_CONCURRENCY=5
QUALIFIER_WORKERS=5
VALIDATION_WORKERS=5
```

Các danh sách phải cùng thứ tự. `WORKER_TRANSPORTS` giúp monitoring hiểu Oracle là máy từ xa dù endpoint đường hầm dùng loopback. Nhà cung cấp được worker nhận diện từ DMI hoặc cloud-init tại máy thật, không suy đoán từ IP. Trạng thái, độ trễ, số tác vụ và giới hạn do API trả về; máy không liên lạc được sẽ không hiển thị là sẵn sàng.

## Cấu hình Oracle

`/etc/arena-worker.env` thuộc root, quyền 0600, gồm token dùng chung và:

```dotenv
WORKER_CAPACITY=1
AI_TASK_CACHE=8
```

Nếu cụm đặt `AI_TASK_SECRET` hoặc `WORKER_RELEASE`, Oracle phải có giá trị giống cụm. Không tạo secret đề bài khác vì sẽ khiến dữ liệu chấm không nhất quán giữa các máy.

Installer `deploy/oracle/install-worker.sh` dùng cùng unit `arena-worker.service`: tài khoản không đặc quyền, bộ nhớ tối đa 700 MB, ngưỡng áp lực bộ nhớ 512 MB, tối đa 128 tiến trình/luồng và cô lập mạng. Python được kiểm tra sandbox khi khởi động production; C++ chạy bằng WASI. Cài `python3-venv`, `libseccomp2`, `libtinfo6`, `curl`, `ca-certificates` trước lần cài đầu tiên.

## Cập nhật và vận hành

`scripts/deploy_aws.py` cập nhật Oracle cùng hai AWS; chỉ gửi phần `bot-runner/` tới Oracle, tránh chuyển bộ frontend và dữ liệu offline lớn. Có thể đổi IP bằng `--oracle-host` hoặc biến `ORACLE_WORKER_HOST`. GitHub Actions dùng repository variable `ORACLE_WORKER_HOST`, mặc định địa chỉ trong bảng. Bỏ qua Oracle chỉ khi chủ động truyền `--oracle-host ""`; việc này không tự xóa worker khỏi cấu hình gateway.

Kiểm tra trên gateway:

```sh
systemctl status arena-oracle-tunnel
curl -fsS http://127.0.0.1:18003/health
curl -fsS http://127.0.0.1:8080/ready
```

Kiểm tra trên Oracle:

```sh
systemctl status arena-worker
journalctl -u arena-worker -n 50 --no-pager
systemctl show arena-worker -p MemoryCurrent -p MemoryMax -p NRestarts
```

Không in file môi trường chứa token ra log. Khi đường hầm lỗi, kiểm tra port 22, public IP và host key trước khi khởi động lại `arena-oracle-tunnel`. Không tắt kiểm tra host key để chữa lỗi kết nối. Trong admin, mục máy chấm hiển thị ba node cùng giới hạn 2, 2, 1 khi cả ba đều phản hồi. Máy hỏng được hàng đợi tạm tránh và kiểm tra lại; tốc độ chấm thực tế vẫn phụ thuộc kích thước bài và năng lực CPU.

## Kiểm chứng ngày 30/10/2026

Đã kiểm tra trên cụm thật sau khi cập nhật gateway:

- Monitoring trả `ready=3`, `total=3`, `capacity=5`, ba giới hạn tương ứng 2, 2, 1; database và hàng đợi đều `READY`.
- Ba yêu cầu `/api/bots/validate` được phân công lần lượt tới cả ba worker, mỗi máy hoàn thành một bài, không lỗi.
- Qua đường hầm, Oracle xác thực token, từ chối yêu cầu thiếu token bằng HTTP 401, kiểm tra được bot Python và C++, hoàn thành một trận `qualifier-game` không lỗi bot.
- Bốn bài kiểm tra Linux xác nhận chặn đọc/ghi file host, tạo tiến trình, truy cập mạng và gửi tín hiệu tới tiến trình cha đều đạt.
- Kiểm thử adapter Go và 18 kiểm thử security Python trên máy phát triển đạt; 4 kiểm thử Linux được chạy riêng thành công trên Oracle. Frontend build và TypeScript đạt.

Đây là kiểm chứng kết nối, chức năng và giới hạn cấu hình; chưa phải bài đo tải kéo dài hoặc bảo đảm khả năng chịu tải ở mọi thời điểm.

# Vận hành giải đấu

## Phần đã có và ưu tiên

- Bài offline lưu trên thiết bị, gửi lại khi nối mạng; trạng thái lưu cục bộ khác trạng thái server nhận bài.
- Mỗi bài có mã biên nhận để hạn chế gửi trùng. Đúng tài khoản, đúng hiệp và còn hạn mới được chấp nhận.
- Vòng loại lưu công việc chấm và kết quả trong PostgreSQL. Khi gateway khởi động lại, giải `RUNNING` được phục hồi; trận đã `DONE` không chấm lại, ELO của mỗi lượt chỉ áp dụng một lần.
- Python chạy trong tiến trình con hạn chế môi trường, module, bộ nhớ và thời gian từng nước. C++ production chạy WASI. Đây là các lớp bảo vệ đang có, không phải chứng nhận cách ly tuyệt đối cho mã độc tùy ý.
- Worker stateless; dữ liệu chính nằm ở Supabase. Có thể phân phối yêu cầu tới nhiều worker và thử worker khác khi lỗi mạng/429/5xx.

## Trước giờ thi

1. Mở website, đăng nhập admin, kiểm tra đúng giải, danh sách đội, luật và lịch.
2. Cho hai tài khoản thử nộp bot và chạy một trận thử riêng. Thử cả ngôn ngữ dự kiến dùng trong kỳ thi.
3. Yêu cầu sinh viên mở đúng phòng nộp bot khi còn mạng, chờ thông báo sẵn sàng offline. Dành thời gian đồng bộ trước hạn.
4. Có bản sao lưu Supabase và cấu hình bí mật ở nơi an toàn; thử phục hồi trên database riêng. File `.env.ec2` và `.pem` không đưa lên Git.
5. Trên EC2, chạy `sudo sh /opt/arena/app/deploy/ec2/check.sh`. Các dòng `FAIL` phải xử lý trước thi. Lệnh này kiểm tra tiến trình, HTTP, RAM/disk và quyền file, không thay thế kiểm tra một trận thật hoặc kiểm tra tải.

## Mất mạng, mất điện

| Sự cố | Kết quả và thao tác |
|---|---|
| Máy sinh viên mất mạng | Soạn mã và lưu bài cục bộ; kiểm tra mã/đấu boss trên AWS cần mạng. Giữ hoặc mở lại ứng dụng để tự gửi khi kết nối lại. |
| Máy sinh viên mất điện | Bài đã lưu và nháp thường còn trong dữ liệu trình duyệt; phần vừa gõ chưa lưu có thể mất. Không thể cam kết nếu ổ đĩa hỏng hoặc dữ liệu trình duyệt bị xóa. Tải bản dự phòng định kỳ. |
| AWS khởi động lại | systemd tự mở API/worker; gateway phục hồi vòng loại đang chạy từ PostgreSQL. Theo dõi lại tiến độ. Nếu `PAUSED`, xem lỗi rồi bấm bắt đầu/tiếp tục sau khi sửa. |
| Worker chấm chết | Công việc chưa hoàn tất được thử lại; nhiều worker có thể nhận yêu cầu thay thế. Không xóa giải để xử lý lỗi. |
| Supabase mất kết nối | Chưa thể ghi nhận bài/kết quả mới; giữ hàng chờ trên thiết bị. Chờ database hồi phục, kiểm tra trạng thái giải rồi tiếp tục. |
| Máy chủ đổi IP | Cập nhật hostname HTTPS và API frontend theo `AWS_EC2.md`. Dùng cùng database và khóa phiên; kiểm tra trước khi chuyển người dùng. |

Không tin thời gian do máy sinh viên tự khai để xác nhận nộp offline đúng hạn. Nếu giám khảo cắt Internet, nên giữ mạng nội bộ tới hệ thống chấm hoặc mở lại kết nối trước hạn server. Phòng thi dùng UPS nếu cần giảm nguy cơ mất phần đang gõ.

## Chia tải và thay máy chấm

API phải tiếp tục là gateway ghi dữ liệu duy nhất trong cấu hình hiện tại. Không mở cổng worker ra Internet. Dùng private network/security group chỉ cho gateway truy cập worker; các worker không cần khóa Supabase hoặc khóa phiên.

Trong `/etc/arena/backend.env`, có thể khai báo:

```dotenv
WORKER_URLS=http://10.0.0.10:8001/mutate-tournament,http://10.0.0.11:8001/mutate-tournament
QUALIFIER_WORKERS=2
```

Đây là ví dụ: phải thay IP bằng máy chấm thực tế. `WORKER_URLS` ưu tiên hơn `WORKER_URL`; bỏ biến này sẽ tiếp tục dùng worker local. Các worker cần cùng phiên bản mã, Python/WASI SDK và cấu hình sandbox. Adapter chia lượt và chuyển sang worker khác khi lỗi kết nối hoặc quá tải, không thử lại lỗi yêu cầu HTTP 400. Số luồng vòng loại hiện hỗ trợ 1–8 **cho mỗi giải đang chạy**; chỉ tăng khi đủ tổng tài nguyên.

Thay worker: dựng worker mới, kiểm tra Python/C++ và trận mẫu trong môi trường riêng, thêm địa chỉ vào danh sách, rồi chuyển gateway trong thời gian không có hiệp đang chạy. Giữ nguyên Supabase và khóa phiên. Máy mới ít CPU/RAM hơn sẽ chấm chậm hơn: đổi máy không tự bảo toàn tốc độ. Các lượt chấm đang dở có thể phải tính lại từ đầu theo job đã lưu.

## Mục tiêu 4.000 sinh viên

Giới hạn đăng ký 4.000 đội đã có kiểm thử chức năng. Đây chưa phải kiểm thử 4.000 người truy cập đồng thời. Gateway hiện giới hạn hai yêu cầu kiểm tra/nộp đồng bộ; phần dư chờ ở thiết bị và thử lại. Không có cam kết kết quả chấm tức thì trên t3.micro 1 GB.

Để tổ chức thực tế ở quy mô này, bước tiếp theo là hàng đợi **nhận bài phía server**: ghi bài vào SQL và trả biên nhận HTTP 202, sau đó worker nhận job theo lease, giới hạn đồng thời và trả tiến độ theo đội. Hàng đợi này khác hàng đợi chấm trận vòng loại đang có. Cần đo thời gian trung bình/p95 của Python, C++ và trận, rồi tăng số máy chấm theo số việc/giây cần thiết; giữ tài nguyên cho các API đọc kết quả. Nhận bài nhanh không đồng nghĩa chấm xong ngay.

Đo tải trên hệ thống riêng với bộ bot đại diện, kiểm tra lúc dồn nộp bài, mất worker và khởi động lại. Chỉ công bố năng lực sau khi đo. Giới hạn số giải chạy đồng thời; không thử tải phá tải trên giải thật.

## Git và luật chơi

Git có thể dùng để phát hành SDK/mã mẫu và lưu mã theo phiên bản. Bản hiện tại chưa nhận bài bằng webhook Git. Nếu bổ sung, mỗi bài phải khóa commit SHA, xác thực chủ đội, lấy đúng file và đưa vào cùng hàng đợi/sandbox; không chạy workflow hoặc script build tùy ý của sinh viên trên gateway.

Giữ ba lựa chọn luật đang có (trộn quân, đảo tương khắc, sương mù) và thử phối hợp theo vòng. Ưu tiên đấu thử boss, lịch thi rõ ràng và phản hồi lỗi dễ hiểu trước khi thêm luật hoặc giao diện mới.

## Dữ liệu đang lưu

| Bảng | Khóa | Nội dung |
|---|---|---|
| `arena_accounts` | `student_id` | Tài khoản đội, tên đội, mật khẩu băm và metadata tài khoản. |
| `tournaments` | `id` | Metadata giải và JSONB đội, nhánh đấu, hiệp, luật, lịch, replay. |
| `arena_qualifier_records` | `key` | JSONB theo tiền tố `event:`, `participant:`, `submission:`, `job:`, `receipt:`. |

Quan hệ đội/giải/job hiện được kiểm tra ở tầng ứng dụng; dữ liệu JSONB chưa phải schema quan hệ có đầy đủ foreign key. Các batch công việc/kết quả/ELO được ghi nguyên tử theo triển khai repository. Khi nâng cấp kiến trúc nhận bài, cần tách bảng submissions/jobs/receipts có khóa ngoại, index `(status, available_at)` và ràng buộc idempotency rõ ràng. Không đổi schema giải đang chạy chỉ để vẽ ERD đẹp hơn.

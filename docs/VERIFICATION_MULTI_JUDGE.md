# Kiểm thử nhiều máy chấm — 21/10/2026

Đã chạy tại máy phát triển và Docker Linux. Không chạy tải vào AWS hoặc Supabase thật.

| Phạm vi | Kết quả |
|---|---|
| Toàn bộ Go `go test ./... -count=1 -timeout=12m` | Qua; gồm fixture vòng loại 4.000 đội, không phải 4.000 HTTP client thật |
| Pool 4 HTTP worker giả lập, 400 lời gọi đồng thời | Qua; không vượt một tác vụ/worker theo cấu hình test, đủ 400 kết quả và token đúng |
| Worker treo, quá tải, lỗi mạng, sai release | Qua; chuyển worker, không retry lỗi nghiệp vụ 400, không nhận kết quả sai release |
| Hàng đợi có 300 task | Qua; lấy FIFO có giới hạn, bỏ task DONE và retry chưa tới giờ, không lấy mã nguồn |
| PostgreSQL 17 tạm | Qua; rollback khi ghi task thất bại, phục hồi biên nhận, truy vấn hàng đợi có index và giữ code khi cập nhật metadata/ELO |
| Hai Python worker thật + gateway | Qua; 8 đội nộp đồng thời, mất một worker, hoàn thành 4 trận, đủ 8 lượt thi đấu và 4 trận thắng |
| Restart sau vòng loại | Qua; ELO/thắng/số trận giữ nguyên; gửi lại bài trả cùng biên nhận |
| Toàn bộ worker chết, gateway restart, worker sống lại | Qua; bài còn trong queue, đóng vòng chờ xử lý, sau đó khóa và gia hạn được |
| Nộp offline qua Chrome | Qua; chưa có mạng không ghi server, kết nối lại tự đồng bộ đúng một bài hợp lệ |
| Python/Linux unit | 39 kiểm thử qua, gồm luật và C++ WASI |
| Python/Linux security | 17 kiểm thử qua, gồm sandbox hệ điều hành và xác thực/giới hạn worker |
| Chrome toàn bộ luồng giải | Qua: đăng nhập, phân quyền, draft, nộp bài, live, replay, đấu tới vô địch và logout; không có lỗi JavaScript |
| Image worker production mới | Build và chạy qua với filesystem chỉ đọc, không capabilities, giới hạn RAM/PID; health, release, token, bot đúng/sai hoạt động |
| Node outbox + build frontend | Qua |

Smoke test hàng đợi với 3 đội: 3 HTTP 202, 3 kết quả VALID; p95 biên nhận khoảng 0,469 giây, p95 kết quả quan sát khoảng 3,484 giây với polling 3 giây. Mẫu này chỉ xác minh công cụ và luồng; không dùng để suy ra năng lực hàng nghìn thí sinh.

Trong khi kiểm thử đã sửa lỗi module database của worker tự tạo thư mục `/data`, khiến image chỉ đọc không khởi động. Worker hiện không tạo thư mục dữ liệu này; việc lưu trữ do gateway đảm nhiệm. CI có thêm bước chạy image chỉ đọc để phát hiện lỗi tương tự.

Các script có thể chạy lại:

```sh
cd backend
go test ./... -count=1 -timeout=12m
go build -o bin/arena-verification ./cmd/server
cd ..
python -m pip install -r tests/requirements.txt
python tests/e2e/test_multi_worker.py
python tests/e2e/test_submission_queue_recovery.py
python tests/e2e/test_offline_submission_sync.py
```

Trên Linux, đặt `ARENA_TEST_SERVER` thành đường dẫn tuyệt đối tới binary vừa build; trên Windows mặc định là `backend/bin/arena-verification.exe`. Test tự tạo dữ liệu tạm. PostgreSQL integration chỉ chạy khi đặt `ARENA_TEST_DATABASE_URL` tới database **dùng riêng cho kiểm thử**; nó có tạo trigger để giả lập lỗi ghi.

Trước giải thật vẫn cần triển khai cùng image lên các worker AWS, kiểm tra mạng riêng, backup ngoài máy, diễn tập khôi phục và đo tải bằng số tài khoản/bot dự kiến. Chưa xác nhận 4.000 người đồng thời hoặc thời gian trả kết quả trên hạ tầng hiện tại. Tham khảo [MULTI_JUDGE.md](MULTI_JUDGE.md).

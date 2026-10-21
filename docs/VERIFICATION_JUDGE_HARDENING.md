# Kiểm thử bản sửa luật và tối ưu worker — 21/10/2026

## Lỗi và thay đổi

- Engine trước đây tự bật special_tiles trên mọi luật, khiến trạng thái đưa cho bot khác trạng thái validation. Đã lấy luật và quân ban đầu từ cùng board_rules/initial_board; ô đặc biệt/Joker chỉ xuất hiện khi chọn luật tương ứng.
- Chọn bẫy đối xứng có thể chọn trùng một cặp theo hai hướng. Đã loại tọa độ đã chiếm; test 200 seed kiểm tra đủ 9 ô đặc biệt riêng biệt và sinh lại giống nhau.
- Worker nhỏ mặc định 1 tác vụ, RAM 700 MiB, CPU 1.5, tmpfs 128 MiB. Gateway mặc định 1 slot mỗi worker. Máy lớn có thể tăng sau đo tải.
- Giữ slot đến khi đọc hết phản hồi; chuyển máy khi phản hồi đứt hoặc JSON không hợp lệ. Giới hạn body 64 MiB, không retry lỗi mã nguồn HTTP 400.
- Response 401/429 có header phiên bản, tránh nhầm quá tải hoặc sai token thành sai release.
- CI smoke image chạy cùng giới hạn nhỏ; không bỏ kiểm thử luật để né lỗi.

## Kết quả đã chạy local

- `go test ./... -count=1 -timeout=10m`: đạt toàn bộ package, gồm phân phối tải/failover và qualifier.
- Linux container 700 MiB / 1.5 CPU: 48 unit test Python/C++ đạt, không skip.
- Linux container cùng giới hạn: 17 security test đạt.
- Image worker mới, filesystem chỉ đọc, bỏ capabilities: health, release, từ chối thiếu token, kiểm tra bot hợp lệ và sai cú pháp đều đạt.
- E2E hai worker thật bằng dữ liệu tạm: nhận bài đồng thời, mất một worker, hoàn tất 4 trận/8 đội; restart gateway giữ nguyên ELO và biên nhận, gửi lại không tạo bài trùng.

Các số trên không phải benchmark AWS hoặc bằng chứng phục vụ 4.000 người tức thì. Cấu hình triển khai phải được cập nhật trên gateway và tất cả worker cùng phiên bản. Chuyển phiên bản engine ngoài giờ thi; lưu replay cũ, không tự chấm lại trận đã kết thúc.

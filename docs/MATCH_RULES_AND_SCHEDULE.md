# Luật bàn cờ và lịch vòng đấu

## Luật mới

- Bo5: tối đa 5 hiệp, thắng 3 hiệp kết thúc ngay.
- Hai đội đi lần lượt; mỗi bot nhận bàn cờ sau nước đi của đối thủ. Replay và nhật ký ghi riêng từng nước.
- Hiệp lẻ đội Đỏ đi trước, hiệp chẵn đội Xanh đi trước. Tối đa 32 nước (16 mỗi bên).
- Búa thắng Kéo, Kéo thắng Bao, Bao thắng Búa; luật đảo chiều được áp dụng nhất quán khi giải chọn chế độ đó. Quân cùng loại va chạm thì quân phòng thủ thắng.
- Mỗi hiệp có một đội thắng: chiếm căn cứ hoặc quét sạch quân đối thủ; hết lượt xét quân số rồi tổng tiến độ tới căn cứ. Nếu vẫn bằng nhau, bốc thăm dùng mã ngẫu nhiên riêng của hiệp, lưu trong bản ghi kết quả. Không dùng cố định ưu thế đội Đỏ.
- Bot lỗi/quá thời gian bị xử thua hiệp; lỗi và trạng thái FAILED được ghi trong nhật ký thực thi.
- Việc nộp lại code từng hiệp, Admin bắt đầu hiệp và tự chuyển đội thắng vào nhánh tiếp theo tiếp tục hoạt động.

Engine được tách vào `bot-runner/app/engine/board.py`; hàm gọi cũ trên Database giữ tương thích. Bot vẫn trả về ROCK/PAPER/SCISSORS. Game state thêm `ply_number`, `active_side`, `my_pieces`, `opponent_pieces`, `target`, `reverse_rule`. Chế độ sương mù ẩn loại quân đối thủ và nước đi đối thủ trong history.

Khi khởi động, gateway chuyển các trận chưa hoàn tất từ Bo6 sang Bo5 qua worker. Trận đã có đủ 3 hiệp thắng hoặc đã chơi 5 hiệp được kết thúc và chuyển đội thắng; lịch sử đã lưu được giữ lại. Trận đã hoàn tất không bị sửa kết quả. Với lịch sử cũ chứa hiệp hòa, phân định tổng điểm bằng số hiệp thắng, HP rồi mã phân định lưu sẵn nếu vẫn bằng nhau.

## Đặt lịch

Admin vào **Bảng đấu → Đặt thời gian các vòng**, cạnh nút Tạo giải đấu. Đặt giờ mở/đóng từng vòng; khoảng trống giữa hai vòng là thời gian nghỉ. Các trường dùng giờ thiết bị; máy chủ lưu Unix timestamp UTC.

Để trống cả hai ô của một vòng để không giới hạn giờ vòng đó. Đội vẫn phải chờ toàn bộ vòng trước hoàn tất. Không chấp nhận khoảng thời gian ngược, chồng nhau hoặc vòng không tồn tại.

Trước giờ mở và từ giờ đóng trở đi, backend chặn bắt đầu hiệp mới cho mọi Admin. Hiệp đang chạy tiếp tục hoàn tất. Vòng đã thi đấu giữ giờ mở và chỉ có thể gia hạn giờ đóng; không xóa lịch đã áp dụng. Giải đã kết thúc không cho sửa lịch.

`PUT /api/tournaments/:id/stage-schedule` dành cho Admin, nhận `{"windows":[{"level":1,"starts_at":...,"ends_at":...}]}`. Lịch lưu trong `stage_schedule` của giải qua kho JSON/PostgreSQL hiện tại, cập nhật qua WebSocket và hiển thị công khai trên Bảng đấu. F5 và restart không mất lịch. Lịch của mỗi giải độc lập.

## Kiểm thử local

- `go test ./...` trong backend: lưu lịch, thời điểm mở/đóng, chồng lịch, vòng trước chưa hoàn tất.
- `python -X utf8 -m unittest discover -s tests/unit -p test_board_turns.py`: mỗi nước một hành động, state mới, lượt đi đầu, sương mù/đảo chiều, lỗi bot, Bo5 3–0/3–2 và chuyển dữ liệu cũ.
- `tests/e2e/test_stage_rules.py`: Chrome, gateway và worker thật với dữ liệu tạm; đặt lịch qua UI, F5/restart, quyền Admin, chặn đầu giờ, gia hạn và nước đi thực tế.
- `tests/e2e/test_reliability.py`: toàn bộ luồng giải đấu, realtime, replay, đăng nhập, chuyển hiệp và vô địch.

Các kiểm tra trên sử dụng kho JSON local. Không sửa dữ liệu của bản web đang triển khai.

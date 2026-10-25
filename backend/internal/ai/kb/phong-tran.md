<!-- title: Phòng trận: chat, webcam, replay; link: view/match; nguon: backend websocket chat_hub.go, rtc_hub.go, snapshot_handler.go -->

## Vào phòng trận
Để nộp bot, chat và bật webcam trong trận, đội phải vào phòng trận của mình bằng nút Trận của đội tôi hoặc chọn trận trong tab Trận đấu. Đội chỉ vào được phòng của trận mình đang tham gia.

## Chat trong trận
Tab Trò chuyện của trận là một phòng chung cho hai đội của trận và ban tổ chức. Tin nhắn tối đa 500 ký tự, có giới hạn gửi dồn dập. Lịch sử chat được lưu và còn nguyên sau khi tải lại trang. Ban tổ chức có thể khóa chat của các đội (ban tổ chức vẫn nhắn được) hoặc xóa lịch sử chat của trận.

## Webcam trong trận
Camera chỉ được gửi sau khi bạn bấm Bật camera và đồng ý quyền của trình duyệt; micro luôn tắt cho tới khi bạn bật. Ban tổ chức xem được camera của cả hai đội. Hai đội chỉ xem được camera của nhau khi ban tổ chức bật Cho phép hai đội xem nhau. Video đi trực tiếp giữa các trình duyệt, máy chủ không lưu video. Cần HTTPS hoặc localhost; một số mạng chặn kết nối trực tiếp nên hình có thể không hiện.

## Ảnh camera lưu cho replay
Trong lúc đấu, mỗi đội có camera bật gửi một ảnh nhỏ khoảng 10 giây một lần. Ảnh nằm trên máy chủ, chỉ ban tổ chức và hai đội của trận xem được, dùng để xem lại trong replay.

## Replay
Dùng tab Lịch sử và Replay để xem lại từng hiệp từng bước. Replay che thông tin đối thủ theo luật sương mù. Mã nguồn riêng chỉ đội sở hữu và ban tổ chức xem được.

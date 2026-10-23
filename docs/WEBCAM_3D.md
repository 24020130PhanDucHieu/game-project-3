# Webcam phòng đấu, bàn cờ 3D và trình soạn code

## Webcam (WebRTC)
- Vào tab **Trận đấu → Diễn biến**. Đội phải "Vào phòng trận" của mình; Admin vào được mọi trận.
- Camera chỉ được gửi sau khi bấm **Bật camera** và đồng ý quyền trình duyệt. Micro luôn tắt cho tới khi bật.
- Quyền xem: Admin xem cả hai đội; đội xem Admin (khi Admin bật camera); hai đội chỉ xem nhau khi Admin tick **Cho phép hai đội xem nhau**.
- Kỹ thuật: máy chủ Go chỉ chuyển tiếp tín hiệu qua `GET /ws/rtc/:tournamentId/:matchId?token=…` (`backend/internal/handler/websocket/rtc_hub.go`). Video đi thẳng giữa các trình duyệt (P2P), không qua máy chủ và không được lưu.
- Yêu cầu: HTTPS (hoặc `localhost`). Mặc định dùng STUN công cộng; mạng chặn nghiêm cần TURN — đặt biến `NEXT_PUBLIC_ICE_SERVERS` lúc build, ví dụ:
  `[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn.example.com:3478","username":"u","credential":"p"}]`
- Giới hạn: tối đa 12 kết nối/phòng; 200 tín hiệu/giây/kết nối. Tắt "cho phép xem nhau" sẽ đóng kết nối phía trình duyệt của hai đội; máy chủ không thể cưỡng chế kết nối P2P đã mở từ trình duyệt đã bị sửa đổi.

## Bàn cờ
- Nút **2D / 3D 🎬**, 6 giao diện (Neon Cyber, Gỗ cổ điển, Đại dương, Rừng xanh, Núi lửa, Cẩm thạch; lưu trên thiết bị), tốc độ 0.5×–4×.
- 3D (three.js): camera **Điện ảnh** (tự chạy, zoom vào va chạm), **Tự do** (kéo để xoay, cuộn để zoom), **Trên xuống**; chất lượng cao/tiết kiệm; nút chụp ảnh. Không có WebGL sẽ tự quay về 2D.

## Trình soạn code
- CodeMirror 6: tô màu Python/C++, số dòng, tự thụt lề, bắt cặp ngoặc; nháp tự lưu trên thiết bị; giới hạn 64 KB.

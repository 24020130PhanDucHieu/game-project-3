# BÁO CÁO KIỂM KÊ HIỆN TRẠNG (BASELINE AUDIT)

Dự án `project-tuan3` hiện đang là hệ thống thi đấu bot cho game Oẳn Tù Tì V2. Dưới đây là phân tích chi tiết về kiến trúc, chức năng và các rủi ro trước khi tiến hành quá trình migration.

## 1. Kiến trúc và cây thư mục hiện tại
- Hệ thống backend đang có sự trùng lặp giữa thư mục `app/` và `backend/app/`. 
  - File `app/main.py` chỉ đóng vai trò làm wrapper chuyển hướng khởi chạy tới `backend.app.main:app`.
  - Cả hai thư mục đều chứa code của `engine` (Game Rules & Match FSM), `matchmaker`, `sandbox` (Bot Runner) và `database.py`. 
- Frontend được đặt trong thư mục `frontend/`, với file `index.html` nguyên khối lớn (~1000 dòng). JavaScript đã được module hóa cơ bản trong `frontend/js/`.
- Database đang sử dụng cấu trúc in-memory, lưu trạng thái xuống file `data/tournaments_store.json` thông qua background thread.

## 2. Chức năng đã xác minh
Các luồng kiểm thử (`test_full_system.py`) đều pass với các tính năng sau:
- Quản lý giải đấu (Tạo giải, quy mô đội).
- Quản lý đội thi đấu (Thêm đội, điền đội mẫu, xác thực).
- Auto Schedule (Tự sắp xếp lịch đấu nhánh).
- Nộp draft code cho trận đấu & Authentication.
- Battle Simulation & cập nhật tỉ số các round.
- Practice Simulation Mode (Đấu luyện bot).

## 3. Game engine và giao thức bot
- **Game Engine**: 
  - Cài đặt trong `rules.py` (Class `GameRulesEngine`) và `fsm_match.py` (Class `MatchFSM`).
  - Luật chơi: 15 vòng tối đa, 100 HP, kho thẻ. Có các luật đột biến ở vòng 2, 3, 4 (Ví dụ: Fog of war, đảo luật Kéo thắng Búa, x2 sát thương). 
- **Giao thức Bot (Input/Output)**:
  - Tham số truyền vào cho Bot là một từ điển `game_state` (chứa `turn_number`, `max_turns`, `my_hp`, `remaining_cards`, `history`, `opponents`, `rules_config`).
  - Output bot cần trả về kiểu string: `"ROCK"`, `"PAPER"` hoặc `"SCISSORS"`. Nếu sai định dạng sẽ bị thay thế bằng lựa chọn fallback.

## 4. Cấu trúc Database hiện tại
- File `app/database.py` (và `backend/app/repository/database.py`) sử dụng lớp `Database` để quản lý các state dưới dạng dictionary: `users`, `bots`, `bot_versions`, `matches`, `solo_rooms`, `tournaments`.
- Đảm bảo thread-safe thông qua `threading.RLock()` và dùng `AtomicFileStorage` ghi xuống đĩa theo kỹ thuật debounce.

## 5. API và WebSocket
- Backend hiện được xây dựng bằng FastAPI, sử dụng các router tại `backend/app/api/`. 
- Cung cấp HTTP 304 Not Modified thông qua ETag (được xử lý ở Client `api/client.js`).

## 6. Lỗi có sẵn và rủi ro (Rất quan trọng)
- **Rủi ro An toàn Sandbox**: `BotRunner` (tại `sandbox/runner.py`) thực thi code Python của sinh viên trực tiếp bằng hàm `exec()` trong cùng process (chỉ filter globals). Điều này không an toàn nếu có mã độc tinh vi. 
- **Khả năng mở rộng (Scalability)**: Database In-memory gắn liền với instance backend duy nhất. Không thể chạy đa process (workers > 1 sẽ lỗi đồng bộ dữ liệu trừ khi sticky sessions hoặc chuyển database ra ngoài).

## 7. Các phần có thể giữ nguyên và phần cần refactor
- **Giữ nguyên**: 
  - Giao thức nhận/trả kết quả từ bot.
  - Luật chơi, cơ chế logic của Game Rules (chỉ chuyển đổi ngôn ngữ hoặc bọc thành service riêng).
  - Giao diện UI/UX của Frontend.
- **Cần refactor / Migration**:
  - Giao diện frontend HTML/CSS cần được chia thành từng phần (components) nhỏ.
  - Xóa bỏ thư mục thừa (`app/` cũ) chỉ giữ một đường dẫn chính thức cho backend.
  - **Sandbox**: Phải được thiết kế lại, đưa vào kiến trúc isolate chuẩn mực (Docker/gVisor hoặc chạy subprocess đối với Python).
  - **Database**: Cân nhắc chuyển đổi từ file JSON sang PostgreSQL nếu cần.

## 8. Bộ Test hồi quy cần xây dựng
Trước khi thực hiện migration, cần có bộ kiểm thử cho:
- Đầu vào/đầu ra của một trận đấu FSM.
- Giao thức xử lý lỗi mã bot, vòng lặp thời gian.
- HTTP Responses nguyên vẹn (status codes, cấu trúc JSON).

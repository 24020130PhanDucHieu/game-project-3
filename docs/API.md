# TÀI LIỆU ĐẶC TẢ GIAO DIỆN LẬP TRÌNH ỨNG DỤNG (API & WEBSOCKET SPECIFICATION)

Hệ thống cung cấp kiến trúc RESTful API hiệu năng cao kết hợp với WebSocket realtime cho sàn đấu trực tuyến.

---

## 1. TIÊU CHUẨN GIAO TIẾP & BỘ NHỚ ĐỆM (HTTP HEADERS)
- **Content-Type:** `application/json`
- **ETag Support:** Mọi endpoint đọc dữ liệu (`GET /api/tournaments`, `GET /api/tournaments/{id}`) đều trả về header `ETag: "hash"`.
- **HTTP 304 Not Modified:** Client gửi header `If-None-Match: "hash"`, máy chủ sẽ phản hồi HTTP 304 (0 byte body) nếu dữ liệu không thay đổi.
- **Rate Limiting:** Header phản hồi `Retry-After: <seconds>` khi vượt quá 600 req/min (HTTP 429).

---

## 2. NHÓM API QUẢN LÝ GIẢI ĐẤU (TOURNAMENT MANAGEMENT)

### `GET /api/tournaments`
Lấy danh sách tóm tắt tất cả các giải đấu hiện có.
- **Response (200 OK):**
```json
[
  {
    "tournament_id": "tourn_591c3a",
    "name": "Giải Đấu Tân Sinh Viên ICPC K69 - Vô Địch OTTV2",
    "num_teams": 8,
    "champion": null,
    "status": "RUNNING",
    "created_at": 1728556000.0
  }
]
```

### `POST /api/tournaments`
Tạo một giải đấu mới với số đội là lũy thừa của 2 (4, 8, 16, 32...).
- **Request Body:**
```json
{
  "name": "Giải Đấu Giao Lưu K69",
  "num_teams": 8
}
```
- **Response (200 OK):** Đối tượng giải đấu chi tiết kèm cấu trúc các trận nhánh đấu ban đầu.

### `GET /api/tournaments/{tournament_id}`
Lấy toàn bộ chi tiết giải đấu, danh sách đội và cây thi đấu (Brackets).
- **Status code:** `200 OK` hoặc `304 Not Modified` hoặc `404 Not Found`.

### `POST /api/tournaments/{tournament_id}/teams`
Thêm đội thi đấu vào giải trước khi xếp lịch.
- **Request Body:**
```json
{
  "team_name": "K69_AlphaBot",
  "student_id": "24020001",
  "university": "ĐHQG Hà Nội"
}
```

### `POST /api/tournaments/{tournament_id}/teams/quick-fill`
Tự động nạp đủ số đội mẫu từ kho thí sinh K69.

### `POST /api/tournaments/{tournament_id}/schedule`
Tự động ghép cặp và phân nhánh đấu cho Vòng 1. Chuyển trạng thái giải đấu sang `RUNNING`.

---

## 3. NHÓM API VẬN HÀNH TRẬN ĐẤU (MATCH OPERATIONS)

### `POST /api/tournaments/{tournament_id}/matches/{match_id}/login`
Đăng nhập vào phòng thi đấu (phân quyền Admin hoặc Đội Đỏ / Đội Xanh).
- **Request Body:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```
- **Response (200 OK):**
```json
{
  "status": "SUCCESS",
  "role": "ADMIN",
  "message": "Đăng nhập Ban Tổ Chức (Admin) thành công!",
  "match": { ... }
}
```

### `POST /api/tournaments/{tournament_id}/matches/{match_id}/code`
Nộp mã nguồn Bot chính thức cho Round đấu hiện tại (Kaggle-style locked submission).
- **Request Body:**
```json
{
  "side": "team_a",
  "code_content": "def decide_move(game_state):\n    return 'ROCK'",
  "language": "PYTHON"
}
```
- **Response (200 OK):**
```json
{
  "status": "SUCCESS",
  "sub_id": "sub_57070c9c",
  "valid": true,
  "locked": true,
  "message": "Bài nộp hợp lệ và đã được khóa cho Round 1!"
}
```

### `POST /api/tournaments/{tournament_id}/matches/{match_id}/play-round`
Ban Tổ Chức khai hỏa chạy Round thi đấu chính thức.
- **Response (200 OK):**
```json
{
  "status": "SUCCESS",
  "is_completed": false,
  "winner": "team_b",
  "winner_name": "BK_Gladiator",
  "win_reason": "Đột kích thành công vào Căn Cứ Đích [0, 8] của đối phương!",
  "round_record": {
    "round_number": 1,
    "board_steps": [ ... ],
    "move_logs": [ ... ]
  }
}
```

### `POST /api/tournaments/{tournament_id}/matches/{match_id}/next-round`
Chuyển trạng thái sang Round tiếp theo sau thời gian nghỉ (Intermission).

### `GET /api/tournaments/{tournament_id}/matches/{match_id}/replay/{round_idx}`
Lấy dữ liệu phát lại chi tiết từng bước đi của bàn cờ 9x9.
- **Response (200 OK):**
```json
{
  "round_number": 1,
  "winner": "team_b",
  "winner_name": "BK_Gladiator",
  "win_reason": "Đột kích thành công...",
  "board_steps": [
    {
      "step_idx": 0,
      "turn_label": "Bắt đầu hiệp đấu",
      "red_pieces": [ ... ],
      "blue_pieces": [ ... ],
      "clash_event": null,
      "log": "Khởi tạo bàn cờ 9x9..."
    }
  ]
}
```

---

## 4. GIAO DIỆN REALTIME WEBSOCKET

### Endpoint: `ws://<host>:<port>/ws/arena/{match_id}`

Khi client kết nối vào phòng trận đấu:
1. Máy chủ gửi thông điệp mở đầu:
   ```json
   {
     "type": "MATCH_INTRO",
     "match_id": "m_lvl1_1",
     "stage": "STAGE_1_STANDARD",
     "bot_names": ["K69_AlphaBot", "BK_Gladiator"]
   }
   ```
2. Trong quá trình thi đấu, máy chủ stream dữ liệu theo từng hiệp:
   ```json
   {
     "type": "ROUND_PLAY",
     "round_data": { ... }
   }
   ```
3. Khi hoàn tất toàn bộ ván đấu:
   ```json
   {
     "type": "MATCH_RESULT",
     "winner_id": "bot_24020160",
     "winner_name": "BK_Gladiator",
     "final_scores": { ... }
   }
   ```
4. Client có thể gửi `"ping"`, máy chủ phản hồi `"pong"` để duy trì kết nối (Heartbeat).
# Sửa lại luật đã công bố

`PUT /api/tournaments/:id/stage-rules` cho phép Admin gửi thêm `"correction": true` để sửa nhầm luật đã công bố **chỉ khi vòng chưa có trận bắt đầu**. Backend vẫn từ chối nếu vòng đã có lịch sử, đang chạy hoặc đã hoàn tất. Thay đổi cấu hình làm mất trạng thái sẵn sàng của bài nộp cũ; giữ bản nháp và lịch sử. Lưu bình thường không có cờ này vẫn giữ khóa công bố.

```json
{"correction":true,"rules":[{"level":1,"rule_id":"COMBO_5","publish_at":0}]}
```

## Chạy thử Boss độc lập

`POST /api/bots/practice` yêu cầu phiên đăng nhập đội hoặc Admin. Không cần giải chính hay trận đấu. Endpoint cũ `/api/tournaments/:id/practice-match` vẫn hoạt động với phiên hợp lệ.

```json
{"code_content":"def decide_move(s): return 'ROCK'","language":"PYTHON","side":"team_a","boss":"RANDOM"}
```

- Ngôn ngữ: `PYTHON` hoặc `CPP`; Boss: `RANDOM`, `AGGRESSIVE`, `ADAPTIVE`.
- Mã nguồn phải có nội dung, tối đa 64 KB. Kết quả có `board_steps`, `winner`, `win_reason`, `simulation`.
- Không ghi vào giải, bài nộp, lịch sử thi đấu hay ELO. Phòng chạy thử của đội dùng phía Đỏ (`team_a`).
- `/api/ranking` chỉ cộng/trừ kết quả trận Bo5 đã `COMPLETED`; hiệp riêng lẻ không tính là trận thua.

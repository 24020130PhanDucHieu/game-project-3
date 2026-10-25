# Giải AI

Giải AI là một giải đấu riêng (tab **Giải AI**) có cùng cơ chế vòng loại → giải chính như giải thường, nhưng thi bằng mô hình học máy.
Tài khoản đội dùng chung; xếp hạng, ELO, huy hiệu và giấy chứng nhận của Giải AI tách riêng khỏi giải thường.

Tài liệu này mô tả **vòng loại AI** và **giải chính AI** (Bo5 + báo cáo kỹ thuật). Học viện AI (bài học nối với đề) là đợt sau.

## Hợp đồng bot

Vẫn là `decide_move(game_state)` trả `ROCK`, `PAPER` hoặc `SCISSORS`, nên mô hình huấn luyện cho vòng loại dùng được nguyên ở giải chính và giải thường.
Mô hình chỉ cần đọc `game_state["history"]`, mỗi phần tử có `my_move` và `opponent_move` (giống hệt `history` của trận bàn cờ).
Mỗi lần gọi bot chạy trong phạm vi mới, không nhớ biến cũ: mọi thứ suy ra từ `history`; trọng số huấn luyện nhúng trong mã (tối đa 64 KB, chỉ Python thuần, 9 thư viện được phép).

## Cách chấm

Mỗi lượt máy chủ chấm mọi mô hình đã khóa trên một bộ đề sinh từ hạt giống bí mật của lượt đó (`Event.Seed` + số lượt).

| Phần | Nội dung | Trọng số |
|------|----------|----------|
| A. Đọc đối thủ | Mỗi nhóm đối thủ 2 trận × 150 lượt oẳn tù tì; điểm = (thắng + 0,5 hòa) / số lượt | 60% |
| B. Bàn cờ 9×9 | 9 trận với ba boss (ngẫu nhiên, tấn công, thích ứng), đổi bên | 40% |

- **Bảng công khai:** chỉ phần A trên 4 nhóm công khai (`bias`, `cycle`, `markov1`, `beat_last`) với hạt giống công khai `PublicSeed(eventID)`. Dựng lại được trên máy.
- **Bảng riêng tư (chính thức):** `0,6 × A(bộ ẩn) + 0,4 × B`, trung bình các lượt. Bộ ẩn gồm 4 nhóm công khai với tham số mới mỗi lượt và 5 nhóm chưa công bố (`markov2`, `noisy_cycle`, `switcher`, `adaptive_freq`, `wsls`). Chỉ mở cho đội khi vòng loại kết thúc; ban tổ chức xem được bất cứ lúc nào.
- Cột **Chênh lệch** = điểm công khai − điểm đọc đối thủ ở bộ ẩn: lớn nghĩa là quá khớp (overfit) bộ công khai.
- Hòa điểm: xét điểm đọc đối thủ, rồi thời điểm nộp, rồi băm theo hạt giống sự kiện.
- Đoán ngẫu nhiên ≈ 50 điểm ở phần A.

Mô hình lỗi hoặc ra nước sai chỉ thua trận đó (0 điểm cho trận), các trận khác vẫn được chấm. Mô hình không chạy được ngay từ đầu (vd. import bị cấm) nhận 0 điểm cả lượt và lý do hiện cho đội. Chạy quá 1 s mỗi nước hoặc quá 75 s cả bộ đề thì bị cắt.

## Kiến trúc

- `bot-runner/app/aicup/`: `opponents.py` (nhóm công khai, có trong gói offline), `hidden.py` (nhóm ẩn, **chỉ trên máy chấm**), `suite.py` (chấm một bot; `run_suite` cho máy chủ, `run_public_check` cho trình duyệt, `build_dataset`).
- Worker nhận hai action mới: `ai-suite` (chấm một mô hình một lượt) và `ai-dataset` (dữ liệu huấn luyện công khai).
- `backend/internal/qualifier`: `Event.Kind = "AI"` dùng lại toàn bộ vòng đời vòng loại (đăng ký, nộp, khóa, chạy, tạm dừng, ban, chốt đội). Chỉ khâu chấm khác: `runAI` thay `pair/play` bằng "mỗi lượt một việc cho mỗi mô hình" (`Job.AI`), điểm cộng dồn vào `Participant.AI*` trong cùng một giao dịch với `AppliedRound` nên khởi động lại giữa chừng không cộng đôi.
- `backend/internal/handler/http/ai_cup_handler.go`: route `/api/ai-cup/...`. Danh sách `/api/qualifiers` không trả vòng loại AI.
- Frontend: `components/arena/live/views/ai-cup/`; quản trị dùng lại `QualifierAdminTab` với `ai`.

### Chấm thử trên máy

Nút "Chấm thử trên bộ công khai (trên máy)" chạy `run_public_check` trong Pyodide (Web Worker, cùng gói offline với "Kiểm tra mã"). Gói chỉ có `opponents.py` và `suite.py`; các nhóm đối thủ ẩn không bao giờ được gửi xuống trình duyệt (`frontend/scripts/sync-offline-engine.mjs` chỉ sao chép hai tệp đó).

## API

| Route | Quyền | Nội dung |
|-------|-------|----------|
| `GET /api/ai-cup/events` | công khai | Danh sách vòng loại AI |
| `GET /api/ai-cup/:qid/problem` | công khai | Tham số đề bài, hạt giống công khai, nhóm công khai, giới hạn |
| `GET /api/ai-cup/:qid/dataset` | công khai | Dữ liệu huấn luyện (JSON, tải về) |
| `GET /api/ai-cup/:qid/leaderboard?board=public\|private` | công khai; riêng tư cần kết thúc hoặc quản trị | Bảng điểm |
| `GET /api/ai-cup/:qid/mine` | đội (BTC thêm `student_id`) | Kết quả từng lượt; phần riêng tư chỉ sau khi kết thúc |
| `PUT /api/ai-cup/:qid/model-card` | đội | Khai báo kỹ thuật + thẻ mô hình (trước khi chấm) |

Tạo/khóa/chạy/chốt đội dùng chung `POST /api/qualifiers` (thêm `"kind": "AI"`) và `/api/qualifiers/:qid/...`.

## Giải chính AI

- Tạo giải bằng `POST /api/tournaments/create` kèm `"track": "AI"` (tab Quản trị → Giải AI có sẵn nút). Giải lưu `track = "AI"`; danh sách giải trả `track`, thanh chọn giải chia hai nhóm.
- Chỉ nhận đội bằng "Chốt đội" từ vòng loại AI: `add-team` và `quick-fill` bị từ chối ở giải AI. Phần còn lại (xếp lịch, Bo5, replay, chat, camera, sửa kết quả) dùng nguyên engine giải thường.
- **ELO tách riêng:** `GET /api/ranking?track=ai` và `/api/ranking/elo-history?track=ai` chỉ tính các giải AI; mặc định chỉ tính giải thường. Mỗi đường đua bắt đầu lại từ 1200.
- **Báo cáo kỹ thuật** (`/api/ai-main/:tid/...`): đội trong giải nộp 200–6000 ký tự + liên kết kho mã trước hạn; giám khảo hoặc chủ BTC chấm 5 tiêu chí (ý tưởng, dữ liệu và huấn luyện, đánh giá trung thực, giải thích được, tái lập được) × 0–10. Điểm kỹ thuật = trung bình điểm tổng (/50) của các giám khảo; hòa thì đội nộp sớm hơn đứng trước. Điểm và nhận xét ẩn với đội cho tới khi BTC công bố; sau công bố khóa báo cáo và điểm (hủy công bố mới sửa được). Nhận xét gửi cho đội không kèm tên giám khảo.
- **Giải Kỹ thuật:** đội điểm cao nhất sau công bố nhận giấy chứng nhận "Giải Kỹ thuật" (cùng kho giấy chứng nhận, thông báo riêng, không trùng với giấy Quán quân/Á quân của cùng đội).
- **Huy hiệu** (`GET /api/ai-badges/:sid`): tính từ kết quả thật, gồm hoàn thành vòng loại, đọc được đối thủ (≥ 70), mô hình khái quát (chênh lệch ≤ 3 và ≥ 60), vào giải chính, vô địch, á quân, đồng hạng ba, Giải Kỹ thuật.
- Điểm kỹ thuật **không** dùng để xếp hạt giống vòng loại (báo cáo nộp sau khi đã chốt đội).

## Kiểm thử

- `python tests/unit/test_aicup.py`: đối thủ tái lập theo hạt giống, bot ngẫu nhiên ≈ 50, bot học được thắng rõ rệt, bot lỗi/chậm không làm hỏng bộ đề, gói offline không có nhóm ẩn.
- `go test ./internal/qualifier -run AI`: cộng dồn điểm không đôi, khóa bảng riêng tư, bot hỏng, worker lỗi giữa chừng rồi tiếp tục, ban, thẻ mô hình.
- Playwright toàn luồng: tạo vòng loại AI, 5 đội thật + 4 bot thử, chấm 2 lượt trên máy chấm thật, bảng công khai/riêng tư, chốt top 8, giao diện đội/quản trị, điện thoại 390 px.

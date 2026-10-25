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

## Kho đề học từ thế cờ (vòng loại `mode = TASKS`)

Thay cho đề oẳn tù tì cố định, vòng loại AI có thể bốc đề ngẫu nhiên từ **kho đề**. Mỗi đề là một bài học máy về bàn cờ 9×9; dữ liệu sinh từ chính engine (`simulate_board(..., policies=, trace=)` chạy chính sách ngay trong tiến trình, khoảng 1,5 ms một ván), nhãn là kết quả ván thật.

- **Mẫu đề:** `winner` (đoán bên thắng), `nextcard` (đoán lá bài bên đi sẽ ra), `plies_left`, `material` (hồi quy), `capture_next` (lượt này có ăn quân không). Thông số: luật bàn cờ, hỗn hợp chính sách, số mẫu, độ nhiễu, chân trời, thời gian.
- **Kho:** 12 đề dựng sẵn trong `bot-runner/app/aitasks/catalog.py`; admin thêm đề qua `POST /api/ai-bank` (chỉ thông số, không mã, mọi giá trị bị chặn trần; khóa `aibank:<id>`), bật/tắt đề dựng sẵn, nhân bản, xóa đề của mình, và **Thử đề** (`POST /api/ai-bank/probe`) đo thời gian sinh, kích thước, điểm mức ngây thơ và điểm mô hình tham chiếu (cảnh báo nếu tham chiếu không hơn ngây thơ ≥ 10 điểm).
- **Bốc và khóa đề:** `POST /api/ai-cup/:qid/tasks/roll` (cả bộ hoặc `{index}` một đề, lọc theo thẻ/độ khó), `/lock`, `/unlock`. Kế hoạch (kèm hạt giống) ở khóa `aitasks:<eventID>` chỉ quản trị đọc; đội chỉ thấy đề công khai sau khi khóa. Chưa khóa thì **không nhận bài, không khóa bài, không chạy**; chỉ mở khóa lại được khi chưa đội nào nộp.
- **Nộp bài:** một tệp có hàm `solve(task)` dùng chung cho mọi đề (nhận `task["train"]` có nhãn và `task["test"]["X"]`, trả danh sách dự đoán). Hợp lệ khi chạy được trên một đề mini của **từng dạng** có trong bộ đề.
- **Chấm:** mỗi lượt một lời gọi `solve` cho mỗi đề với đầu vào kiểm tra = công khai + riêng tư trộn lẫn; điểm công khai trên tập cố định, điểm riêng tư trên thế cờ mới mỗi lượt. Nhãn kiểm tra sinh từ `HMAC(AI_TASK_SECRET hoặc WORKER_TOKEN, ...)` nên không lưu hạt giống thử nghiệm ở đâu. Điểm từng đề lưu theo khóa `t1..tn` trong `Job.AI.FamiliesPublic/Private`.
- **Sandbox `solve`:** `app/sandbox/task_process.py`; một tiến trình dùng lại cho mọi đề, quá giờ thì dựng lại; kết quả ≤ 512 KB, bộ nhớ 256 MB; thêm module **`nnlite`** và các hàm dựng sẵn `round`, `pow`, `divmod`, `ord`, `chr`, `repr` cùng vài lớp lỗi; vẫn cấm `class` và tên bắt đầu bằng `_`.
- **`nnlite`:** mạng nơ-ron Python thuần với lan truyền xuôi/ngược, SGD/Adam, `fit`, `export_weights`/`load_weights` (đạo hàm khớp đạo hàm số, ≈ 0,03 s mỗi epoch cho 400 mẫu 40 chiều).
- **Chấm thử trên máy:** trình duyệt tải dữ liệu đề, chia 80/20 rồi chạy `solve` trong Pyodide (gói offline có `metrics.py`, `nnlite.py`, `taskcheck.py`; không có bộ sinh thế cờ).
- **Mã mẫu:** `reference.py` (MLP bằng nnlite, hồi quy softmax tự viết xuôi/ngược, tối giản); `scripts/gen_task_templates.py` sinh `task-templates.ts` và test kiểm tra hai bản khớp nhau.
- **Cần biết:** triển khai thật nên đặt `AI_TASK_SECRET` trên mọi máy chấm (mặc định dùng `WORKER_TOKEN`, nên các máy chấm phải dùng cùng một giá trị).

## Giải chính hiệp đề ML (`round_mode = TASK`)

Tạo giải chính AI với `{"track": "AI", "mode": "TASK"}` (Quản trị → Giải AI → "Dạng hiệp đấu: Đề ML bốc từ kho"). Mỗi hiệp của Bo5 là **một đề từ kho** thay cho ván bàn cờ; hai đội cùng nộp `solve(task)`, máy chấm trên thế cờ ẩn, **điểm riêng tư cao hơn thắng hiệp**; phần còn lại (cây đấu, Bo5, ELO, chat, camera, chứng nhận, sửa kết quả) dùng nguyên engine.

- **Kế hoạch đề:** `tournament.ai_task_plan = {locked, levels: {"1": [{item, public} × 5], ...}}`. `POST /api/ai-main/:tid/tasks/roll` bốc cả giải (các vòng sau khó hơn) hoặc bốc lại `{level, index}`; `/lock`, `/unlock` (chỉ mở lại được khi chưa có hiệp nào được chấm). **Chưa khóa thì chặn `submit-code`, `submit-draft`, `play-round`, `demo-fill`** (guard trong `MutateTournament`).
- **Ẩn đề:** `redactTournament` xóa `ai_task_plan` (có hạt giống) với mọi người ngoài BTC và chỉ thêm `match.current_task` (phần công khai của đề ở hiệp hiện tại). Dữ liệu huấn luyện của hiệp: `GET /api/ai-main/:tid/matches/:mid/task` (hai đội trong trận và BTC), không lưu trong JSON giải.
- **Worker:** `update_match_code` kiểm tra bằng `validate_task_code` (cần hàm `solve`, chỉ Python); `play_match_round` rẽ nhánh `_finish_task_round` → `aitasks/rounds.py` (`runner.duel`: hai tiến trình chạy song song, chỉ chấm tập riêng tư, hòa điểm thì bốc thăm cố định theo `tie_break_seed` + hiệp). Bản ghi hiệp có `round_kind: "TASK"`, `task`, `scores`, `task_errors`, không có `board_steps`; `winner ∈ {team_a, team_b}`, `damage` cố định 20 nên HP, `complete_bracket_match` và ELO không đổi.
- **Giao diện:** phòng trận hiện thẻ "Đề của hiệp", mã mẫu `solve`, nút chấm thử trên máy (Pyodide); kết quả hiệp là bảng điểm hai đội thay cho bàn cờ (cả ở replay).

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

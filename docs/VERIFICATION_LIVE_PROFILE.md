# Kiểm tra vòng loại, live và hồ sơ — 2026-10-16

## Thay đổi

- Bỏ Hoàn tác ở luật/lịch. Sửa lại và Lưu vẫn hoạt động; đóng hộp thoại bỏ bản sửa chưa lưu.
- Vòng loại chạy thử ba Boss bằng Python/C++, không phụ thuộc giải chính và không ghi kết quả chính thức.
- Trận chính và chạy thử dùng một tiến trình Python cho mỗi bot trong hiệp; thực thi lại code trong namespace mới mỗi nước. Giữ hạn một giây/nước và đóng tiến trình khi kết thúc/lỗi. Không dùng giới hạn CPU cộng dồn làm thua oan một hiệp dài.
- Bàn live giữ lại DOM quân cờ, cập nhật quân di chuyển, không vẽ lại cùng bước mỗi 100 ms. Hiệu ứng di chuyển tôn trọng thiết lập giảm chuyển động. Admin không còn nháy trạng thái cuối trước khi phát các bước.
- Hồ sơ phân biệt hiệp thắng và trận Bo5 thắng, nhận diện đội bằng mã sinh viên. ELO lấy từ API bảng xếp hạng. Trận chưa hoàn tất không còn bị tính thành trận thua và trừ ELO.

## Kết quả kiểm tra

- `go test ./...`: đạt.
- Python: `test_game_process.py` (4), `test_board_turns.py` (14), `test_rule_combinations.py` (2): đạt; bao gồm 8 tổ hợp luật.
- Chrome `test_qualifier_practice.py`: ba Boss khi chưa có giải chính, xác thực, giới hạn mã, điện thoại, không đổi bài nộp/ELO/kết quả.
- Chrome `test_team_profile_corrections.py`: giao diện desktop/390 px, F5, hiệp thắng 1 nhưng Bo5 thắng 0, hoàn tất Bo5 thắng 1/hiệp thắng 3, ELO khớp API; quân giữ nguyên DOM khi cùng snapshot; sương mù, sửa luật/lịch và C++.
- Chrome `test_per_stage_rules.py`: giải 32 đội, công bố luật, phân quyền, tổ hợp luật, nộp mới mỗi hiệp, replay và restart: đạt.
- Chrome `test_reliability.py`: toàn bộ 19 nhóm hồi quy đạt, gồm giải bốn đội đến chung kết, websocket, bài nộp, phát lại và quyền truy cập.
- `benchmark_match_start.py`: cùng bot, seed, 73 bước; ba lần mỗi chế độ. Trung vị cục bộ Windows: 7,120 s trước, 0,427 s sau (~16,66 lần); kết quả và toàn bộ bước đi giống nhau.

Đây là kiểm tra cục bộ với dữ liệu tạm, không phải đo tải Render/Supabase. Bàn live vẫn phát các bước sau khi máy chủ tính xong hiệp; không phải truyền từng nước trong lúc bot thực thi. Chưa triển khai bản sửa này lên production.

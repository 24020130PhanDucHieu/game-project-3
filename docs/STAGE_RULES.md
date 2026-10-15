# Luật riêng cho từng vòng bảng đấu

Trong Bảng đấu, Admin chọn **Thiết lập luật từng vòng** cạnh nút đặt thời gian. Mỗi vòng hiện có của giải (kể cả vòng 1/16 trong giải 32 đội) có một cấu hình riêng. Toàn bộ trận và các hiệp Bo5 trong vòng dùng chung cấu hình đó. Mỗi hiệp vẫn yêu cầu nộp code mới như trước.

Tích độc lập một, hai hoặc cả ba luật. Không tích ô nào: luật chuẩn. Chỉ lưu vòng có thay đổi.

| ID | Luật |
|---|---|
| Bit 1: Trộn quân | 9 quân mỗi bên, ít nhất một quân mỗi loại; sáu quân còn lại chọn ngẫu nhiên rồi xáo vị trí. Hai đội có cùng cơ cấu, xếp đối xứng. Tạo mới mỗi hiệp và lưu seed để tái lập. |
| Bit 2: Đảo tương khắc | Búa thắng Bao, Bao thắng Kéo, Kéo thắng Búa trong mọi lượt. |
| Bit 4: Sương mù | Bot không nhận loại quân và nước chọn đối phương. Bàn đội thi hiện quân đối thủ thành `?`; API cũng che dữ liệu đối thủ trong các bước và nhật ký. Khách bị che cả hai bên; Admin xem đầy đủ. |

ID mới là `COMBO_0` đến `COMBO_7`, cộng các bit đã tích: `COMBO_5` = trộn quân + sương mù, `COMBO_7` = cả ba. Các preset cũ vẫn được thực thi đúng cho giải đã lưu. Vòng đã khóa giữ nguyên luật. Cùng loại va chạm vẫn ưu tiên quân phòng thủ. Không giới hạn số nước; thắng bằng chiếm cứ điểm hoặc hết quân đối phương. Bot lỗi/quá thời gian vẫn bị xử thua.

## Bàn live và phát lại

Bàn chính của đội theo hiệp mới nhất, cùng cơ chế với bàn live Admin: máy chủ thực thi hiệp, gửi các bước để trình diễn trong thời gian chuyển hiệp, chưa truyền từng nước khi bot đang thực thi. Dùng **Lịch sử hiệp đấu và phát lại → Xem Replay** để xem lại riêng. Bấm hiệp đã hoàn tất ở thanh điểm cũng mở phát lại. Trước khi hiệp trộn quân bắt đầu, quân chưa xếp hiện `↻`; khi bật sương mù, chỉ quân đối thủ hiện `?`. Khi có dữ liệu trận, đội luôn thấy đúng loại quân của mình.

## Công bố và khóa

- Giờ công bố để trống: công bố và khóa ngay khi lưu.
- Giờ ở tương lai: Admin được sửa trước giờ đó; đội thi và khách chỉ thấy thời điểm công bố, API không gửi ID luật.
- Trước công bố: server chặn nộp bài chính thức, đồng bộ bản nháp và bắt đầu hiệp của vòng đó.
- Sau công bố: Admin dùng **Sửa lại** để sửa nhầm nếu vòng chưa có trận nào bắt đầu. Đổi luật yêu cầu các đội nộp lại bot. Đóng cửa sổ để bỏ các thay đổi chưa lưu.
- Khi vòng đã có trận hoặc đang chạy: không được đổi luật, kể cả qua API sửa lại hoặc luật chung cũ.
- Khi thêm/đổi cấu hình chưa khóa: bài cũ mất trạng thái sẵn sàng, đội phải nộp lại. Lịch sử và bản nháp vẫn được giữ.
- Lịch mở/đóng vòng đặt riêng bằng nút lịch hiện có; không có hạn nộp mới áp dụng chung cho cả Bo5. Bài được khóa khi Admin bắt đầu từng hiệp.
- Chưa cấu hình luật riêng: dùng luật chung của giải để giữ tương thích.

## Đầu vào bot và bài nộp

Bot nhận `game_state['rules']`, ví dụ:

```python
{
    'id': 'COMBO_2',
    'initial_pieces': {'ROCK': 3, 'PAPER': 3, 'SCISSORS': 3},
    'fog': False,
    'shuffle': False,
    'reverse': True,
    'board_size': 9,
    'max_moves': None,
    'win_conditions': ['capture_base', 'eliminate_opponent']
}
```

`reverse_rule` ở cấp ngoài vẫn được giữ. Bot chỉ trả `ROCK`, `PAPER` hoặc `SCISSORS`; engine chọn quân và di chuyển theo cơ chế hiện có. Với trộn quân, đọc `remaining_cards` và `my_pieces`, không giả định luôn có ba quân mỗi loại. Kiểm tra code dùng bàn mẫu hợp lệ; trận thật dùng seed riêng. Sương mù áp dụng cho cả đầu vào bot và quân đối thủ trên bàn live/phát lại của đội.

Ô giải thích thay đổi chiến thuật không bắt buộc, tối đa 2.000 ký tự. Nội dung được lưu cùng phiên bản code, hiển thị trong lịch sử bài nộp của đội và Admin. Replay lưu `stage_rule` và `rules` thực tế của từng hiệp.

## API

`PUT /api/tournaments/:id/stage-rules` yêu cầu phiên Admin:

```json
{"rules":[{"level":1,"rule_id":"COMBO_5","publish_at":0}]}
```

`level` là `round_level` của bảng đấu hiện có, không phải số hiệp Bo5. Có thể cập nhật một phần các vòng; bỏ qua vòng không cần thay đổi. Timestamp tính bằng giây Unix. API từ chối vòng không tồn tại, trùng level, ID luật không hợp lệ và sửa cấu hình đã khóa. Cấu hình nằm trong snapshot PostgreSQL/JSON của giải; không cần tạo bảng database mới.

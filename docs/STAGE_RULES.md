# Luật riêng cho từng vòng bảng đấu

Trong Bảng đấu, Admin chọn **Thiết lập luật từng vòng** cạnh nút đặt thời gian. Mỗi vòng hiện có của giải (kể cả vòng 1/16 trong giải 32 đội) có một cấu hình riêng. Toàn bộ trận và các hiệp Bo5 trong vòng dùng chung cấu hình đó. Mỗi hiệp vẫn yêu cầu nộp code mới như trước.

Chỉ có 4 luật để chọn cho cấu hình mới:

| ID | Luật |
|---|---|
| `STAGE_1_STANDARD` | 3 Búa, 3 Bao, 3 Kéo; tương khắc chuẩn |
| `STAGE_2_MUTATED` | 5 Búa, 2 Bao, 2 Kéo; tương khắc chuẩn |
| `RULE_REVERSE` | 3 quân mỗi loại; đảo tương khắc trong mọi lượt |
| `RULE_FOG` | 3 quân mỗi loại; ẩn loại quân và nước chọn đối phương trong đầu vào bot |

Ba biến thể `RULE_MUTATED_FOG`, `STAGE_3_REVERSE_FOG`, `STAGE_4_FINALS` được giữ để thực thi và đọc replay của giải cũ. Chúng không còn là lựa chọn cho cấu hình mới. Vòng cũ chưa công bố có thể đổi sang một trong 4 luật trên; vòng đã khóa giữ nguyên luật để bảo đảm công bằng. Cùng loại va chạm vẫn ưu tiên quân phòng thủ. Không giới hạn số nước; thắng bằng chiếm cứ điểm hoặc hết quân đối phương. Bot lỗi/quá thời gian vẫn bị xử thua.

## Công bố và khóa

- Giờ công bố để trống: công bố và khóa ngay khi lưu.
- Giờ ở tương lai: Admin được sửa trước giờ đó; đội thi và khách chỉ thấy thời điểm công bố, API không gửi ID luật.
- Trước công bố: server chặn nộp bài chính thức, đồng bộ bản nháp và bắt đầu hiệp của vòng đó.
- Sau công bố hoặc khi vòng đã có trận: không được thay đổi cấu hình, kể cả qua API luật chung cũ.
- Khi thêm/đổi cấu hình chưa khóa: bài cũ mất trạng thái sẵn sàng, đội phải nộp lại. Lịch sử và bản nháp vẫn được giữ.
- Lịch mở/đóng vòng đặt riêng bằng nút lịch hiện có; không có hạn nộp mới áp dụng chung cho cả Bo5. Bài được khóa khi Admin bắt đầu từng hiệp.
- Chưa cấu hình luật riêng: dùng luật chung của giải để giữ tương thích.

## Đầu vào bot và bài nộp

Bot nhận `game_state['rules']`, ví dụ:

```python
{
    'id': 'RULE_REVERSE',
    'initial_pieces': {'ROCK': 3, 'PAPER': 3, 'SCISSORS': 3},
    'fog': False,
    'reverse': True,
    'board_size': 9,
    'max_moves': None,
    'win_conditions': ['capture_base', 'eliminate_opponent']
}
```

`reverse_rule` ở cấp ngoài vẫn được giữ. Bot chỉ trả `ROCK`, `PAPER` hoặc `SCISSORS`; engine chọn quân và di chuyển theo cơ chế hiện có. Sương mù áp dụng cho đầu vào bot; bàn đấu/replay vẫn hiển thị quân cho người xem.

Ô giải thích thay đổi chiến thuật không bắt buộc, tối đa 2.000 ký tự. Nội dung được lưu cùng phiên bản code, hiển thị trong lịch sử bài nộp của đội và Admin. Replay lưu `stage_rule` và `rules` thực tế của từng hiệp.

## API

`PUT /api/tournaments/:id/stage-rules` yêu cầu phiên Admin:

```json
{"rules":[{"level":1,"rule_id":"RULE_REVERSE","publish_at":0}]}
```

`level` là `round_level` của bảng đấu hiện có, không phải số hiệp Bo5. Có thể cập nhật một phần các vòng; bỏ qua vòng không cần thay đổi. Timestamp tính bằng giây Unix. API từ chối vòng không tồn tại, trùng level, ID luật không hợp lệ và sửa cấu hình đã khóa. Cấu hình nằm trong snapshot PostgreSQL/JSON của giải; không cần tạo bảng database mới.

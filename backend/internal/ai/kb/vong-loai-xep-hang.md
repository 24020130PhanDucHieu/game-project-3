<!-- title: Vòng loại và xếp hạng ELO; link: guide/qualifier; nguon: guide.tsx (Vòng loại), backend/internal/handler/http/main_elo.go, qualifier/runner.go -->

## Vòng loại hoạt động như thế nào
Mỗi lần nộp bài được đưa vào hàng đợi và kiểm tra trong sandbox; máy chủ trả biên nhận trước rồi chấm nền. Một lần nộp lỗi không thay thế bản hợp lệ trước đó. Bản hợp lệ cuối cùng được khóa khi hết hạn hoặc khi ban tổ chức khóa sớm; ban tổ chức có thể gia hạn cho mọi đội trước khi bắt đầu ghép cặp.

## Ghép cặp nhiều lượt
Mỗi lượt các đội được ghép cặp và chấm; ELO thay đổi sau mỗi trận. Nếu số đội lẻ, một đội được nghỉ (bye) trong lượt đó. Mọi đội bắt đầu vòng loại với ELO 1200. Bảng xếp hạng vòng loại xếp theo ELO; bằng ELO thì xét độ khó đối thủ.

## Chọn đội vào giải chính
Top 8, 16 hoặc 32 theo ELO vòng loại được chuyển vào một giải chính còn trống có số chỗ tương ứng.

## ELO giải chính
ELO giải chính tính riêng, độc lập hoàn toàn với ELO vòng loại. Mọi đội bắt đầu từ 1200, kể cả đội được chọn từ vòng loại. Sau mỗi trận Bo5 đã kết thúc, ELO hai đội được cập nhật theo công thức ELO chuẩn với hệ số K bằng 32: thắng đối thủ mạnh hơn được nhiều điểm hơn. Trận do ban tổ chức xử kết quả cũng được tính. Trận nhường đi (đối thủ trống) không tính. Biểu đồ ELO giải chính theo từng trận nằm trong Hồ sơ đội, mục Phân tích bot.

## Bảng xếp hạng
Trang Xếp hạng có hai tab: Giải chính (ELO từ các trận Bo5 đã kết thúc ở giải chính) và Vòng loại (ELO sau mỗi lượt ghép cặp). Giao hữu và đấu thử không tính ELO.

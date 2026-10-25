<!-- title: Luật chơi; link: guide/rules; nguon: guide.tsx (Luật cơ bản), bot-runner/app/engine/board.py, rules.py -->

## Bàn cờ và quân cờ
Kích thước bàn cờ là 9×9, tức 9 hàng và 9 cột (81 ô). Mỗi bên có 9 quân: 3 Búa (ROCK), 3 Bao (PAPER), 3 Kéo (SCISSORS). Hai bên đi luân phiên, mỗi lượt đi một nước. Hiệp không giới hạn số nước; engine có chốt an toàn 2000 nước, chạm mốc này hiệp được xử như bàn cờ bế tắc.

## Quân nào thắng quân nào
Búa thắng Kéo, Kéo thắng Bao, Bao thắng Búa. Quân chỉ ăn được quân mà nó khắc. Hai quân cùng loại gặp nhau thì hòa: không quân nào bị loại, quân tấn công lùi về ô cũ. Quân không tự đi vào ô có quân địch mà chỉ tấn công khi thắng được quân đó.

## Cách thắng một hiệp
Thắng hiệp khi chiếm cứ điểm (căn cứ) của đối phương hoặc tiêu diệt hết quân đối phương.

## Bàn cờ bế tắc
Nếu cả hai bên liên tiếp không còn nước đi, hiệp được xử bế tắc: đội còn nhiều quân hơn thắng; nếu bằng nhau thì đội có quân gần căn cứ đối thủ hơn thắng; nếu vẫn bằng thì phân định bằng bốc thăm đã lưu trước (không ai can thiệp được).

## Bot lỗi
Bot lỗi, trả nước đi không hợp lệ hoặc quá thời gian sẽ bị xử thua hiệp đó. Nếu cả hai bot đều lỗi biên dịch thì phân định bằng bốc thăm đã lưu; nếu chỉ một bot lỗi biên dịch thì đối thủ thắng.

## Bot chọn gì
Bot chỉ trả về một trong ROCK, PAPER hoặc SCISSORS (và JOKER khi luật Ô bí ẩn bật). Engine tự chọn quân đi và di chuyển quân theo nước chọn đó.

## Thể thức trận Bo5
Mỗi trận tối đa 5 hiệp; đội thắng 3 hiệp trước sẽ đi tiếp. Mỗi hiệp đội phải nộp bot mới trong tab Trận đấu. Ban tổ chức khai hỏa hiệp khi cả hai đội đã nộp bot hợp lệ.

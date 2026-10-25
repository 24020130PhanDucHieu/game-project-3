<!-- title: Viết bot; link: guide/bot; nguon: guide.tsx (Viết bot), workbench.tsx -->

## Hợp đồng của bot
Engine gọi bot ở mỗi lượt đi và nhận về đúng một nước chọn. Với Python bạn viết hàm decide_move(game_state) và trả về ROCK, PAPER hoặc SCISSORS. Với C++ bot đọc một dòng JSON từ stdin và in nước đi ra stdout.

## Trạng thái bot nhận được
game_state gồm: remaining_cards (số quân còn lại của bạn theo loại), my_pieces và opponent_pieces (danh sách quân với row, col, type, alive; khi có sương mù quân đối thủ không có type), turn_number, ply_number, active_side, history (lịch sử nước đi của bạn và của đối thủ nếu không có sương mù), target (tọa độ cứ điểm cần chiếm), reverse_rule (true nếu luật Đảo tương khắc đang bật), obstacles (danh sách ô chướng ngại nếu có), rules (cấu hình luật của hiệp: id, fog, shuffle, reverse, board_size, win_conditions).

## Giới hạn kỹ thuật
Mã nguồn tối đa 64 KB. Ghi chú giải thích chiến thuật tối đa 2.000 ký tự. Bot chạy trong sandbox: giới hạn module, tệp, mạng, tiến trình và thời gian; không thể truy cập mạng hay đọc tệp hệ thống. Ngôn ngữ hỗ trợ phụ thuộc máy chủ đang chạy (Python luôn có; C++ khi máy chấm có cài trình biên dịch).

## Kiểm tra mã và đấu thử
Dùng Kiểm tra mã và Đấu thử trong tab Nộp bot để thử trước khi nộp. Đấu thử với boss (ngẫu nhiên, tấn công, thích ứng) không tính vào giải, bài nộp, lịch sử hay ELO. Có thể thử không giới hạn số lần.

## Nộp bài từ Git
Có thể lấy mã từ một repo GitHub công khai vào ô soạn thảo; một số vòng loại yêu cầu bắt buộc kèm commit. Hệ thống chưa tự nhận bài qua webhook.

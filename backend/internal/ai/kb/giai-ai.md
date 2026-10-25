<!-- title: Giải AI; link: view/aicup; nguon: docs/AI_CUP.md, backend/internal/qualifier/ai.go, backend/internal/handler/http/ai_report_handler.go, bot-runner/app/aicup/suite.py -->

## Giải AI là gì
Giải AI là một giải đấu riêng nằm ở tab Giải AI. Cơ chế giống giải thường gồm vòng loại rồi giải chính, nhưng thi bằng mô hình học máy đọc lối chơi của đối thủ. Đội dùng chung tài khoản với giải thường; xếp hạng ELO, huy hiệu và giấy chứng nhận của Giải AI tách riêng, không lẫn vào giải thường.

## Vòng loại AI chấm điểm thế nào
Mỗi lượt máy chủ chấm mọi mô hình đã khóa trên một bộ đề mới với hạt giống bí mật. Phần A (đọc đối thủ, chiếm 60%): mô hình đấu 2 trận với mỗi nhóm đối thủ, mỗi trận 150 lượt oẳn tù tì liên tiếp; điểm là số lượt thắng cộng nửa số lượt hòa chia cho số lượt, thang 0 đến 100, đoán ngẫu nhiên được khoảng 50. Phần B (bàn cờ 9x9, chiếm 40%): 9 trận với ba boss ngẫu nhiên, tấn công và thích ứng. Điểm xếp hạng chính thức là trung bình các lượt của 0,6 nhân phần A ở bộ ẩn cộng 0,4 nhân phần B. Top 8, 16 hoặc 32 được chuyển vào giải chính AI.

## Bảng công khai và bảng riêng tư
Bảng công khai xem được ngay khi đang chấm và chỉ tính phần A trên bốn nhóm đối thủ công khai (thiên lệch, chu kỳ, phụ thuộc nước trước, phản đòn) với hạt giống công khai, nên dựng lại được trên máy. Bảng riêng tư là kết quả chính thức: dùng bộ ẩn với tham số mới mỗi lượt và thêm các nhóm đối thủ chưa công bố. Bảng riêng tư chỉ mở cho đội khi vòng loại kết thúc. Cột chênh lệch bằng điểm công khai trừ điểm đọc đối thủ ở bộ ẩn; chênh lệch lớn nghĩa là mô hình quá khớp bộ công khai.

## Viết mô hình cho Giải AI
Mô hình là hàm Python decide_move(game_state) trả ROCK, PAPER hoặc SCISSORS, giống bot của giải thường nên dùng được ở cả hai nơi. Mô hình đọc game_state history gồm my_move và opponent_move của các lượt đã qua. Mỗi lần gọi bot chạy trong phạm vi mới nên không nhớ biến cũ: mọi thứ phải suy ra từ history. Chỉ Python thuần, tối đa 64 KB, mỗi nước đi tối đa 1 giây, trọng số đã huấn luyện nhúng trong mã. Nút Chấm thử trên bộ công khai ở tab Nộp mô hình chạy ngay trên máy bạn bằng cùng bộ đối thủ công khai.

## Giải chính AI và báo cáo kỹ thuật
Giải chính AI là loại trực tiếp Bo5 như giải thường, chỉ nhận các đội được chốt từ vòng loại AI. Các đội còn nộp báo cáo kỹ thuật từ 200 đến 6000 ký tự, tùy chọn kèm liên kết kho mã, trước hạn do ban tổ chức đặt. Giám khảo chấm 5 tiêu chí gồm ý tưởng, dữ liệu và huấn luyện, đánh giá trung thực, giải thích được, tái lập được, mỗi tiêu chí 0 đến 10. Điểm kỹ thuật là trung bình điểm tổng (tối đa 50) của các giám khảo. Sau khi công bố, đội điểm cao nhất nhận Giải Kỹ thuật cùng giấy chứng nhận riêng.

## ELO và huy hiệu Giải AI
ELO giải chính AI tính riêng từ các trận Bo5 của giải chính AI với K bằng 32, mọi đội bắt đầu từ 1200, độc lập với ELO giải thường và với điểm vòng loại AI. Huy hiệu Giải AI tính từ kết quả thật gồm hoàn thành vòng loại, đọc được đối thủ (điểm đọc đối thủ ở bộ ẩn từ 70), mô hình khái quát, vào giải chính, vô địch, á quân, đồng hạng ba và Giải Kỹ thuật.

## Kho đề học từ thế cờ
Vòng loại AI có thể dùng kho đề thay cho đề oẳn tù tì. Kho gồm các đề học máy về bàn cờ 9x9: đoán bên thắng từ thế cờ, đoán lá bài bên đi sẽ ra, đoán số nước còn lại, đoán chênh lệch số quân và đoán lượt này có ăn quân không. Dữ liệu do máy sinh từ chính engine bàn cờ, nhãn lấy từ ván thật. Ban tổ chức bốc ngẫu nhiên các đề từ kho, xem trước, bốc lại rồi khóa đề; đội chỉ nộp bài sau khi đề được khóa và chỉ thấy đề khi đã khóa. Admin cũng thêm đề mới vào kho bằng cách chọn mẫu đề và chỉnh thông số, và có nút Thử đề để đo tốc độ.

## Nộp mô hình cho kho đề
Đội nộp một tệp Python có hàm solve(task) dùng chung cho mọi đề. Hàm nhận dữ liệu huấn luyện có nhãn và các thế cờ cần đoán, trả về danh sách dự đoán đúng thứ tự. Có thư viện nnlite để huấn luyện mạng nơ-ron nhỏ ngay trong solve với lan truyền xuôi, lan truyền ngược và cập nhật trọng số bằng SGD hoặc Adam; sandbox không có NumPy và không cho dùng class. Mỗi đề tính điểm từ 0 đến 100 và điểm riêng tư là kết quả chính thức; có nút chấm thử từng đề ngay trên máy bạn.

## Hiệp đề ML ở giải chính AI
Giải chính AI có thể chạy theo hiệp đề ML: mỗi hiệp của trận Bo5 là một đề học máy bốc từ kho thay cho ván bàn cờ. Ban tổ chức bốc đề cho từng hiệp của từng vòng, vòng sau khó hơn, rồi khóa đề trước khi các đội nộp bài. Ở mỗi hiệp hai đội cùng nộp hàm solve cho đề của hiệp đó, máy chấm trên thế cờ ẩn và đội có điểm cao hơn thắng hiệp; hòa điểm thì bốc thăm đã lưu. Đội chỉ thấy đề của hiệp hiện tại, tải được dữ liệu huấn luyện của hiệp và chấm thử ngay trên máy.

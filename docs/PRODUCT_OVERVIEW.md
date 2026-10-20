# Freshman Bot Arena — Web hiện đã làm được những gì?

**Cập nhật: 21/10/2026 · Dành cho thành viên dự án và ban tổ chức.**

Tài liệu tổng hợp chức năng để mọi người hiểu sản phẩm, thử demo và góp ý nâng cấp. Nội dung mô tả mã nguồn hiện tại, bao gồm nâng cấp nhận bài và phục hồi sự cố. Xem [hướng dẫn vận hành bản mới](RELEASE_READINESS.md) để phân biệt chức năng trong mã với phần đã được triển khai trên hosting.

> **Trạng thái phát hành:** bản mới đã có trên GitHub. Theo lần cập nhật gần nhất, backend AWS chưa được cập nhật bản này; việc frontend Cloudflare phát hành thành công cũng chưa được xác nhận. Cần cập nhật và kiểm tra trên hosting trước khi dùng các tính năng mới trong giải thật.

## 1. Sản phẩm giải quyết việc gì?

**Nâng cấp nhiều máy chấm:** có bộ chia việc theo sức chứa từng worker, chuyển máy khi lỗi/quá tải, xác thực máy chấm và kiểm tra cùng phiên bản. Hàng đợi vòng loại nhận bài bền vững; ghép cặp và tính ELO giảm tải mã nguồn lên gateway. Xem [kiến trúc và cách triển khai](MULTI_JUDGE.md), [kết quả kiểm thử](VERIFICATION_MULTI_JUDGE.md). Chưa chứng nhận 4.000 người đồng thời trên AWS.

Freshman Bot Arena là website tổ chức giải đấu lập trình bot Oẳn Tù Tì trên bàn cờ 9×9. Sinh viên viết thuật toán, nộp mã và cho bot thi đấu tự động. Ban tổ chức quản lý đội, vòng loại, bảng đấu, lịch, luật và kết quả ngay trên web.

Hiện có hai phần thi:

- **Vòng loại:** nhận bài bot, kiểm tra hợp lệ, khóa bài, ghép cặp nhiều lượt, tính ELO và chọn các đội vào giải chính.
- **Giải chính:** đấu loại trực tiếp, mỗi trận theo thể thức Bo5; đội thắng tiếp tục lên nhánh đến khi có quán quân. Mỗi hiệp yêu cầu nộp bot mới.

Luồng tổng quát:

```text
Đăng ký tài khoản → Tham gia vòng loại → Nộp bot → Khóa bài và chấm
→ Xếp hạng, chọn đội → Giải chính → Thi đấu từng vòng → Quán quân
```

Cũng có thể tổ chức giải chính với các đội do ban tổ chức thêm vào, không bắt buộc phải đi qua vòng loại.

## 2. Ai sử dụng được những gì?

| Người dùng | Các chức năng chính |
|---|---|
| Khách tham quan | Xem thông tin giải, bảng đấu, kết quả, xếp hạng, hướng dẫn và replay được phép công khai. Không đọc được mã bot riêng của đội. |
| Đội thi | Đăng ký/đăng nhập, xem hồ sơ, tham gia vòng loại, viết và nộp bot, kiểm tra mã, đấu thử boss, theo dõi trận và xem lại các hiệp. |
| Ban tổ chức / Admin | Quản lý tài khoản và đội, tạo giải, xếp bảng đấu, cấu hình luật/lịch, khóa bài vòng loại, chạy chấm, chọn đội vào giải chính và điều hành các trận. |

Đội có thể đăng nhập ngay sau khi đăng ký, kể cả khi chưa được thêm vào giải. Quyền được kiểm tra ở server; đăng nhập một đội không cho phép nộp mã thay đội khác hoặc thực hiện thao tác Admin.

## 3. Các chức năng đã có

### Tài khoản và hồ sơ đội

- Đăng ký bằng mã sinh viên, tên đội và mật khẩu; kiểm tra mã trùng và dữ liệu không hợp lệ.
- Đăng nhập, đăng xuất; giữ phiên khi tải lại trang. Phiên có thể tiếp tục dùng sau khi gateway khởi động lại nếu giữ nguyên khóa phiên.
- Trang **Hồ sơ đội** có thông tin đội, ELO, thống kê thi đấu và liên kết đến trận/bảng đấu.
- Admin tìm tài khoản, thêm đội vào giải và vô hiệu hóa tài khoản. Lịch sử thi đấu được giữ khi xóa tài khoản.

### Vòng loại

- Tạo vòng loại với tên, hạn nộp, số lượt ghép cặp và số đội vào giải chính.
- Đội đăng ký tham gia, soạn/dán hoặc tải file mã nguồn, nạp mẫu và kiểm tra bot.
- Có nút đấu thử với boss hệ thống ngay tại phần nộp bot vòng loại.
- Lưu lịch sử bài nộp. Khi khóa bài, dùng bản hợp lệ cuối cùng; một lần nộp lỗi không thay thế bản hợp lệ trước đó.
- Admin có thể khóa sớm; hệ thống có xử lý khóa khi đến hạn.
- Ghép cặp và chấm nhiều lượt, tính ELO, hiển thị tiến độ, kết quả và bảng xếp hạng có phân trang.
- Chọn top 8, 16 hoặc 32 đội để chuyển vào một giải chính trống có số chỗ tương ứng.
- Có tạo bot thử nghiệm riêng cho việc kiểm tra hệ thống.

**Giới hạn hiện tại:** cấu hình cho phép tối đa 4.000 đội và đã có kiểm thử chức năng tại ngưỡng này. Chưa có bằng chứng đo tải 4.000 người truy cập/nộp bài đồng thời trên máy AWS đang dùng.

### Bảng đấu và điều hành giải chính

- Quản lý nhiều giải, thêm đội, xếp bảng đấu và chọn đúng trận để điều hành.
- Đặt thời gian mở/đóng từng vòng; có thao tác sửa lại trong phạm vi được phép.
- Thiết lập giờ công bố luật và tổ hợp luật cho từng vòng.
- Theo dõi hai đội đã nộp mã hợp lệ hay chưa. Chỉ đủ điều kiện mới cho bắt đầu hiệp.
- Cập nhật tỉ số, kết quả hiệp và chuyển hiệp; đội thắng trận được đưa lên nhánh tiếp theo.
- Chạy được trọn giải bốn đội qua bán kết, chung kết đến khi xác định quán quân trong kiểm thử xuyên suốt.
- Có chặn thao tác xếp lại bảng hoặc sửa luật khi có thể làm ảnh hưởng trận/kết quả đã diễn ra.

### Phòng nộp bot và đấu thử

- Phòng nộp mã riêng cho đội trong trận đã chọn; có mã mẫu, chọn ngôn ngữ, kiểm tra mã và ghi chú chiến thuật.
- Lưu nháp để hạn chế mất nội dung khi đổi tab hoặc tải lại trang.
- Kiểm tra mã bằng sandbox thật, trả lỗi cú pháp/thực thi hoặc nước đi không hợp lệ.
- Đấu thử với các boss **ngẫu nhiên**, **tấn công** và **thích ứng**; xem diễn biến bàn cờ mà không ghi thành kết quả thi đấu chính thức.
- Có lịch sử bài nộp và xem mã nguồn theo quyền của đội/Admin.

**Ngôn ngữ:** trận đấu, kiểm tra bot và nhận bài vòng loại hỗ trợ Python và C++. C++ production cần WASI SDK và runtime trên worker. Cần chạy kiểm thử Linux/WASI trên đúng cấu hình phát hành trước khi mở thi.

### Xem trận, kết quả và replay

- Bàn cờ 9×9, số quân, điểm hai đội, hiệp hiện tại và nhật ký diễn biến.
- Đồng bộ trạng thái giải/trận qua WebSocket, có cơ chế tải lại trạng thái khi kết nối trở lại.
- Xem lại hiệp đã hoàn tất bằng replay và lịch sử trận.
- Có bảng xếp hạng, thống kê trong hồ sơ và kết quả đội thắng trên nhánh đấu.
- Bảo vệ mã nguồn riêng và che thông tin đối thủ theo luật sương mù.

**Lưu ý về chữ “live”:** engine hiện thực thi hiệp rồi cung cấp các bước để giao diện trình diễn. Đây chưa phải truyền từng nước cờ ngay trong lúc bot đang tính toán.

## 4. Luật chơi đang có

Mặc định mỗi bên có 9 quân, gồm 3 Búa, 3 Bao, 3 Kéo. Hai bên đi luân phiên; mục tiêu là chiếm cứ điểm đối phương hoặc tiêu diệt hết quân đối phương. Trận Bo5 kết thúc khi một đội thắng đủ ba hiệp. Bot lỗi hoặc vượt thời gian bị xử lý theo quy tắc của engine.

Ban tổ chức có thể tích độc lập các luật sau cho mỗi vòng:

| Luật | Tác dụng |
|---|---|
| **Trộn quân** | Thay đổi ngẫu nhiên số lượng từng loại và vị trí ban đầu. Mỗi bên vẫn có 9 quân, có ít nhất một quân mỗi loại; hai bên có cùng cơ cấu và xếp đối xứng. |
| **Đảo tương khắc** | Đổi thành Búa thắng Bao, Bao thắng Kéo, Kéo thắng Búa. |
| **Sương mù** | Đội thấy quân đối thủ dưới dạng `?`; bot không nhận loại quân đối thủ. Đội vẫn thấy loại quân của mình, Admin xem đầy đủ. |

Không tích ô nào là luật chuẩn. Có thể chọn một, hai hoặc cả ba luật cùng lúc. Luật áp dụng cho mọi hiệp trong cùng vòng. Khi sửa luật trước lúc vòng bắt đầu, các đội cần nộp lại bot; vòng đã thi đấu không được tùy ý đổi luật.

Bot chọn `ROCK`, `PAPER` hoặc `SCISSORS`; engine xử lý quân và di chuyển theo cơ chế hiện có. Đây chưa phải môi trường cho bot tự điều khiển tùy ý mọi quân trên bàn.

## 5. Mất mạng, mất điện và lỗi máy chấm

Các cơ chế sau đã có trong mã nguồn mới:

| Tình huống | Hệ thống hiện xử lý thế nào? |
|---|---|
| Sinh viên mất mạng sau khi mở phòng nộp bot | Tiếp tục soạn mã. Bấm nộp sẽ lưu bài trên thiết bị, hiển thị trạng thái chờ; khi có mạng ứng dụng tự gửi lại. |
| Cần giữ một bản riêng | Có nút tải bản dự phòng của hàng chờ. |
| Server bận hoặc chưa phản hồi đúng dạng | Giữ bài trong hàng chờ để thử lại; không coi HTTP 200 rỗng là xác nhận đã nhận bài. |
| Gửi lại cùng bài sau mất phản hồi | Có ID bài và biên nhận phía server để hạn chế gửi trùng. |
| Đổi tài khoản trên cùng trình duyệt | Không tự gửi hàng chờ của đội cũ bằng tài khoản đội mới. |
| Gateway khởi động lại | Có khôi phục vòng loại đang chạy và tiến độ đã lưu; kết quả/ELO đã áp dụng không được cộng lại trong các trường hợp đã kiểm thử. |
| Worker lỗi kết nối/quá tải | Có thử lại và hỗ trợ chọn worker khác nếu đã cấu hình nhiều worker; giải có thể tạm dừng để xử lý khi vẫn lỗi. |

Điều kiện dùng offline: đăng nhập và mở đúng phòng khi còn mạng; dùng cùng thiết bị/trình duyệt, không xóa dữ liệu trình duyệt. Giữ hoặc mở lại ứng dụng để đồng bộ. **Phải nối mạng trước hạn nộp và khi hiệp vẫn nhận bài.** Thông báo “đã lưu trên máy” chưa phải “server đã nhận”.

Kiểm tra mã và đấu boss vẫn cần mạng. Offline chưa chạy được bot ngay trong trình duyệt. Nếu ổ đĩa hỏng hoặc dữ liệu trình duyệt bị xóa thì không thể bảo đảm khôi phục bài chưa gửi; nếu máy mất điện, phần vừa gõ chưa kịp lưu cũng có thể mất.

## 6. Hạ tầng và bảo vệ thực thi

- Frontend đang được tổ chức để triển khai trên **Cloudflare**; backend trên **AWS EC2**, dữ liệu chính trên **Supabase PostgreSQL**.
- Python chạy trong tiến trình con có giới hạn môi trường, module, thời gian và tài nguyên. C++ production dùng WASI.
- Có phân quyền, giới hạn tần suất yêu cầu và giới hạn số lượt kiểm tra/nộp bot xử lý đồng thời để giảm dồn tải.
- Có cấu hình nhiều máy chấm, chia lượt và chuyển sang máy khác khi gặp một số lỗi tạm thời. Việc tăng máy thực tế vẫn cần cấu hình và kiểm tra riêng.
- Có lệnh chẩn đoán dịch vụ và tài liệu vận hành, xử lý mất mạng/mất điện, thay máy và cấu trúc dữ liệu.

Đây là các lớp bảo vệ và phục hồi hiện có, chưa phải cam kết sandbox tuyệt đối an toàn hoặc hệ thống không bao giờ mất dữ liệu.

## 7. Đã kiểm thử đến đâu?

Theo lượt kiểm thử ngày 20/10/2026:

| Nhóm | Kết quả |
|---|---|
| Backend Go | Toàn bộ bộ kiểm thử đã chạy đạt. |
| Python unit | 39 đạt trên Linux, bao gồm 6 kiểm thử C++/WASI; có kiểm tra đủ 8 tổ hợp luật. |
| Sandbox | Kiểm thử bảo mật Linux gồm module, filesystem, mạng, tiến trình và phân loại lỗi hạ tầng; xem báo cáo nâng cấp. |
| Offline trên Chrome | Đã thử nộp khi offline, nối mạng tự gửi, server lưu đúng một bài hợp lệ; tải lại bản build khi ngắt mạng được. |
| Luồng giải đấu trên Chrome | Đã chạy qua đăng nhập, quyền đội, nộp bot, mở trận, chuyển hiệp, restart gateway, replay, xếp hạng và giải bốn đội đến quán quân. |

Các kết quả trên dùng dữ liệu thử local. Không đồng nghĩa mọi cấu hình hosting, mọi trình duyệt hoặc mọi tải lớn đã được kiểm chứng. Chi tiết và điều kiện trước khi thi thật nằm trong [báo cáo kiểm thử](VERIFICATION_EXAM_READINESS.md).

Kết quả của các nâng cấp nhận bài, khôi phục và sandbox mới được ghi tại [báo cáo kiểm chứng bản nâng cấp](VERIFICATION_RELEASE_READINESS.md).

## 8. Những phần chưa hoàn tất / cần góp ý

| Hạng mục | Trạng thái và hướng tiếp theo |
|---|---|
| Triển khai bản mới lên hệ thống thật | Cần cập nhật backend AWS và xác nhận frontend Cloudflare đúng phiên bản, rồi thử một giải riêng trên hosting. |
| 4.000 người cùng nhận kết quả nhanh | Chưa đo tải đạt mục tiêu này. Máy t3.micro hiện tại chưa có cam kết đáp ứng; cần thêm tài nguyên và đo tải. |
| Hàng đợi nhận bài phía server | Đã bổ sung cho vòng loại: lưu bài và tác vụ chấm cùng transaction, trả biên nhận rồi chấm nền; giữ bài để chấm lại khi worker hỏng. Bảng đấu chính vẫn kiểm tra đồng bộ và lưu biên nhận cùng snapshot bài nộp. |
| Tạm dừng, gia hạn và truy vết | Có tạm dừng vòng loại sau lượt hiện tại; gia hạn cho mọi đội trước khi ghép cặp; nhật ký admin và kiểm tra database/worker tại `/ready`. |
| C++ cho mọi phần thi | Đã bỏ chặn C++ ở vòng loại production; cần xác nhận WASI trên môi trường phát hành. |
| Nộp bot qua Git | Chưa có webhook nhận bài từ repository/commit. GitHub hiện dùng quản lý và phát hành mã nguồn dự án. |
| Chạy thử khi hoàn toàn offline | Chưa có bộ chạy Python/C++ và boss trong trình duyệt hoặc bộ công cụ offline cho sinh viên. |
| Phục hồi sự cố | Đã diễn tập worker hỏng, restart gateway, bài chờ chấm, gia hạn và backup/restore PostgreSQL trên dữ liệu thử. Cần lặp lại trên staging tương đương AWS và thiết lập bản sao lưu ngoài máy. |

## 9. Gợi ý buổi demo và cách góp ý

Một buổi demo ngắn có thể đi theo thứ tự:

1. Đăng ký một tài khoản đội, đăng nhập và mở hồ sơ.
2. Nạp bot mẫu, kiểm tra và đấu thử boss.
3. Admin tạo giải bốn đội, thêm đội và xếp bảng.
4. Chọn tổ hợp luật, cho hai đội nộp bot rồi bắt đầu trận.
5. Xem diễn biến, kết quả, replay và đội lên nhánh tiếp theo.
6. Trên bản đã cập nhật đầy đủ: ngắt mạng của một đội, bấm nộp, nối mạng lại và kiểm tra bài được đồng bộ.

Khi góp ý, mọi người có thể dùng mẫu:

```text
Màn hình/chức năng:
Ai gặp vấn đề: đội thi / giám khảo / khách xem
Các bước thực hiện:
Kết quả đang thấy:
Kết quả mong muốn:
Mức ảnh hưởng: chặn thi đấu / gây khó dùng / cải thiện trải nghiệm
Ảnh hoặc video minh họa (nếu có):
```

Ưu tiên góp ý các điểm làm đội không nộp được bài, hiển thị sai kết quả, lộ mã nguồn, mất dữ liệu hoặc khiến giám khảo khó điều hành. Các ý tưởng luật/boss/giao diện mới có thể tập hợp riêng để chọn sau khi luồng thi ổn định.

### Tài liệu liên quan

- [Luật theo vòng](STAGE_RULES.md)
- [Đăng ký và quản lý tài khoản](TEAM_REGISTRATION.md)
- [Nộp bài offline](OFFLINE_EXAMS.md)
- [Vận hành giải và xử lý sự cố](TOURNAMENT_OPERATIONS.md)
- [Triển khai AWS](AWS_EC2.md)
- [API cho thành viên phát triển](API.md)

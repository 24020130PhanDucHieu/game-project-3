# -*- coding: utf-8 -*-
"""Generate summary DOCX document for BOT ARENA K69 features."""
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), fill_hex)
    tcPr.append(shd)

def create_document():
    doc = docx.Document()

    # Page setup: Normal 1-inch margins
    sections = doc.sections
    for section in sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.9)
        section.right_margin = Inches(0.9)

    # Base styles
    style_normal = doc.styles['Normal']
    font = style_normal.font
    font.name = 'Calibri'
    font.size = Pt(11)
    font.color.rgb = RGBColor(15, 23, 42) # slate-900

    # Colors
    NAVY = RGBColor(30, 58, 138)       # #1e3a8a
    DARK_BLUE = RGBColor(37, 99, 235)  # #2563eb
    SLATE_MUTED = RGBColor(100, 116, 139) # #64748b
    DARK_GRAY = RGBColor(30, 41, 59)   # #1e293b

    # Document Header / Title
    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_title.paragraph_format.space_before = Pt(4)
    p_title.paragraph_format.space_after = Pt(2)
    run_title = p_title.add_run("BÁO CÁO TỔNG KẾT TÍNH NĂNG HỆ THỐNG BOT ARENA K69")
    run_title.font.size = Pt(18)
    run_title.font.bold = True
    run_title.font.color.rgb = NAVY

    p_sub = doc.add_paragraph()
    p_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_sub.paragraph_format.space_before = Pt(0)
    p_sub.paragraph_format.space_after = Pt(18)
    run_sub = p_sub.add_run("Hệ Thống Thi Đấu Trực Tuyến & Chấm Mã Nguồn Bot Phân Tán (Ô Ăn Tù Tì V2 Bàn Cờ 9×9)")
    run_sub.font.size = Pt(11.5)
    run_sub.font.italic = True
    run_sub.font.color.rgb = SLATE_MUTED

    # Helper function for adding main sections
    def add_main_header(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(14)
        p.paragraph_format.space_after = Pt(8)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.font.size = Pt(14)
        run.font.bold = True
        run.font.color.rgb = NAVY

    # Helper function for adding page/sub-feature headers
    def add_page_header(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(10)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.font.size = Pt(12)
        run.font.bold = True
        run.font.color.rgb = DARK_BLUE

    # Helper function for adding bullet points
    def add_bullet(text, bold_prefix=""):
        p = doc.add_paragraph(style='List Bullet')
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(2.5)
        p.paragraph_format.line_spacing = 1.15
        if bold_prefix:
            r_bold = p.add_run(bold_prefix + ": ")
            r_bold.font.bold = True
            r_bold.font.color.rgb = DARK_GRAY
        r_text = p.add_run(text)
        r_text.font.color.rgb = DARK_GRAY

    # =========================================================================
    # PHẦN I: TÀI KHOẢN ĐỘI THI ĐẤU
    # =========================================================================
    add_main_header("PHẦN I: TÀI KHOẢN ĐỘI THI ĐẤU (TEAM ACCOUNT)")

    # 1. Trang Đăng nhập
    add_page_header("1. Trang Đăng nhập (Login)")
    add_bullet("Hỗ trợ đăng nhập nhanh bằng Mã số sinh viên (MSSV) và mật khẩu được Ban tổ chức cấp phát.", "Xác thực tài khoản")
    add_bullet("Tự động nhận diện vai trò Đội thi đấu, gán màu đại diện (Đội Đỏ hoặc Đội Xanh) và tên đội.", "Phân quyền thi đấu")
    add_bullet("Bảo lưu phiên làm việc an toàn trên trình duyệt qua Token/SessionStorage, không cần đăng nhập lại khi tải lại trang.", "Lưu trữ phiên")
    add_bullet("Tự động khôi phục ngữ cảnh trận đấu khi phòng thi gặp sự cố ngắt kết nối.", "Khôi phục trạng thái")

    # 2. Trang Tổng quan
    add_page_header("2. Trang Tổng quan giải đấu (Overview)")
    add_bullet("Xem tên giải đấu, trạng thái kích hoạt, thời gian diễn ra và thông điệp chung từ Ban tổ chức.", "Thông tin giải đấu")
    add_bullet("Xem thẻ thống kê số liệu tổng quan: tổng số đội đăng ký, số trận đã hoàn tất, tiến độ thi đấu toàn giải.", "Số liệu thống kê")
    add_bullet("Theo dõi tiến trình các vòng đấu từ Vòng loại, Tứ kết, Bán kết đến Chung kết.", "Lịch trình vòng đấu")
    add_bullet("Hiển thị trạng thái tham gia hiện tại của đội mình trong giải đấu đang kích hoạt.", "Trạng thái của đội")

    # 3. Trang Vòng loại
    add_page_header("3. Trang Vòng loại (Qualifier Submission & Practice)")
    add_bullet("Tích hợp trình soạn thảo mã nguồn trực tiếp trên web, hỗ trợ ngôn ngữ Python 3 và C++17.", "Trình soạn thảo IDE")
    add_bullet("Cho phép tải tệp mã nguồn (.py, .cpp) trực tiếp từ máy tính cá nhân vào trình soạn thảo.", "Tải tệp mã nguồn")
    add_bullet("Bộ kiểm tra hợp lệ cục bộ (Offline Validator) phân tích cú pháp hàm decide_move trước khi gửi.", "Kiểm tra cú pháp")
    add_bullet("Môi trường chạy thử nghiệm giả lập cục bộ an toàn ngay trên trình duyệt với bộ dữ liệu mẫu.", "Chạy thử nghiệm")
    add_bullet("Tính năng Đấu tập với Boss (Practice Arena) cho phép đấu thử nhiều ván với Bot mẫu để hoàn thiện thuật toán.", "Đấu tập Boss")
    add_bullet("Nộp bài thi chính thức lên máy chủ với hàng đợi tiếp nhận đảm bảo, phản hồi kết quả hợp lệ ngay lập tức.", "Nộp bài thi")
    add_bullet("Bảng lịch sử bài nộp chi tiết của đội: mã bài nộp (Submission ID), thời gian nộp, ngôn ngữ, trạng thái hợp lệ và thời gian thực thi (ms).", "Lịch sử nộp bài")

    # 4. Trang Sơ đồ thi đấu
    add_page_header("4. Trang Sơ đồ thi đấu (Tournament Bracket)")
    add_bullet("Sơ đồ cây nhánh đấu trực quan phân cấp theo từng vòng (Vòng bảng, Tứ kết, Bán kết, Chung kết).", "Cấu trúc nhánh đấu")
    add_bullet("Hiển thị thông tin từng cặp đấu: tên hai đội tham gia, MSSV, tỉ số hiệp thắng/thua.", "Thông tin cặp đấu")
    add_bullet("Cập nhật trạng thái trận đấu theo thời gian thực: Chờ đấu, Sẵn sàng (Ready), Đang thi đấu, Hoàn tất.", "Trạng thái trực tiếp")
    add_bullet("Bấm trực tiếp vào cặp đấu của đội để chuyển nhanh sang Phòng thi đấu khi đến lượt thi.", "Truy cập nhanh")

    # 5. Trang Phòng thi đấu
    add_page_header("5. Trang Phòng thi đấu trực tiếp (Match Arena)")
    add_bullet("Trình soạn thảo và nộp bot riêng biệt cho từng hiệp đấu theo thể thức Bo5 (Best of 5).", "Nộp bot theo hiệp")
    add_bullet("Bảng đèn hiệu sẵn sàng (Ready Status) của Đội Đỏ và Đội Xanh cập nhật thời gian thực qua WebSocket.", "Trạng thái sẵn sàng")
    add_bullet("Bàn cờ 9×9 (81 ô vuông) hiển thị trực quan chuyển động và tương tác của 9 quân cờ mỗi bên (3 Búa, 3 Bao, 3 Kéo).", "Bàn cờ mô phỏng 9×9")
    add_bullet("Đánh dấu tọa độ căn cứ đích của hai đội: Căn cứ Xanh tại ô [8, 0] (mục tiêu của Đỏ) và Căn cứ Đỏ tại ô [0, 8] (mục tiêu của Xanh).", "Căn cứ mục tiêu")
    add_bullet("Tốc độ hiển thị nước đi được tinh chỉnh mượt mà, giúp thí sinh dễ dàng quan sát chiến thuật của bot.", "Hiển thị diễn biến")
    add_bullet("Kênh hiển thị nhật ký trận đấu đa luồng: Nhật ký di chuyển (Move Logs), Nhật ký bot (Bot Logs) và Nhật ký hệ thống (System Logs).", "Hệ thống nhật ký")
    add_bullet("Tự động tổng kết kết quả hiệp đấu, hiển thị lý do thắng (đột kích căn cứ hoặc tiêu diệt toàn bộ quân) và cập nhật tổng tỉ số Bo5.", "Kết quả hiệp đấu")

    # 6. Trang Bảng xếp hạng
    add_page_header("6. Trang Bảng xếp hạng (Ranking / Leaderboard)")
    add_bullet("Bảng xếp hạng tự động tính điểm dựa trên số trận thắng, số hiệp thắng và hiệu số đối đầu.", "Bảng điểm tổng sắp")
    add_bullet("Xem chi tiết lịch sử thi đấu, danh sách các đối thủ đã chạm trán và kết quả từng trận của mỗi đội.", "Chi tiết thành tích")

    # 7. Trang Hướng dẫn thi đấu
    add_page_header("7. Trang Hướng dẫn thi đấu (Competition Guide)")
    add_bullet("Giải thích rõ ràng thể thức thi đấu Bo5 và mục tiêu chiến thắng trên bàn cờ 9×9.", "Luật chơi bàn cờ")
    add_bullet("Trình bày quy tắc tương khắc Búa - Bao - Kéo và cơ chế va chạm cùng loại (quân phòng thủ đứng yên thắng).", "Quy tắc giao tranh")
    add_bullet("Cung cấp mã nguồn mẫu chuẩn (Starter Template) cho Python 3 (decide_move) và C++17 (STDIN/STDOUT).", "Mẫu mã nguồn")
    add_bullet("Quy định cụ thể về môi trường Sandbox: giới hạn thời gian 1.0 giây, RAM 64MB và quy chế xử thua (TLE, RE).", "Quy chuẩn kỹ thuật")

    # 8. Trang Thông tin cá nhân
    add_page_header("8. Trang Thông tin cá nhân (Profile)")
    add_bullet("Xem thông tin định danh của đội: Tên đội, Mã số sinh viên (MSSV) đại diện, vai trò tài khoản.", "Thông tin tài khoản")
    add_bullet("Chức năng đổi mật khẩu tài khoản trực tiếp trên giao diện để bảo vệ mã nguồn dự thi.", "Đổi mật khẩu")

    # 9. Hộp thoại Xem lại trận đấu
    add_page_header("9. Hộp thoại Xem lại trận đấu (Replay Modal)")
    add_bullet("Xem lại toàn bộ diễn biến từng hiệp đấu đã kết thúc bằng thanh trượt thời gian (timeline slider).", "Phát lại trận đấu")
    add_bullet("Tái hiện chính xác vị trí 9 quân của hai đội trên bàn cờ 9×9 tại từng nước đi cụ thể.", "Tái hiện bàn cờ")
    add_bullet("Nút bấm xem lại nội dung mã nguồn bot đã thi đấu trong hiệp đó của đội mình.", "Xem lại mã thi đấu")

    # 10. Tính năng Ngoại tuyến & Bảo toàn bài nộp
    add_page_header("10. Tính năng Ngoại tuyến & Bảo toàn bài nộp (Offline Buffer)")
    add_bullet("Tự động nhận diện khi phòng thi bị mất kết nối mạng Internet (Offline).", "Nhận diện rớt mạng")
    add_bullet("Cho phép thí sinh tiếp tục soạn mã, kiểm tra hợp lệ và bấm nộp bài bình thường mà không bị gián đoạn.", "Lưu trữ cục bộ")
    add_bullet("Lưu trữ an toàn bài nộp vào bộ nhớ trình duyệt, ngăn ngừa nguy cơ mất trắng mã nguồn khi rớt mạng.", "Bảo toàn mã nguồn")
    add_bullet("Hộp thoại quản lý bài nộp ngoại tuyến tinh gọn: xem lại mã, sao chép mã hoặc tải file mã nguồn (.py, .cpp) về máy tính.", "Quản lý bài ngoại tuyến")
    add_bullet("Tự động gửi lại và đồng bộ toàn bộ bài nộp lên máy chủ ngay khi có mạng trở lại mà không cần thí sinh thao tác lại.", "Tự động đồng bộ")

    # =========================================================================
    # PHẦN II: TÀI KHOẢN QUẢN TRỊ VIÊN
    # =========================================================================
    add_main_header("PHẦN II: TÀI KHOẢN QUẢN TRỊ VIÊN (ADMIN ACCOUNT)")

    # 1. Trang Đăng nhập Quản trị
    add_page_header("1. Trang Đăng nhập Quản trị viên (Admin Login)")
    add_bullet("Đăng nhập tài khoản Quản trị viên (Super Admin) với quyền hạn cao nhất.", "Xác thực Quản trị")
    add_bullet("Mở khóa toàn bộ các bảng điều khiển hệ thống, công cụ giám sát và quyền điều hành trận đấu.", "Mở khóa quyền hạn")

    # 2. Trang Giám sát Hệ thống & Cụm máy chấm phân tán
    add_page_header("2. Trang Giám sát Hệ thống & Cụm máy chấm (Admin Monitoring)")
    add_bullet("Thống kê toàn diện hệ thống: tổng số tài khoản, tổng số trận đấu, tỉ lệ nộp bài của toàn giải.", "Thống kê tổng quan")
    add_bullet("Giám sát trạng thái hoạt động thực tế của Máy 1 (13.250.49.111) và Máy 2 (13.212.114.254).", "Cụm máy chấm độc lập")
    add_bullet("Đo lường dung lượng và số slot chấm song song (Capacity Slots) đang được sử dụng trên từng máy.", "Hiệu suất máy chấm")
    add_bullet("Ghi nhận chi tiết từng trận đấu hoặc lượt duyệt code được chuyển giao cho Máy 1 hay Máy 2.", "Nhật ký điều phối trực tiếp")
    add_bullet("Ghi nhận chính xác thời gian xử lý thực tế (ms) của từng tác vụ chấm và trạng thái kết quả (OK / Lỗi).", "Thời gian xử lý")
    add_bullet("Giám sát trạng thái kết nối cơ sở dữ liệu (Database: HEALTHY) và hàng đợi điều phối (Queue: READY).", "Trạng thái hạ tầng")
    add_bullet("Thanh tiến độ nộp bài trực quan hiển thị tỉ lệ phần trăm các đội đã nộp bài hợp lệ trên toàn hệ thống.", "Tiến độ nộp bài")

    # 3. Hộp thoại Quản lý Đội thi đấu
    add_page_header("3. Hộp thoại Quản lý Đội thi đấu (Team Management Modal)")
    add_bullet("Xem danh sách đầy đủ tất cả các đội thi đấu đã đăng ký trong hệ thống kèm thông tin MSSV.", "Danh sách đội thi")
    add_bullet("Thêm mới đội thi đấu: nhập mã sinh viên (MSSV), tên đội và tạo tài khoản đăng nhập.", "Tạo mới tài khoản")
    add_bullet("Đặt lại mật khẩu (Reset Password) ngay lập tức cho các đội khi có sự cố quên mật khẩu trong phòng thi.", "Đặt lại mật khẩu")
    add_bullet("Xóa đội thi đấu hoặc điều chỉnh thông tin đội khi cần thiết.", "Xóa và chỉnh sửa")
    add_bullet("Khóa hoặc mở khóa quyền nộp bài của các đội tham gia giải đấu.", "Khóa quyền nộp bài")

    # 4. Hộp thoại Quản lý Giải đấu
    add_page_header("4. Hộp thoại Quản lý Giải đấu (Tournament Management Modal)")
    add_bullet("Tạo giải đấu mới: đặt tên giải, chọn thể thức thi đấu (Bo1, Bo3, Bo5).", "Tạo giải đấu mới")
    add_bullet("Cấu hình quy tắc bàn cờ nâng cao: chế độ chuẩn hoặc chế độ có ô đặc biệt (Portal, Evolve, Trap).", "Cấu hình thể thức")
    add_bullet("Danh sách giải đấu: xem toàn bộ các giải đã tạo và chuyển đổi linh hoạt giải đấu đang kích hoạt.", "Chuyển đổi giải đấu")
    add_bullet("Khởi tạo lịch thi đấu và bốc thăm xếp nhánh tự động (Auto Bracket Generator) cho các đội đăng ký.", "Tạo nhánh đấu tự động")
    add_bullet("Xóa bỏ các giải đấu thử nghiệm để dọn dẹp cơ sở dữ liệu hệ thống.", "Xóa giải đấu thử nghiệm")

    # 5. Điều hành Trận đấu tại Phòng thi đấu
    add_page_header("5. Điều hành Trận đấu tại Phòng thi đấu (Admin Referee Control)")
    add_bullet("Quyền Trọng tài điều hành trận đấu: Nút 'Bắt đầu hiệp đấu' chỉ sáng khi cả hai đội đã nộp bot hợp lệ.", "Quyền Trọng tài (Referee)")
    add_bullet("Chủ động kích hoạt lệnh khai hỏa hiệp đấu để chuyển giao mã nguồn cho cụm máy chấm phân tán.", "Khai hỏa trận đấu")
    add_bullet("Quyền can thiệp quản trị: Khởi động lại hiệp đấu hoặc thiết lập lại trận đấu nếu xảy ra lỗi kỹ thuật phòng thi.", "Khởi động lại hiệp đấu")
    add_bullet("Theo dõi trực tiếp diễn biến trận đấu trên bàn cờ 9×9 và kiểm tra toàn bộ luồng log hệ thống.", "Giám sát trực quan")

    # 6. Hộp thoại Xem Lịch sử Mã nguồn Thí sinh
    add_page_header("6. Hộp thoại Xem Lịch sử Mã nguồn Thí sinh (Admin Code Viewer Modal)")
    add_bullet("Mở xem trực tiếp toàn văn mã nguồn bot đã chạy ở từng hiệp của cả Đội Đỏ và Đội Xanh.", "Xem toàn văn mã nguồn")
    add_bullet("Hiển thị thời gian nộp bài chính xác đến từng giây của từng đội thi.", "Thời gian nộp bài")
    add_bullet("Hiển thị mã định danh bài nộp (Submission ID) tương ứng với bản ghi trên máy chủ.", "Mã định danh bài nộp")
    add_bullet("Hiển thị thông tin Mã số sinh viên (MSSV) và Tên đội thi đấu của cả hai bên.", "Thông tin thí sinh")
    add_bullet("Hiển thị thời gian diễn ra hiệp đấu và kết quả thắng/thua của hiệp đó.", "Kết quả hiệp đấu")
    add_bullet("Phục vụ công tác thanh tra thi cử, kiểm tra đối chiếu thuật toán, chống gian lận và giải quyết khiếu nại.", "Thanh tra và chống gian lận")

    # Save document
    output_path = "Bao_Cao_Tong_Ket_Chuc_Nang_Bot_Arena.docx"
    doc.save(output_path)
    print(f"Document saved successfully: {output_path}")

if __name__ == "__main__":
    create_document()

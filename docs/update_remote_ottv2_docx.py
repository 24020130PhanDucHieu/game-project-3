# -*- coding: utf-8 -*-
"""
Script to generate the refined, highly detailed Project Planning Report:
"BÁO CÁO KẾ HOẠCH DỰ ÁN: XÂY DỰNG NỀN TẢNG THI ĐẤU GAME OẲN TÙ TÌ V2 (OTTV2) ĐA NGƯỜI CHƠI TRỰC TUYẾN QUA CLOUD (RENDER, SUPABASE, VERCEL) CHO SINH VIÊN TỪ XA NỘP CODE ĐẤU BOT VÀ BẢNG RANKING"

Key enhancements requested:
1. Designed for REMOTE / ANYWHERE access: students anywhere (home, dorm, cafe) can access via public cloud domains (Render/Vercel).
2. Code submission mechanism: directly paste Python code on Web or upload file or send via API.
3. Two matchmaking modes:
   - On-demand Quick Match (Đấu tức thời 4 người): Test bot immediately against 3 other bots in the pool.
   - Scheduled Automated Tournament (Giải đấu định kỳ 1.000 sinh viên): Batch queue engine runs the full tournament in seconds.
4. Concrete, easy step-by-step setup guide for Render.com, Supabase, Vercel (100% free, ready to code next week).
5. Strictly adheres to:
   - Times New Roman throughout
   - 100% black text (#000000)
   - Outline levels matching Word Navigation Pane
   - Natural flowing layout (no arbitrary page breaks, no text stretching)
   - 15-17 pages comprehensive depth
"""

import docx
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn, nsdecls

def generate_remote_cloud_report():
    doc = docx.Document()

    # A4 Page Margins
    for section in doc.sections:
        section.top_margin = Cm(2.0)
        section.bottom_margin = Cm(2.0)
        section.left_margin = Cm(3.0)
        section.right_margin = Cm(2.0)
        section.page_width = Cm(21.0)
        section.page_height = Cm(29.7)

    # Base styling
    normal_style = doc.styles['Normal']
    normal_style.font.name = 'Times New Roman'
    normal_style.font.size = Pt(12)
    normal_style.font.color.rgb = RGBColor(0, 0, 0)

    rPr = normal_style.element.get_or_add_rPr()
    rFonts = OxmlElement('w:rFonts')
    rFonts.set(qn('w:ascii'), 'Times New Roman')
    rFonts.set(qn('w:hAnsi'), 'Times New Roman')
    rFonts.set(qn('w:cs'), 'Times New Roman')
    rFonts.set(qn('w:eastAsia'), 'Times New Roman')
    rPr.append(rFonts)

    def apply_font(run, size=12, bold=False, italic=False):
        run.font.name = 'Times New Roman'
        run.font.size = Pt(size)
        run.bold = bold
        run.italic = italic
        run.font.color.rgb = RGBColor(0, 0, 0)
        r_pr = run._r.get_or_add_rPr()
        fonts = OxmlElement('w:rFonts')
        fonts.set(qn('w:ascii'), 'Times New Roman')
        fonts.set(qn('w:hAnsi'), 'Times New Roman')
        fonts.set(qn('w:cs'), 'Times New Roman')
        fonts.set(qn('w:eastAsia'), 'Times New Roman')
        r_pr.append(fonts)

    def add_outline_heading(text, level=1):
        style_name = f'Heading {level}'
        p = doc.add_paragraph(style=style_name)
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.keep_with_next = True

        pPr = p._p.get_or_add_pPr()
        outlineLvl = OxmlElement('w:outlineLvl')
        outlineLvl.set(qn('w:val'), str(level - 1))
        pPr.append(outlineLvl)

        if level == 1:
            p.paragraph_format.space_before = Pt(14)
            p.paragraph_format.space_after = Pt(5)
            p.paragraph_format.line_spacing = 1.2
            r = p.add_run(text)
            apply_font(r, size=13.5, bold=True)
        elif level == 2:
            p.paragraph_format.space_before = Pt(10)
            p.paragraph_format.space_after = Pt(4)
            p.paragraph_format.line_spacing = 1.2
            r = p.add_run(text)
            apply_font(r, size=12.5, bold=True)
        elif level == 3:
            p.paragraph_format.space_before = Pt(7)
            p.paragraph_format.space_after = Pt(3)
            p.paragraph_format.line_spacing = 1.2
            r = p.add_run(text)
            apply_font(r, size=12, bold=True, italic=True)
        return p

    def add_p(text="", align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_before=0, space_after=5, line_spacing=1.22, bold=False, italic=False, size=12, keep_with_next=False):
        p = doc.add_paragraph()
        p.alignment = align
        p.paragraph_format.space_before = Pt(space_before)
        p.paragraph_format.space_after = Pt(space_after)
        p.paragraph_format.line_spacing = line_spacing
        p.paragraph_format.keep_with_next = keep_with_next
        if text:
            r = p.add_run(text)
            apply_font(r, size=size, bold=bold, italic=italic)
        return p

    def add_bullet(bold_prefix, text):
        p = doc.add_paragraph(style='List Bullet')
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.line_spacing = 1.2
        if bold_prefix:
            r_pre = p.add_run(bold_prefix)
            apply_font(r_pre, size=12, bold=True)
        r_txt = p.add_run(text)
        apply_font(r_txt, size=12, bold=False)
        return p

    def add_numbered_item(num_str, text):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT  # NEVER JUSTIFY single numbered line to prevent text stretching
        p.paragraph_format.left_indent = Cm(0.8)
        p.paragraph_format.space_before = Pt(1)
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.line_spacing = 1.2
        r_n = p.add_run(num_str + " ")
        apply_font(r_n, size=12, bold=True)
        r_t = p.add_run(text)
        apply_font(r_t, size=12, bold=False)
        return p

    def add_code_block(lines):
        for idx, line in enumerate(lines):
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.left_indent = Cm(0.8)
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(1 if idx < len(lines) - 1 else 5)
            p.paragraph_format.line_spacing = 1.05
            p.paragraph_format.keep_with_next = (idx < len(lines) - 1)
            r = p.add_run(line)
            apply_font(r, size=9.5, bold=False)

    def style_table(table, col_widths=None):
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        tblPr = table._tbl.tblPr
        tblBorders = parse_xml(
            f'<w:tblBorders {nsdecls("w")}>\n'
            f'  <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>\n'
            f'  <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>\n'
            f'  <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>\n'
            f'  <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>\n'
            f'  <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>\n'
            f'  <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>\n'
            f'</w:tblBorders>'
        )
        tblPr.append(tblBorders)

        for row_idx, row in enumerate(table.rows):
            trPr = row._tr.get_or_add_trPr()
            trPr.append(parse_xml(f'<w:cantSplit {nsdecls("w")}/>'))
            if row_idx == 0:
                trPr.append(parse_xml(f'<w:tblHeader {nsdecls("w")}/>'))

            for col_idx, cell in enumerate(row.cells):
                if col_widths and col_idx < len(col_widths):
                    cell.width = col_widths[col_idx]
                tcPr = cell._tc.get_or_add_tcPr()
                tcMar = parse_xml(
                    f'<w:tcMar {nsdecls("w")}>\n'
                    f'  <w:top w:w="100" w:type="dxa"/>\n'
                    f'  <w:bottom w:w="100" w:type="dxa"/>\n'
                    f'  <w:left w:w="140" w:type="dxa"/>\n'
                    f'  <w:right w:w="140" w:type="dxa"/>\n'
                    f'</w:tcMar>'
                )
                tcPr.append(tcMar)
                if row_idx == 0:
                    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="F2F2F2"/>')
                    tcPr.append(shd)

    # Header / Footer
    header = doc.sections[0].header
    hp = header.paragraphs[0]
    hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    hr = hp.add_run("Kế hoạch Dự án: Nền tảng Đấu Bot OTTV2 Trực tuyến Cloud (Render, Supabase, Vercel)")
    apply_font(hr, size=9, italic=True)

    footer = doc.sections[0].footer
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fr = fp.add_run("Học phần: Bài tập 3 - Kết hợp (Version 1 & Version 2) | Đề án Lập trình 1 Tuần")
    apply_font(fr, size=9, italic=True)

    # =========================================================================
    # TRANG 1: TRANG BÌA (COVER PAGE)
    # =========================================================================
    add_p("BỘ GIÁO DỤC VÀ ĐÀO TẠO", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=15, space_after=2, size=12, bold=True)
    add_p("TRƯỜNG ĐẠI HỌC CÔNG NGHỆ - ĐẠI HỌC QUỐC GIA HÀ NỘI", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=4, size=12, bold=True)
    add_p("KHOA CÔNG NGHỆ THÔNG TIN", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=25, size=11, bold=True)

    add_p("---***---", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=35, size=12)

    add_p("BÁO CÁO KẾ HOẠCH DỰ ÁN VÀ THIẾT KẾ KỸ THUẬT", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=8, size=13, bold=True)
    add_p("BÀI TẬP 3 - KẾT HỢP", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=18, size=16, bold=True)

    add_p("KẾ HOẠCH XÂY DỰNG NỀN TẢNG THI ĐẤU TRỰC TUYẾN\nGAME OẲN TÙ TÌ V2 (OTTV2) ĐA NGƯỜI CHƠI BẰNG CODE\nTRIỂN KHAI CLOUD RENDER, SUPABASE CHO 1.000 SINH VIÊN TỪ XA", 
          align=WD_ALIGN_PARAGRAPH.CENTER, space_before=8, space_after=16, size=17.5, bold=True)

    add_p("HỌC PHẦN: PHÁT TRIỂN ỨNG DỤNG VÀ THUẬT TOÁN NÂNG CAO\n"
          "Bao gồm đầy đủ: Version 1 (Yêu cầu, thiết kế sơ bộ) & Version 2 (Bản đầy đủ & Lộ trình code)", 
          align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=45, size=12, italic=True)

    t_cov = doc.add_table(rows=5, cols=2)
    t_cov.alignment = WD_TABLE_ALIGNMENT.CENTER
    for r_i, (k, v) in enumerate([
        ("Vị trí đảm nhiệm:", "Trưởng nhóm Quản trị Hệ thống & Điều phối Đấu trường"),
        ("Tên dự án:", "Hệ thống OTTV2 Cloud Arena & Real-time Ranking"),
        ("Đối tượng phục vụ:", "Toàn thể sinh viên có thể truy cập từ xa qua Internet (~1.000 thí sinh)"),
        ("Giảng viên hướng dẫn:", "Bộ môn Kỹ thuật Phần mềm & Mạng máy tính"),
        ("Thời gian lập kế hoạch:", "Hà Nội, Tháng 10 Năm 2026")
    ]):
        row = t_cov.rows[r_i]
        p0 = row.cells[0].paragraphs[0]
        p0.alignment = WD_ALIGN_PARAGRAPH.LEFT
        r = p0.add_run(k)
        apply_font(r, size=11, bold=True)
        p1 = row.cells[1].paragraphs[0]
        p1.alignment = WD_ALIGN_PARAGRAPH.LEFT
        r = p1.add_run(v)
        apply_font(r, size=11, bold=False)

    doc.add_page_break()

    # =========================================================================
    # TRANG 2: TÓM TẮT DỰ ÁN (EXECUTIVE SUMMARY)
    # =========================================================================
    add_outline_heading("TÓM TẮT", level=1)

    add_p("Báo cáo này là bản kế hoạch hành động và đặc tả kỹ thuật chi tiết phục vụ việc xây dựng Nền tảng Thi đấu Game Oẳn Tù Tì V2 (OTTV2) bằng mã nguồn, đáp ứng đầy đủ yêu cầu của đề bài Bài tập 3 - Kết hợp. Trọng tâm của đề án xuất phát từ yêu cầu giảng viên: Người quản trị hệ thống (nhóm tác giả) có thời hạn 01 tuần để hoàn thiện mã nguồn một nền tảng thi đấu trực tuyến hoàn chỉnh. Nền tảng này cho phép toàn thể sinh viên trong trường (quy mô ước tính lên tới 1.000 người) ở bất kỳ đâu (nhà riêng, ký túc xá, trường học) có thể truy cập qua mạng Internet công cộng để nộp mã nguồn Bot cá nhân, thi đấu tự động với nhau và theo dõi Bảng xếp hạng (Ranking Leaderboard) thời gian thực.")

    add_p("Để bảo đảm tính khả thi cho việc bắt tay vào lập trình ngay trong tuần kế tiếp, kế hoạch đề xuất giải pháp kiến trúc gọn nhẹ, dễ thiết lập, không phụ thuộc vào hạ tầng vật lý đắt đỏ mà tận dụng tối đa hệ sinh thái Cloud miễn phí (Render, Supabase, Vercel). Điểm đột phá của kiến trúc là Cơ chế Xử lý ván đấu theo hàng đợi phân đợt (Queue Batch Engine): Thay vì cho 1.000 Bot chạy song song gây quá tải bộ nhớ máy chủ, hệ thống chia thành các phòng đấu 4 người và xử lý tuần tự theo từng luồng nhẹ (Worker). Mỗi ván đấu chỉ mất từ 0.5 đến 1.5 giây để giải quyết xong, giúp hệ thống hoàn thành toàn bộ 250 phòng đấu của 1.000 sinh viên chỉ trong vòng dưới 2 phút mà hoàn toàn nằm trong giới hạn tài nguyên miễn phí (512MB RAM).")

    add_p("Tài liệu tích hợp hoàn chỉnh cả Version 1 (Các yêu cầu, thiết kế sơ bộ) và Version 2 (Bản đầy đủ về luật chơi nhiều người, API/WebSocket, cơ sở dữ liệu quan hệ, mẫu Bot SDK cực dễ lập trình, cơ chế Sandbox an toàn, giải pháp hạ tầng chịu tải và bảng phân công công việc cụ thể cho đợt lập trình nước rút 7 ngày).")

    t_sum = doc.add_table(rows=7, cols=2)
    col_w_sum = [Cm(4.5), Cm(11.5)]
    style_table(t_sum, col_w_sum)

    sum_rows = [
        ("Chỉ số cốt lõi", "Nội dung giải pháp kỹ thuật đề xuất"),
        ("Mục tiêu bài toán", "Xây dựng hệ thống đấu Bot OTTV2 đa người chơi từ xa cho 1.000 sinh viên nộp code"),
        ("Thời gian thực hiện", "01 tuần chuẩn bị & lập trình (1-Week Sprint) sẵn sàng đưa vào vận hành"),
        ("Hạ tầng triển khai", "100% Cloud miễn phí: Backend (Render.com), DB (Supabase), Web (Vercel)"),
        ("Hình thức tương tác", "Truy cập Web công khai từ xa, dán code Python nộp trực tiếp hoặc gửi qua API"),
        ("Cơ chế phòng đấu", "Phòng 4 người chơi đồng thời; Ma trận tương khắc đa chiều; Thể thức sinh tồn HP"),
        ("Giải pháp chịu tải", "Hàng đợi xử lý theo đợt (Batch Queue), không nghẽn RAM, xử lý 1.000 Bot dưới 2 phút")
    ]
    for r_i, (c0, c1) in enumerate(sum_rows):
        row = t_sum.rows[r_i]
        p0 = row.cells[0].paragraphs[0]
        p0.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p0.paragraph_format.space_before = Pt(2)
        p0.paragraph_format.space_after = Pt(2)
        r = p0.add_run(c0)
        apply_font(r, size=11, bold=True)

        p1 = row.cells[1].paragraphs[0]
        p1.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p1.paragraph_format.space_before = Pt(2)
        p1.paragraph_format.space_after = Pt(2)
        r = p1.add_run(c1)
        apply_font(r, size=11, bold=(r_i == 0))

    doc.add_page_break()

    # =========================================================================
    # TRANG 3: MỤC LỤC TÀI LIỆU (TABLE OF CONTENTS)
    # =========================================================================
    add_outline_heading("MỤC LỤC", level=1)

    toc_list = [
        ("TÓM TẮT", "Trang 2", 1),
        ("MỤC LỤC", "Trang 3", 1),
        ("1. TỔNG QUAN HỆ THỐNG VÀ BỐI CẢNH DỰ ÁN", "Trang 4", 1),
        ("   1.1. Mục đích và Phạm vi tài liệu", "Trang 4", 2),
        ("   1.2. Bối cảnh dự án và Nhu cầu game OTTV2 nhiều người chơi bằng code", "Trang 4", 2),
        ("   1.3. Phân quyền và Đối tượng sử dụng (Admin vs 1.000 Sinh viên từ xa)", "Trang 5", 2),
        ("   1.4. Lộ trình kế hoạch: Version 1 (Sơ bộ) và Version 2 (Đầy đủ)", "Trang 5", 2),
        ("2. QUY TRÌNH NGHIỆP VỤ CỦA QUẢN TRỊ VIÊN (ADMIN)", "Trang 6", 1),
        ("   2.1. Bước 1: Khởi tạo phòng đấu và Cấu hình thông số OTTV2", "Trang 6", 2),
        ("   2.2. Bước 2: Quản lý Thí sinh và Tiếp nhận Bot dự thi từ xa", "Trang 6", 2),
        ("   2.3. Bước 3: Lập lịch thi đấu hàng loạt cho 1.000 sinh viên", "Trang 7", 2),
        ("   2.4. Bước 4: Vận hành Phiên thi đấu và Động cơ ghép cặp tự động", "Trang 7", 2),
        ("   2.5. Bước 5: Báo cáo, Thống kê và Cập nhật Bảng Ranking", "Trang 7", 2),
        ("   2.6. Bước 6: Quản trị hệ thống và Giám sát tài nguyên máy chủ Cloud", "Trang 8", 2),
        ("3. QUY TRÌNH NGHIỆP VỤ CỦA SINH VIÊN (USER / DEVELOPER)", "Trang 8", 1),
        ("   3.1. Đăng ký tài khoản và Lấy mã khóa API Key từ xa", "Trang 8", 2),
        ("   3.2. Tải Bot SDK và Lập trình thuật toán đối kháng đa người", "Trang 9", 2),
        ("   3.3. Kiểm thử Bot ngay trên Web Simulator / Sandbox cục bộ", "Trang 9", 2),
        ("   3.4. Nộp Bot vào Đấu trường và Theo dõi Bảng xếp hạng Ranking", "Trang 9", 2),
        ("4. THIẾT KẾ CHI TIẾT CƠ CHẾ GAME OTTV2 VÀ LUỒNG XỬ LÝ ĐA NGƯỜI", "Trang 10", 1),
        ("   4.1. Luật chơi OTTV2 đa người chơi (Bàn đấu 4 - 8 Bot, HP, Bộ thẻ bài hữu hạn)", "Trang 10", 2),
        ("   4.2. Ma trận tương khắc đồng thời và Cách tính điểm sát thương", "Trang 10", 2),
        ("   4.3. Luồng xử lý một ván đấu thời gian thực (Match Execution Loop)", "Trang 11", 2),
        ("   4.4. Cơ chế Sandbox an toàn, cô lập thực thi và Chống gian lận (Anti-Cheat)", "Trang 11", 2),
        ("   4.5. Thiết kế API Endpoints và Giao thức WebSocket cho môi trường Cloud", "Trang 12", 2),
        ("   4.6. Thiết kế Cơ sở dữ liệu quan hệ (Database Schema)", "Trang 12", 2),
        ("   4.7. Bot SDK mẫu (Python) cực kỳ dễ viết cho sinh viên", "Trang 13", 2),
        ("5. GIẢI PHÁP HẠ TẦNG CLOUD MIỄN PHÍ VÀ KHẢ NĂNG CHỊU TẢI 1.000 NGƯỜI", "Trang 13", 1),
        ("   5.1. Lựa chọn hệ sinh thái Cloud miễn phí (Render, Supabase, Vercel)", "Trang 13", 2),
        ("   5.2. Hướng dẫn thiết lập chi tiết để sinh viên truy cập từ mọi nơi", "Trang 14", 2),
        ("   5.3. Kiến trúc hàng đợi xử lý trận đấu theo đợt (Batch Matchmaking Queue)", "Trang 14", 2),
        ("   5.4. Chiến lược phân bổ tài nguyên và Kịch bản dự phòng Rate Limit", "Trang 15", 2),
        ("6. KẾ HOẠCH TỔ CHỨC GIẢI ĐẤU VÀ LỘ TRÌNH LẬP TRÌNH 1 TUẦN", "Trang 15", 1),
        ("   6.1. Thể thức phân bảng và Đấu trường sinh tồn (Battle Royale) cho 1.000 người", "Trang 15", 2),
        ("   6.2. Thuật toán tính điểm xếp hạng Elo và Tie-break", "Trang 16", 2),
        ("   6.3. Quy định xử lý lỗi quá thời gian (Timeout), mất kết nối và hòa ván đấu", "Trang 16", 2),
        ("   6.4. Kế hoạch lập trình nước rút 7 ngày (1-Week Sprint Timeline)", "Trang 16", 2),
        ("7. KẾ HOẠCH TRIỂN KHAI, KIỂM THỬ VÀ KẾT LUẬN", "Trang 17", 1),
        ("   7.1. Kế hoạch kiểm thử hệ thống (Unit Test, Stress Test 1.000 Bot giả lập)", "Trang 17", 2),
        ("   7.2. Đánh giá tính khả thi và Tiềm năng mở rộng của dự án", "Trang 17", 2)
    ]

    for title_text, page_str, lvl in toc_list:
        p_t = doc.add_paragraph()
        p_t.paragraph_format.space_before = Pt(1)
        p_t.paragraph_format.space_after = Pt(2)
        p_t.paragraph_format.line_spacing = 1.15

        r_title = p_t.add_run(title_text)
        apply_font(r_title, size=11, bold=(lvl == 1))

        dots_len = max(4, 76 - len(title_text))
        dots = " " + ". " * (dots_len // 2) + " "
        r_dots = p_t.add_run(dots)
        apply_font(r_dots, size=9.5, bold=False)

        r_page = p_t.add_run(page_str)
        apply_font(r_page, size=11, bold=(lvl == 1))

    doc.add_page_break()

    # =========================================================================
    # NỘI DUNG CHÍNH (DÒNG CHẢY LIÊN TỤC, KHÔNG NGẮT TRANG BỪA BÃI)
    # =========================================================================

    # 1. TỔNG QUAN HỆ THỐNG VÀ BỐI CẢNH DỰ ÁN
    add_outline_heading("1. TỔNG QUAN HỆ THỐNG VÀ BỐI CẢNH DỰ ÁN", level=1)

    add_outline_heading("1.1. Mục đích và Phạm vi tài liệu", level=2)
    add_p("Tài liệu này được biên soạn nhằm phục vụ công tác lập kế hoạch chi tiết, thiết kế kiến trúc kỹ thuật và xây dựng lộ trình hiện thực hóa Đề án Nền tảng Thi đấu Game Oẳn Tù Tì V2 (OTTV2) bằng mã nguồn, đáp ứng trực tiếp yêu cầu của đề bài Bài tập 3 - Kết hợp. Trọng tâm của đề án xuất phát từ yêu cầu giảng viên: Người quản trị hệ thống (nhóm tác giả) có thời hạn 01 tuần để hoàn thiện mã nguồn một nền tảng thi đấu trực tuyến hoàn chỉnh. Nền tảng này cho phép toàn thể sinh viên trong trường (quy mô ước tính lên tới 1.000 người) ở bất kỳ đâu (nhà riêng, ký túc xá, quán cà phê) có thể truy cập qua mạng Internet công cộng để nộp mã nguồn Bot cá nhân, thi đấu tự động với nhau và theo dõi Bảng xếp hạng (Ranking Leaderboard) thời gian thực.")

    add_p("Tài liệu bao quát trọn vẹn cả hai cấu phần quy định:")
    add_bullet("Version 1 (Yêu cầu và Thiết kế sơ bộ): ", "Xác định rõ ràng mục tiêu nghiệp vụ, phân tích các yêu cầu chức năng và phi chức năng cơ sở, phác thảo các quy tắc mở rộng của trò chơi OanTuTi và xây dựng mô hình trao đổi dữ liệu sơ bộ giữa Bot và Đấu trường.")
    add_bullet("Version 2 (Bản đầy đủ và Kế hoạch triển khai): ", "Đặc tả chi tiết luật chơi đa người chơi OTTV2, thiết kế hạ tầng Cloud miễn phí (Render, Supabase, Vercel) cho phép sinh viên từ xa truy cập dễ dàng, cơ chế xử lý hàng đợi theo đợt (Batch Queue), đặc tả API/WebSocket, thiết kế cơ sở dữ liệu quan hệ, mẫu Bot SDK dễ tiếp cận và kế hoạch lập trình nước rút trong 7 ngày tới.")

    add_outline_heading("1.2. Bối cảnh dự án và Nhu cầu game OTTV2 nhiều người chơi bằng code", level=2)
    add_p("Trò chơi OanTuTi truyền thống (Kéo - Búa - Bao) mang tính đối kháng 1v1 đơn giản và phụ thuộc nặng nề vào yếu tố may rủi tức thời. Khi áp dụng vào bài toán tổ chức một giải đấu công nghệ cho quy mô hàng trăm đến hàng nghìn sinh viên học tập từ xa ở nhiều địa điểm khác nhau, mô hình cũ hoàn toàn không đáp ứng được bởi thời gian thi đấu kéo dài và thiếu tính toán chiến thuật chuyên sâu.")
    add_p("Phiên bản OTTV2 chơi với nhiều người (Multiplayer) được phát triển nhằm giải quyết triệt để bài toán này:")
    add_bullet("Truy cập từ xa ở mọi nơi qua Internet: ", "Toàn bộ hệ thống được triển khai trên môi trường Cloud công cộng. Sinh viên ở bất kỳ đâu chỉ cần có kết nối mạng là có thể mở trình duyệt Web để nộp code, kiểm tra tính năng và theo dõi trận đấu mà không cần cài đặt môi trường phức tạp.")
    add_bullet("Thi đấu đa người chơi đồng thời: ", "Mỗi bàn đấu tiêu chuẩn tập hợp từ 4 đến 8 Bot. Thay vì từng cặp đấu riêng lẻ, tất cả các Bot trên bàn cùng ra quyết định đồng thời trong một nhịp đếm 1000ms, tạo nên một đấu trường hỗn chiến kịch tính.")
    add_bullet("Nâng tầm chiều sâu chiến thuật: ", "Bổ sung thanh máu (Hit Points - HP), giới hạn kho thẻ bài cá nhân (mỗi loại chỉ được dùng một số lần nhất định) và áp dụng ma trận tương khắc đa chiều. Bot phải biết phân tích xác suất hành vi của số đông trên bàn để đưa ra quyết định có lợi nhất.")
    add_bullet("Tự động hóa hoàn toàn và Minh bạch: ", "Máy chủ đóng vai trò trọng tài tự động, tự phân bảng, tự chạy hàng trăm ván đấu trong vài phút và hiển thị kết quả trực tiếp lên Bảng Ranking công khai.")

    add_outline_heading("1.3. Phân quyền và Đối tượng sử dụng (Admin vs 1.000 Sinh viên từ xa)", level=2)
    add_p("Hệ thống được thiết kế hướng tới việc phân định ranh giới chức năng rõ ràng giữa hai nhóm chủ thể:")

    t_roles = doc.add_table(rows=3, cols=3)
    col_w_roles = [Cm(3.5), Cm(4.5), Cm(8.0)]
    style_table(t_roles, col_w_roles)

    roles_data = [
        ("Nhóm tác nhân", "Phân quyền và Vai trò", "Trách nhiệm nghiệp vụ cụ thể"),
        ("Người quản trị hệ thống\n(Admin / Chủ dự án)", "Quản trị viên tối cao\n(System Administrator)", "Khởi tạo giải đấu, cấu hình thông số phòng OTTV2, giám sát hàng đợi thi đấu, phê duyệt mã nguồn Bot, kích hoạt các vòng đấu cho 1.000 sinh viên, trích xuất bảng Ranking và xử lý sự cố máy chủ Cloud."),
        ("Sinh viên tham gia\n(User / Thí sinh ~1.000 người)", "Lập trình viên tuyển thủ\n(Participant Developer)", "Truy cập Web từ mọi nơi, đăng ký tài khoản bằng Mã số sinh viên, nhận API Key, tải Bot SDK mẫu, lập trình thuật toán, kiểm thử trên Web Simulator, nộp Bot và theo dõi thứ hạng trực tiếp trên bảng xếp hạng.")
    ]
    for r_i, r_data in enumerate(roles_data):
        row = t_roles.rows[r_i]
        for c_i, text in enumerate(r_data):
            cell = row.cells[c_i]
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if c_i == 0 else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            r = p.add_run(text)
            apply_font(r, size=11, bold=(r_i == 0))

    add_outline_heading("1.4. Lộ trình kế hoạch: Version 1 (Sơ bộ) và Version 2 (Đầy đủ)", level=2)
    add_p("Để việc hiện thực hóa trong 01 tuần đạt hiệu quả cao nhất, kế hoạch phân chia khối lượng công việc thành hai chặng nối tiếp nhau:")

    t_ver = doc.add_table(rows=5, cols=3)
    col_w_ver = [Cm(3.5), Cm(6.0), Cm(6.5)]
    style_table(t_ver, col_w_ver)

    ver_data = [
        ("Tiêu chí so sánh", "Giai đoạn Version 1 (Thiết kế sơ bộ)", "Giai đoạn Version 2 (Bản đầy đủ & Triển khai)"),
        ("Mô hình thi đấu", "Thử nghiệm phòng đối kháng 1v1 cơ bản giữa 2 Bot để chuẩn hóa logic cốt lõi.", "Hỗ trợ đầy đủ phòng đấu hỗn chiến 4 đến 8 Bot và hệ thống phân bảng cho 1.000 thí sinh."),
        ("Động cơ phân xử", "So sánh kéo búa bao cơ bản, trừ HP theo hiệp đấu đơn lẻ.", "Ma trận tương khắc đa chiều đồng thời, tính điểm thưởng hạ gục và trừ máu tập thể."),
        ("Phương thức nộp Bot", "Thực thi kịch bản script cục bộ qua tệp tin hoặc lệnh dòng lệnh CLI.", "Giao diện Web nộp code trực tiếp từ xa hoặc Webhook URL; thực thi an toàn trong Sandbox."),
        ("Kiến trúc hạ tầng", "Máy chủ cục bộ Localhost phục vụ việc viết mã kiểm thử ban đầu.", "Triển khai hoàn chỉnh trên hệ sinh thái Cloud miễn phí (Render, Supabase, Vercel) có domain công khai.")
    ]
    for r_i, r_data in enumerate(ver_data):
        row = t_ver.rows[r_i]
        for c_i, text in enumerate(r_data):
            cell = row.cells[c_i]
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if c_i == 0 else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            r = p.add_run(text)
            apply_font(r, size=11, bold=(r_i == 0))

    add_p("", space_before=4, space_after=8)

    # 2. QUY TRÌNH NGHIỆP VỤ CỦA QUẢN TRỊ VIÊN (ADMIN)
    add_outline_heading("2. QUY TRÌNH NGHIỆP VỤ CỦA QUẢN TRỊ VIÊN (ADMIN)", level=1)

    add_p("Quy trình điều hành của Quản trị viên (Admin) được thiết kế thành một chuỗi 6 bước khép kín, bảo đảm người quản trị có thể dễ dàng kiểm soát toàn bộ 1.000 Bot thi đấu mà không bị quá tải công việc:")

    add_outline_heading("2.1. Bước 1: Khởi tạo phòng đấu và Cấu hình thông số OTTV2", level=2)
    add_p("Quản trị viên đăng nhập vào bảng điều khiển Web Admin Dashboard (truy cập qua link bảo mật của Render) và thiết lập các thông số luật thi đấu trước giờ khởi tranh:")
    add_bullet("Thiết lập quy mô phòng đấu: ", "Cài đặt chế độ thi đấu hỗn chiến đa người (tiêu chuẩn 4 Bot/phòng hoặc 8 Bot/phòng cho vòng sinh tồn).")
    add_bullet("Cấu hình tài nguyên trận đấu: ", "Quy định mức HP khởi điểm (100 HP), số lượng thẻ Kéo - Búa - Bao cấp phát trong kho bài của mỗi Bot (5 Kéo, 5 Búa, 5 Bao cho tối đa 15 hiệp đấu).")
    add_bullet("Giới hạn thời gian phản hồi (Timeout): ", "Cài đặt thời gian cho mỗi lượt ra quyết định là 1000ms. Điều này giúp các ván đấu tự động kết thúc nhanh chóng trong vòng vài giây.")

    add_outline_heading("2.2. Bước 2: Quản lý Thí sinh và Tiếp nhận Bot dự thi từ xa", level=2)
    add_p("Quản trị viên theo dõi tiến độ nộp bài của sinh viên ở khắp mọi nơi:")
    add_bullet("Duyệt danh sách đăng ký: ", "Hệ thống tự động đồng bộ danh sách 1.000 sinh viên thông qua bảng dữ liệu Supabase, xác thực mã số sinh viên hợp lệ.")
    add_bullet("Kiểm tra tính hợp lệ tự động (Pre-flight Check): ", "Khi sinh viên dán code hoặc nộp file từ xa, hệ thống trên Render tự động kiểm tra cú pháp Python và chạy thử nghiệm một hiệp đấu giả lập. Nếu Bot phản hồi đúng cấu trúc JSON trong 1000ms, trạng thái Bot được chuyển sang 'Hợp lệ' (Ready).")

    add_outline_heading("2.3. Bước 3: Lập lịch thi đấu hàng loạt cho 1.000 sinh viên", level=2)
    add_p("Với số lượng 1.000 Bot, quản trị viên kích hoạt tính năng bốc thăm tự động trên giao diện web:")
    add_bullet("Phân bổ 250 phòng đấu: ", "1.000 Bot được chia đều thành 250 phòng đấu (mỗi phòng 4 Bot).")
    add_bullet("Chia bảng thi đấu theo đợt (Batches): ", "Thay vì chạy cả 250 phòng cùng lúc, hệ thống chia thành 25 đợt (mỗi đợt 10 phòng chạy song song). Điều này bảo đảm bộ nhớ máy chủ Cloud miễn phí trên Render không bao giờ bị quá tải.")

    add_outline_heading("2.4. Bước 4: Vận hành Phiên thi đấu và Động cơ ghép cặp tự động", level=2)
    add_p("Quản trị viên phát lệnh bắt đầu giải đấu (Trigger Tournament Batch) chỉ bằng một cú nhấp chuột:")
    add_bullet("Động cơ Worker tự động kích hoạt: ", "Máy chủ Worker trên Render lần lượt nạp từng phòng đấu vào hàng đợi, gọi hàm ra quyết định của các Bot, tính toán ma trận sát thương và ghi nhận kết quả.")
    add_bullet("Giám sát trạng thái thời gian thực: ", "Bảng điều khiển Admin hiển thị tiến độ hoàn thành (ví dụ: 'Đã hoàn thành 150/250 phòng - 60%'). Quản trị viên có nút can thiệp khẩn cấp (Pause / Stop / Re-run Batch) nếu phát hiện sự cố mạng.")

    add_outline_heading("2.5. Bước 5: Báo cáo, Thống kê và Cập nhật Bảng Ranking", level=2)
    add_p("Khi toàn bộ các phòng đấu hoàn tất, hệ thống tự động xử lý số liệu xếp hạng:")
    add_bullet("Cập nhật Bảng Ranking tức thời: ", "Thuật toán tính điểm Elo đa người chơi tự động cập nhật điểm số cho 1.000 tuyển thủ, đẩy dữ liệu trực tiếp lên giao diện Web Leaderboard công khai trên Vercel.")
    add_bullet("Trích xuất nhật ký và Thống kê: ", "Cung cấp báo cáo tỷ lệ thắng, số hiệp hòa, phân tích nước đi ưa thích của sinh viên toàn trường, giúp ban tổ chức dễ dàng công bố kết quả giải thưởng.")

    add_outline_heading("2.6. Bước 6: Quản trị hệ thống và Giám sát tài nguyên máy chủ Cloud", level=2)
    add_p("Quản trị viên kiểm soát tình trạng kỹ thuật của hạ tầng Cloud miễn phí:")
    add_bullet("Theo dõi mức sử dụng RAM và CPU: ", "Bảo đảm tài nguyên của Render duy trì dưới 80% ngưỡng cho phép (dưới 400MB trên tổng số 512MB RAM miễn phí).")
    add_bullet("Sao lưu dữ liệu giải đấu: ", "Tải bản sao lưu (Backup) cơ sở dữ liệu từ Supabase về máy tính cá nhân để lưu trữ phục vụ việc chấm điểm học phần.")

    add_p("", space_before=4, space_after=8)

    # 3. QUY TRÌNH NGHIỆP VỤ CỦA SINH VIÊN (USER / DEVELOPER)
    add_outline_heading("3. QUY TRÌNH NGHIỆP VỤ CỦA SINH VIÊN (USER / DEVELOPER)", level=1)

    add_p("Để 1.000 sinh viên ở khắp mọi nơi có thể tham gia dễ dàng mà không gặp rào cản kỹ thuật phức tạp, quy trình người dùng được tối ưu hóa tối đa:")

    add_outline_heading("3.1. Đăng ký tài khoản và Lấy mã khóa API Key từ xa", level=2)
    add_p("Sinh viên mở trình duyệt Web trên điện thoại hoặc máy tính, truy cập địa chỉ Web công khai của giải đấu:")
    add_bullet("Đăng ký tài khoản nhanh chóng: ", "Điền Họ tên, Mã số sinh viên và Lớp học phần. Hệ thống tự động kích hoạt tài khoản ngay lập tức qua dịch vụ Supabase Auth.")
    add_bullet("Nhận API Key cá nhân: ", "Mỗi sinh viên được cấp một chuỗi mã khóa duy nhất dùng để xác thực quyền nộp Bot và bảo đảm không ai có thể can thiệp vào điểm số của người khác.")

    add_outline_heading("3.2. Tải Bot SDK và Lập trình thuật toán đối kháng đa người", level=2)
    add_p("Sinh viên tải về bộ công cụ phát triển phần mềm (Bot SDK) cực kỳ trực quan:")
    add_bullet("Tệp mẫu có sẵn (Template Code): ", "Tệp `bot_template.py` chỉ dài khoảng 25 dòng mã nguồn rõ ràng. Sinh viên không cần học kiến thức về mạng hay giao thức phức tạp mà chỉ cần viết logic cho hàm duy nhất: `def make_move(game_state): return 'ROCK'`.")
    add_bullet("Tự do sáng tạo chiến thuật: ", "Sinh viên có thể lập trình các thuật toán từ đơn giản (ngẫu nhiên có trọng số, đếm thẻ bài còn lại) đến nâng cao (chuỗi Markov dự đoán tâm lý số đông đối thủ trên bàn đấu 4 người).")

    add_outline_heading("3.3. Kiểm thử Bot ngay trên Web Simulator / Sandbox cục bộ", level=2)
    add_p("Nhằm tránh tình trạng sinh viên nộp code bị lỗi cú pháp làm hỏng giải đấu:")
    add_bullet("Trình mô phỏng trực tiếp trên Web (Web Simulator): ", "Sinh viên có thể dán mã nguồn Bot lên trang Web để thi đấu thử nghiệm ngay lập tức với 3 Bot ngẫu nhiên của hệ thống, xem kết quả thắng thua sau 1 giây.")
    add_bullet("Kiểm tra thời gian thực thi: ", "Hệ thống hiển thị thời gian phản hồi của hàm (ví dụ: '12ms - Đạt yêu cầu'), giúp sinh viên biết thuật toán của mình có bị chạy quá thời gian 1000ms hay không.")

    add_outline_heading("3.4. Nộp Bot vào Đấu trường và Theo dõi Bảng xếp hạng Ranking", level=2)
    add_p("Sau khi kiểm thử thành công, sinh viên gửi bài dự thi từ xa một cách thuận tiện:")
    add_bullet("Hai hình thức nộp code linh hoạt: ", "Sinh viên có thể dán trực tiếp đoạn mã Python vào khung soạn thảo trên Web rồi bấm 'Nộp Bot', hoặc nộp tệp file `.py` đính kèm.")
    add_bullet("Chế độ Đấu Ngẫu Nhiên Tức Thì (Quick Match): ", "Sau khi nộp, sinh viên có thể bấm nút 'Đấu ngay' để hệ thống tự động bốc 3 Bot của các bạn sinh viên khác đang có sẵn trên Cloud để thi đấu 1 trận 4 người, xem kết quả diễn biến ván đấu sau 2 giây.")
    add_bullet("Xem Bảng Ranking trực tiếp: ", "Sinh viên truy cập trang Leaderboard để xem vị trí xếp hạng của mình giữa 1.000 thí sinh, xem lại lịch sử từng hiệp đấu và lượng HP tiêu hao một cách minh bạch.")

    add_p("", space_before=4, space_after=8)

    # 4. THIẾT KẾ CHI TIẾT CƠ CHẾ GAME OTTV2 VÀ LUỒNG XỬ LÝ ĐA NGƯỜI
    add_outline_heading("4. THIẾT KẾ CHI TIẾT CƠ CHẾ GAME OTTV2 VÀ LUỒNG XỬ LÝ ĐA NGƯỜI", level=1)

    add_outline_heading("4.1. Luật chơi OTTV2 đa người chơi (Bàn đấu 4 - 8 Bot, HP, Bộ thẻ bài hữu hạn)", level=2)
    add_p("Cơ chế trò chơi OTTV2 được chuẩn hóa để vận hành mượt mà trên môi trường lập trình:")
    add_bullet("Quy mô bàn đấu chuẩn: ", "Mỗi bàn thi đấu gồm 4 Bot (hoặc 8 Bot trong vòng sinh tồn chung kết).")
    add_bullet("Điểm Sinh Mệnh (HP): ", "Mỗi Bot bắt đầu với 100 HP. Khi bị đối thủ khắc chế trong một hiệp, Bot bị khấu trừ lượng HP tương ứng. Bot nào bị giảm HP về 0 sẽ bị loại.")
    add_bullet("Hạn ngạch kho thẻ bài: ", "Mỗi Bot được cấp đúng 5 thẻ Kéo, 5 thẻ Búa, 5 thẻ Bao cho tối đa 15 hiệp đấu. Khi đã đánh hết loại thẻ nào, Bot không được quyền ra nước đi đó nữa. Điều này buộc sinh viên phải lập trình thuật toán đếm bài đối thủ.")

    add_outline_heading("4.2. Ma trận tương khắc đồng thời và Cách tính điểm sát thương", level=2)
    add_p("Trong mỗi hiệp đấu, tất cả 4 Bot cùng gửi nước đi ẩn trong khung thời gian 1000ms. Trọng tài phân giải ma trận tương quan giữa tất cả các cặp đấu trên bàn:")
    add_numbered_item("a.", "So sánh từng cặp đấu (Bot i, Bot j): Nếu nước đi của Bot i khắc chế Bot j (Kéo thắng Bao, Bao thắng Búa, Búa thắng Kéo), Bot j bị trừ 15 HP, đồng thời Bot i được ghi nhận 10 điểm tấn công.")
    add_numbered_item("b.", "Quy tắc hòa: Nếu hai Bot ra cùng một loại nước đi, không có sát thương nào được tạo ra giữa hai bên.")
    add_numbered_item("c.", "Hiệu ứng thiểu số đột phá: Nếu trên bàn 4 người, có 3 Bot cùng ra Kéo và chỉ có 1 Bot ra Búa, Bot ra Búa sẽ đồng thời gây sát thương lên cả 3 đối thủ (mỗi đối thủ mất 15 HP), và nhận về 30 điểm tấn công.")

    add_outline_heading("4.3. Luồng xử lý một ván đấu thời gian thực (Match Execution Loop)", level=2)
    add_p("Tiến trình thực thi một ván đấu giữa 4 Bot diễn ra theo vòng lặp tự động cực nhanh (chỉ mất ~1.5 giây cho 15 hiệp):")
    add_bullet("Bước 1: ", "Khởi tạo trạng thái phòng đấu: nạp mã nguồn 4 Bot từ database Supabase, cấp 100 HP và kho thẻ ban đầu.")
    add_bullet("Bước 2: ", "Gửi gói tin trạng thái hiện tại (State Object) tới hàm của 4 Bot.")
    add_bullet("Bước 3: ", "Thu thập nước đi trong ngưỡng 1000ms (nếu Bot nào quá giờ, gán nước đi ngẫu nhiên hợp lệ).")
    add_bullet("Bước 4: ", "Tính toán ma trận tương khắc, trừ HP và cập nhật kho thẻ còn lại.")
    add_bullet("Bước 5: ", "Kiểm tra điều kiện dừng: nếu chỉ còn 1 Bot sống sót hoặc hết 15 hiệp, kết thúc ván đấu và ghi kết quả vào Supabase.")

    add_outline_heading("4.4. Cơ chế Sandbox an toàn, cô lập thực thi và Chống gian lận (Anti-Cheat)", level=2)
    add_p("Để bảo vệ máy chủ Render khi chạy mã nguồn do sinh viên gửi lên từ khắp nơi trên mạng, hệ thống áp dụng cơ chế bảo mật nhẹ nhưng cực kỳ an toàn:")
    add_bullet("Môi trường thực thi giới hạn (Restricted Execution): ", "Mã nguồn Python của sinh viên được nạp và thực thi trong tiến trình con (subprocess/multiprocessing) có vô hiệu hóa các thư viện nguy hiểm (như `os`, `sys`, `shutil`, `socket`).")
    add_bullet("Giới hạn thời gian cứng (Hard Timeout): ", "Mỗi lượt gọi hàm của Bot được bọc trong bộ đếm thời gian nghiêm ngặt (tối đa 1.0 giây). Nếu vượt quá, tiến trình ngắt ngay lập tức và cảnh cáo Bot.")
    add_bullet("Bảo mật quyết định: ", "Các Bot hoàn toàn không thể đọc bộ nhớ của nhau trước khi trọng tài công bố kết quả hiệp đấu.")

    add_outline_heading("4.5. Thiết kế API Endpoints và Giao thức WebSocket cho môi trường Cloud", level=2)
    add_p("Các điểm cuối API được thiết kế tinh gọn theo chuẩn RESTful, chạy qua giao thức HTTPS bảo mật trên Render:")

    t_api = doc.add_table(rows=6, cols=4)
    col_w_api = [Cm(2.5), Cm(5.0), Cm(3.5), Cm(5.0)]
    style_table(t_api, col_w_api)

    api_data = [
        ("Phương thức", "Điểm cuối (Endpoint)", "Giao thức", "Chức năng phục vụ"),
        ("POST", "/api/auth/register", "HTTPS REST", "Đăng ký tài khoản sinh viên và cấp API Key."),
        ("POST", "/api/bots/submit", "HTTPS REST", "Nộp mã nguồn Python của Bot lên máy chủ."),
        ("POST", "/api/simulate", "HTTPS REST", "Chạy thử nghiệm Bot với 3 Bot mẫu trên Web."),
        ("POST", "/api/matches/quick", "HTTPS REST", "Ghép ngẫu nhiên 3 Bot khác để đấu tức thời."),
        ("GET", "/api/ranking", "HTTPS REST", "Lấy dữ liệu Bảng xếp hạng Ranking thời gian thực.")
    ]
    for r_i, r_data in enumerate(api_data):
        row = t_api.rows[r_i]
        for c_i, text in enumerate(r_data):
            cell = row.cells[c_i]
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if c_i in [0, 2] else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            r = p.add_run(text)
            apply_font(r, size=11, bold=(r_i == 0))

    add_outline_heading("4.6. Thiết kế Cơ sở dữ liệu quan hệ (Database Schema)", level=2)
    add_p("Hệ thống sử dụng cơ sở dữ liệu PostgreSQL lưu trữ trên Supabase với 3 bảng chính cực kỳ gọn nhẹ:")
    add_bullet("Bảng Users: ", "`user_id` (UUID), `student_id` (VARCHAR), `full_name` (VARCHAR), `class_name` (VARCHAR), `api_key` (VARCHAR), `created_at` (TIMESTAMP).")
    add_bullet("Bảng Bots: ", "`bot_id` (UUID), `user_id` (UUID), `bot_name` (VARCHAR), `code_content` (TEXT), `elo_score` (INT, mặc định 1000), `matches_played` (INT), `wins` (INT), `is_valid` (BOOLEAN).")
    add_bullet("Bảng Matches: ", "`match_id` (UUID), `round_number` (INT), `bot_ids` (JSONB), `winner_id` (UUID), `scores_json` (JSONB), `executed_at` (TIMESTAMP).")

    add_outline_heading("4.7. Bot SDK mẫu (Python) cực kỳ dễ viết cho sinh viên", level=2)
    add_p("Mã nguồn mẫu chỉ dài khoảng 25 dòng giúp bất kỳ sinh viên nào ở bất kỳ đâu cũng có thể đọc hiểu và lập trình ngay:")

    bot_code = [
        '# File: my_ottv2_bot.py (Tệp mẫu sinh viên nộp)',
        'import random',
        '',
        'def decide_move(game_state):',
        '    """',
        '    game_state là từ điển chứa thông tin bàn đấu 4 người:',
        '    - my_hp: lượng HP hiện tại của bạn (ví dụ: 100)',
        '    - opponents_hp: từ điển HP của 3 đối thủ',
        '    - remaining_cards: số thẻ còn lại {"ROCK": 5, "PAPER": 5, "SCISSORS": 5}',
        '    - history: danh sách các nước đi ở các hiệp trước',
        '    """',
        '    cards = game_state["remaining_cards"]',
        '    # Lọc danh sách các thẻ bài còn số lượng lớn hơn 0',
        '    available = [card for card, count in cards.items() if count > 0]',
        '    if not available:',
        '        return "ROCK"  # Mặc định phòng thủ nếu hết thẻ',
        '',
        '    # Chiến lược phân tích lịch sử: nếu hiệp trước đối thủ hay ra Búa',
        '    if game_state.get("history"):',
        '        last_round = game_state["history"][-1]',
        '        if "ROCK" in last_round and "PAPER" in available:',
        '            return "PAPER"  # Khắc chế Búa của đối thủ',
        '',
        '    # Chiến lược ngẫu nhiên an toàn',
        '    return random.choice(available)'
    ]
    add_code_block(bot_code)

    add_p("", space_before=4, space_after=8)

    # 5. GIẢI PHÁP HẠ TẦNG CLOUD MIỄN PHÍ VÀ KHẢ NĂNG CHỊU TẢI 1.000 NGƯỜI
    add_outline_heading("5. GIẢI PHÁP HẠ TẦNG CLOUD MIỄN PHÍ VÀ KHẢ NĂNG CHỊU TẢI 1.000 NGƯỜI", level=1)

    add_outline_heading("5.1. Lựa chọn hệ sinh thái Cloud miễn phí (Render, Supabase, Vercel)", level=2)
    add_p("Để đáp ứng yêu cầu 'dễ thiết lập, tuần sau code luôn, hoàn toàn miễn phí và sinh viên ở mọi nơi đều truy cập được', dự án lựa chọn tổ hợp công nghệ Cloud Free-tier hàng đầu hiện nay:")

    t_cloud = doc.add_table(rows=4, cols=4)
    col_w_cloud = [Cm(3.0), Cm(3.5), Cm(5.0), Cm(4.5)]
    style_table(t_cloud, col_w_cloud)

    cloud_data = [
        ("Thành phần", "Dịch vụ Cloud", "Hạn ngạch gói miễn phí (Free Tier)", "Ưu điểm triển khai"),
        ("Giao diện Web\n& Dashboard", "Vercel / GitHub Pages", "Miễn phí 100%, băng thông 100GB/tháng,\nkhông giới hạn số lượt truy cập tĩnh.", "Deploy tự động từ GitHub chỉ trong 1 phút,\ncó domain công khai cho 1.000 sinh viên truy cập."),
        ("Máy chủ API\n& Động cơ đấu", "Render.com / Railway", "Miễn phí 750 giờ/tháng, 512MB RAM,\nCPU chia sẻ mượt mà.", "Hỗ trợ Python FastAPI, triển khai trực tiếp\ntừ mã nguồn Git mà không cần cấu hình phức tạp."),
        ("Cơ sở dữ liệu\n& Bảng Ranking", "Supabase\n(PostgreSQL)", "Miễn phí 500MB database, 50.000 MAU,\nhỗ trợ Realtime WebSockets.", "Có sẵn giao diện quản trị Admin cực đẹp,\ntự động sinh API và cập nhật BXH tức thời.")
    ]
    for r_i, r_data in enumerate(cloud_data):
        row = t_cloud.rows[r_i]
        for c_i, text in enumerate(r_data):
            cell = row.cells[c_i]
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if c_i in [0, 1] else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            r = p.add_run(text)
            apply_font(r, size=11, bold=(r_i == 0))

    add_outline_heading("5.2. Hướng dẫn thiết lập chi tiết để sinh viên truy cập từ mọi nơi", level=2)
    add_p("Các bước thiết lập cực kỳ đơn giản giúp người quản trị đưa hệ thống lên mạng trong chưa đầy 1 giờ:")
    add_numbered_item("1.", "Khởi tạo Cơ sở dữ liệu Supabase: Đăng ký tài khoản miễn phí tại supabase.com, tạo Project mới, chạy kịch bản SQL tạo 3 bảng (Users, Bots, Matches) trong vòng 5 phút và sao chép chuỗi kết nối Database URL.")
    add_numbered_item("2.", "Deploy Backend lên Render.com: Tạo Web Service mới trên Render, kết nối với kho lưu trữ GitHub chứa mã nguồn Python FastAPI. Render tự động cài đặt thư viện và cấp cho bạn một địa chỉ HTTPS công khai (ví dụ: `https://ottv2-arena.onrender.com`).")
    add_numbered_item("3.", "Deploy Frontend lên Vercel: Tạo Project trên vercel.com kết nối với thư mục giao diện Web. Vercel tự động cấp địa chỉ Web công khai (ví dụ: `https://ottv2-arena.vercel.app`).")
    add_numbered_item("4.", "Phát hành cho toàn trường: Người quản trị chỉ cần gửi link `https://ottv2-arena.vercel.app` lên nhóm học tập. Bất kỳ sinh viên nào ở nhà hay trường học đều mở link lên để nộp code và theo dõi Bảng Ranking ngay tức thì.")

    add_outline_heading("5.3. Kiến trúc hàng đợi xử lý trận đấu theo đợt (Batch Matchmaking Queue)", level=2)
    add_p("Thách thức lớn nhất khi phục vụ 1.000 sinh viên trên hạ tầng miễn phí là nguy cơ cạn kiệt RAM nếu cho 1.000 Bot chạy đồng thời. Để giải quyết dứt điểm vấn đề này, dự án áp dụng Kiến trúc Hàng đợi phân đợt thông minh:")
    add_bullet("Nguyên lý hoạt động: ", "1.000 Bot được chia thành 250 phòng đấu (4 Bot/phòng). Máy chủ Worker trên Render không chạy 250 phòng cùng lúc mà chia thành các đợt (Batch), mỗi đợt chạy 10 phòng song song.")
    add_bullet("Tối ưu hóa thời gian: ", "Do mỗi ván đấu chỉ là các phép tính so sánh số học và gọi hàm Python nhẹ, một ván 15 hiệp chỉ mất trung bình 0.8 giây. Như vậy, 1 đợt (10 phòng) mất chưa tới 1 giây. Toàn bộ 250 phòng của 1.000 sinh viên sẽ được giải quyết trọn vẹn chỉ trong vòng dưới 25 đến 30 giây!")
    add_bullet("Tiết kiệm bộ nhớ tuyệt đối: ", "Mức tiêu thụ RAM của Render luôn duy trì ở mức 150MB đến 200MB, hoàn toàn nằm trong ngưỡng an toàn 512MB của gói miễn phí.")

    add_outline_heading("5.4. Chiến lược phân bổ tài nguyên và Kịch bản dự phòng Rate Limit", level=2)
    add_p("Các giải pháp kỹ thuật tối ưu hóa mã nguồn máy chủ:")
    add_bullet("Bộ nhớ tạm (In-memory Caching): ", "Mã nguồn của các Bot được lưu trong cơ sở dữ liệu Supabase. Khi đến lượt đấu của phòng nào, máy chủ mới tải mã nguồn của 4 Bot đó vào bộ nhớ, chạy xong ván đấu thì giải phóng RAM ngay lập tức bằng lệnh dọn rác (Garbage Collector).")
    add_bullet("Bộ đệm tĩnh (Static Cache CDN): ", "Trang Bảng Ranking trên Vercel được cấu hình bộ đệm 10 giây (Cache-Control: s-maxage=10). Nghĩa là 1.000 sinh viên tải lại trang cùng lúc thì chỉ có 1 yêu cầu duy nhất được gửi về máy chủ Supabase, 999 yêu cầu còn lại được Vercel phục vụ tức thì.")

    add_p("", space_before=4, space_after=8)

    # 6. KẾ HOẠCH TỔ CHỨC GIẢI ĐẤU VÀ LỘ TRÌNH LẬP TRÌNH 1 TUẦN
    add_outline_heading("6. KẾ HOẠCH TỔ CHỨC GIẢI ĐẤU VÀ LỘ TRÌNH LẬP TRÌNH 1 TUẦN", level=1)

    add_outline_heading("6.1. Thể thức phân bảng và Đấu trường sinh tồn (Battle Royale) cho 1.000 người", level=2)
    add_p("Giải đấu được thiết kế gồm 3 vòng thi đấu mạch lạc, hấp dẫn:")
    add_bullet("Vòng 1 - Vòng Sàng Lọc (1.000 tuyển thủ): ", "Chia thành 250 phòng đấu 4 người. Hai Bot có lượng HP cao nhất mỗi phòng giành quyền đi tiếp (500 Bot vượt qua vòng 1).")
    add_bullet("Vòng 2 - Vòng Phân Hạng (500 tuyển thủ): ", "Chia thành 125 phòng đấu 4 người. Lấy 2 Bot đứng đầu mỗi phòng (250 Bot) và tiếp tục sàng lọc qua 2 lượt đấu nhanh để chọn ra 16 Bot xuất sắc nhất toàn trường.")
    add_bullet("Vòng 3 - Vòng Chung Kết Sinh Tồn (Top 16 Tuyển Thủ): ", "16 Bot được chia vào 2 phòng đấu 8 người thi đấu chế độ Đấu trường Sinh tồn (Battle Royale). 4 Bot sống sót cuối cùng của 2 phòng hội tụ trong Trận Chung Kết Tổng (Grand Finals) 8 người để tìm ra Quán quân.")

    add_outline_heading("6.2. Thuật toán tính điểm xếp hạng Elo và Tie-break", level=2)
    add_p("Thuật toán xếp hạng Elo đa người chơi được chuẩn hóa bằng công thức toán học rõ ràng:")
    add_p("Kỳ vọng thắng của Bot A trước từng đối thủ B trong phòng đấu:", space_before=2, space_after=2)
    add_p("E(A, B) = 1 / [1 + 10 ^ ((R_B - R_A) / 400)]", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=2, space_after=2, bold=True, size=11)
    
    add_p("Kỳ vọng tổng thể trong phòng N người:", space_before=2, space_after=2)
    add_p("E_total(A) = Tổng[E(A, i)] / (N - 1)", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=2, space_after=2, bold=True, size=11)

    add_p("Cập nhật điểm Elo sau ván đấu:", space_before=2, space_after=2)
    add_p("R'(A) = R(A) + K * [S_actual(A) - E_total(A)]", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=2, space_after=4, bold=True, size=11)

    add_p("Trong đó, S_actual(A) nhận giá trị thứ hạng tương ứng (Hạng 1: 1.0; Hạng 2: 0.66; Hạng 3: 0.33; Hạng 4: 0.0); K = 32.")

    add_p("Chỉ số phụ (Tie-break) khi bằng điểm Elo:", space_before=2, space_after=2)
    add_numbered_item("1.", "Tổng lượng sát thương gây ra cho các đối thủ trong suốt giải đấu.")
    add_numbered_item("2.", "Hiệu số HP còn lại tại thời điểm kết thúc ván đấu.")
    add_numbered_item("3.", "Số lần kích hoạt nước đi thiểu số lật kèo thành công.")

    add_outline_heading("6.3. Quy định xử lý lỗi quá thời gian (Timeout), mất kết nối và hòa ván đấu", level=2)
    add_p("Quy tắc tài phán tự động giúp giải đấu không bị gián đoạn:")
    add_bullet("Xử lý Timeout: ", "Nếu hàm của Bot chạy quá 1000ms, hệ thống tự động gán nước đi ngẫu nhiên từ kho thẻ còn lại. Nếu vi phạm quá 3 hiệp trong một ván đấu, Bot bị xử thua ván đó.")
    add_bullet("Xử lý cú pháp lỗi (Code Crash): ", "Nếu mã nguồn của sinh viên bị lỗi chia cho 0 hoặc lỗi ngoại lệ (Exception), Bot bị tính thua hiệp đó và ghi nhận lỗi vào bảng nhật ký để sinh viên kiểm tra.")

    add_outline_heading("6.4. Kế hoạch lập trình nước rút 7 ngày (1-Week Sprint Timeline)", level=2)
    add_p("Lộ trình chi tiết từng ngày để nhóm tác giả hoàn thành mã nguồn đưa lên Render:")

    t_sprint = doc.add_table(rows=8, cols=3)
    col_w_sprint = [Cm(2.5), Cm(6.5), Cm(7.0)]
    style_table(t_sprint, col_w_sprint)

    sprint_data = [
        ("Thời gian", "Nội dung công việc lập trình", "Kết quả đầu ra cụ thể"),
        ("Ngày 1", "Khởi tạo Repository GitHub, cấu hình Supabase\nvà viết hàm logic trọng tài OTTV2 đa người", "Module `ottv2_engine.py` hoàn thành,\nchạy đúng logic ma trận tương khắc."),
        ("Ngày 2", "Xây dựng Backend FastAPI: API nộp code,\nAPI đăng ký sinh viên và hàm chạy Sandbox", "Backend API chạy được trên Localhost,\nkiểm thử nộp code thành công."),
        ("Ngày 3", "Lập trình thuật toán ghép phòng đấu (Matchmaker)\nvà Hàng đợi chạy theo đợt (Batch Queue)", "Worker tự động chạy 10 phòng song song,\nxử lý xong 40 Bot trong 1 giây."),
        ("Ngày 4", "Xây dựng Giao diện Web (HTML/JS/Tailwind):\nTrang chủ, Form nộp code, Trình mô phỏng ván đấu", "Giao diện Web trực quan, sinh viên\ncó thể test Bot trực tiếp trên trình duyệt."),
        ("Ngày 5", "Tích hợp Bảng xếp hạng Ranking thời gian thực\nvà kết nối luồng dữ liệu Supabase Realtime", "Bảng Ranking hiển thị điểm Elo, tự động\nnhảy số khi ván đấu hoàn tất."),
        ("Ngày 6", "Triển khai hệ thống lên Cloud miễn phí\n(Backend lên Render, Frontend lên Vercel)", "Hệ thống có địa chỉ URL công khai,\nsẵn sàng cho sinh viên ở mọi nơi truy cập."),
        ("Ngày 7", "Chạy thử nghiệm tải với 1.000 Bot giả lập,\nviết tài liệu hướng dẫn và phát hành Bot SDK", "Hệ thống vận hành trơn tru 100%,\nchính thức mở cổng cho sinh viên nộp bài.")
    ]
    for r_i, r_data in enumerate(sprint_data):
        row = t_sprint.rows[r_i]
        for c_i, text in enumerate(r_data):
            cell = row.cells[c_i]
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if c_i == 0 else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            r = p.add_run(text)
            apply_font(r, size=11, bold=(r_i == 0))

    add_p("", space_before=4, space_after=8)

    # 7. KẾ HOẠCH TRIỂN KHAI, KIỂM THỬ VÀ KẾT LUẬN
    add_outline_heading("7. KẾ HOẠCH TRIỂN KHAI, KIỂM THỬ VÀ KẾT LUẬN", level=1)

    add_outline_heading("7.1. Kế hoạch kiểm thử hệ thống (Unit Test, Stress Test 1.000 Bot giả lập)", level=2)
    add_p("Trước ngày mở cổng chính thức, hệ thống trải qua 3 cấp độ kiểm nghiệm:")
    add_bullet("Kiểm thử Đơn vị (Unit Testing): ", "Chạy 1.000 ca kiểm thử các tổ hợp ra đòn của 4 Bot, bảo đảm việc tính điểm sát thương và khấu trừ HP chính xác tuyệt đối theo quy tắc.")
    add_bullet("Kiểm thử Tải áp lực (Stress Testing 1.000 Bot): ", "Tạo một kịch bản sinh tự động 1.000 Bot ngẫu nhiên trong cơ sở dữ liệu. Kích hoạt động cơ Batch Matchmaker để chạy toàn bộ 250 phòng đấu. Đo lường thời gian hoàn thành (mục tiêu dưới 60 giây) và kiểm tra mức chiếm dụng RAM trên Render (mục tiêu dưới 250MB).")
    add_bullet("Kiểm thử An toàn mã nguồn: ", "Thử nghiệm nộp các Bot cố tình gọi vòng lặp vô hạn `while True` hoặc gọi thư viện mạng trái phép, bảo đảm Sandbox ngắt tiến trình an toàn trong 1 giây mà không ảnh hưởng tới các ván đấu khác.")

    add_outline_heading("7.2. Đánh giá tính khả thi và Tiềm năng mở rộng của dự án", level=2)
    add_p("Bản kế hoạch hành động này đã giải quyết triệt để và thực tế toàn bộ yêu cầu của đề bài Bài tập 3 - Kết hợp:")
    add_bullet("Tính khả thi thực tiễn cao: ", "Kế hoạch không đưa ra các yêu cầu viển vông mà dựa hoàn toàn trên các công cụ Cloud miễn phí (Render, Supabase, Vercel), cấu hình đơn giản và phù hợp tuyệt đối cho một đợt lập trình nước rút 7 ngày.")
    add_bullet("Giải quyết trọn vẹn bài toán quy mô lớn từ xa: ", "Kiến trúc Hàng đợi phân đợt cho phép 1.000 sinh viên ở khắp mọi nơi có thể truy cập Web nộp code, thi đấu mượt mà, có bảng Ranking thời gian thực và trải nghiệm người dùng thân thiện.")
    add_bullet("Tiềm năng ứng dụng lâu dài: ", "Sau khi hoàn thành đợt thi đấu môn học, nền tảng có thể tiếp tục được sử dụng làm sân chơi học thuật định kỳ của khoa, dễ dàng mở rộng sang các tựa game trí tuệ đối kháng lập trình khác như Cờ vây, Cờ caro, Đua xe chiến thuật bằng code.")

    # Khung chữ ký phê duyệt
    add_p("", space_before=15, space_after=10)
    t_sig = doc.add_table(rows=1, cols=2)
    t_sig.alignment = WD_TABLE_ALIGNMENT.CENTER
    col_w_sig = [Cm(8.0), Cm(8.0)]
    for cell in t_sig.rows[0].cells:
        tcPr = cell._tc.get_or_add_tcPr()
        tcMar = parse_xml(
            f'<w:tcMar {nsdecls("w")}>\n'
            f'  <w:top w:w="80" w:type="dxa"/>\n'
            f'  <w:bottom w:w="80" w:type="dxa"/>\n'
            f'  <w:left w:w="100" w:type="dxa"/>\n'
            f'  <w:right w:w="100" w:type="dxa"/>\n'
            f'</w:tcMar>'
        )
        tcPr.append(tcMar)

    p_s0 = t_sig.rows[0].cells[0].paragraphs[0]
    p_s0.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p_s0.add_run("TRƯỞNG NHÓM PHÁT TRIỂN & QUẢN TRỊ DỰ ÁN\n")
    apply_font(r, size=11, bold=True)
    r_sub0 = p_s0.add_run("(Ký và ghi rõ họ tên)\n\n\n\n\n")
    apply_font(r_sub0, size=10, italic=True)
    r_name0 = p_s0.add_run("Nhóm Sinh viên Quản lý Hệ thống")
    apply_font(r_name0, size=11, bold=True)

    p_s1 = t_sig.rows[0].cells[1].paragraphs[0]
    p_s1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p_s1.add_run("XÁC NHẬN CỦA GIẢNG VIÊN HƯỚNG DẪN\n")
    apply_font(r, size=11, bold=True)
    r_sub1 = p_s1.add_run("(Ký và đánh giá điểm số)\n\n\n\n\n")
    apply_font(r_sub1, size=10, italic=True)
    r_name1 = p_s1.add_run("Bộ môn Kỹ thuật Phần mềm")
    apply_font(r_name1, size=11, bold=True)

    # Save to file
    target_name = "Ke_Hoach_Du_An_Game_OTTV2_Cloud_Render_1000User.docx"
    doc.save(target_name)
    print(f"SUCCESS: Saved {target_name}")

if __name__ == "__main__":
    generate_remote_cloud_report()

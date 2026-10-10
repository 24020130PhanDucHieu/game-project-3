# -*- coding: utf-8 -*-
"""
Script to generate the refined, professional Project Plan Report:
"BÁO CÁO KẾ HOẠCH DỰ ÁN: THIẾT KẾ VÀ TỔ CHỨC GIẢI ĐẤU GAME OẲN TÙ TÌ V2 (OTTV2) ĐA NGƯỜI CHƠI BẰNG CODE"
Addressing all user feedback:
1. Fix awkward text stretching (NO \n inside JUSTIFY paragraphs).
2. Clean up mathematical notation (NO raw LaTeX $ signs).
3. Remove arbitrary hard page breaks inside sections to avoid orphan lines or half-empty pages.
4. Strongly emphasize the MULTIPLAYER gameplay (chơi nhiều người: 4-8 người/bàn, Battle Royale, ma trận tương khắc đa phương).
5. Ensure authentic Project Planning Report format (Kế hoạch tiến độ, nhân sự, kinh phí, giải đấu, kỹ thuật).
6. Times New Roman throughout, 100% black text, no colored text.
7. Word Outline Levels (Navigation Pane matching user's Image 2).
8. Target page length: around 15-16 pages naturally filled without gaps.
"""

import docx
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn, nsdecls

def build_perfect_document():
    doc = docx.Document()

    # 1. Page Setup - A4 format, standard administrative margins
    for section in doc.sections:
        section.top_margin = Cm(2.0)
        section.bottom_margin = Cm(2.0)
        section.left_margin = Cm(3.0)
        section.right_margin = Cm(2.0)
        section.page_width = Cm(21.0)
        section.page_height = Cm(29.7)

    # 2. Configure Normal Style - Times New Roman 12pt Black
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

    # Heading generator with explicit Word Outline Levels
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
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT  # NEVER JUSTIFY single numbered lines to avoid giant spaces!
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
        # Keeps code block from splitting awkwardly
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
    hr = hp.add_run("Báo cáo Kế hoạch Dự án: Game OTTV2 Đa Người Chơi & Giải Đấu Lập Trình")
    apply_font(hr, size=9, italic=True)

    footer = doc.sections[0].footer
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fr = fp.add_run("Bài tập 3 - Kết hợp: Version 1 & Version 2 | Lưu hành Nội bộ")
    apply_font(fr, size=9, italic=True)

    # =========================================================================
    # TRANG 1: TRANG BÌA (COVER PAGE)
    # =========================================================================
    add_p("BỘ GIÁO DỤC VÀ ĐÀO TẠO", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=15, space_after=2, size=12, bold=True)
    add_p("TRƯỜNG ĐẠI HỌC CÔNG NGHỆ - ĐHQGHN", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=4, size=12, bold=True)
    add_p("KHOA CÔNG NGHỆ THÔNG TIN", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=25, size=11, bold=True)

    add_p("---***---", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=35, size=12)

    add_p("BÁO CÁO KẾ HOẠCH DỰ ÁN", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=8, size=14, bold=True)
    add_p("BÀI TẬP 3 - KẾT HỢP", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=18, size=16, bold=True)

    add_p("ĐỀ ÁN THIẾT KẾ TRÒ CHƠI OẲN TÙ TÌ V2 (OTTV2)\nCHẾ ĐỘ NHIỀU NGƯỜI CHƠI (MULTIPLAYER)\nVÀ KẾ HOẠCH TỔ CHỨC GIẢI ĐẤU THI ĐẤU BẰNG CODE", 
          align=WD_ALIGN_PARAGRAPH.CENTER, space_before=8, space_after=16, size=18, bold=True)

    add_p("HỌC PHẦN: PHÁT TRIỂN ỨNG DỤNG VÀ THUẬT TOÁN NÂNG CAO\n"
          "Bao gồm: Version 1 (Yêu cầu, thiết kế sơ bộ) & Version 2 (Bản đầy đủ)", 
          align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=45, size=12, italic=True)

    t_cov = doc.add_table(rows=5, cols=2)
    t_cov.alignment = WD_TABLE_ALIGNMENT.CENTER
    for r_i, (k, v) in enumerate([
        ("Đơn vị đề xuất:", "Nhóm Phát triển Dự án Trò chơi & Giải đấu Lập trình"),
        ("Tên dự án:", "Game OTTV2 Multiplayer & Giải đấu Bot Arena"),
        ("Giảng viên hướng dẫn:", "Bộ môn Kỹ thuật Phần mềm"),
        ("Thành viên thực hiện:", "Nhóm Sinh viên Nghiên cứu & Phát triển"),
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

    add_p("Báo cáo này trình bày đề án kế hoạch toàn diện cho việc thiết kế, xây dựng trò chơi Oẳn Tù Tì V2 (OTTV2) ở chế độ nhiều người chơi (Multiplayer) và lập kế hoạch tổ chức giải đấu thi đấu bằng mã nguồn (code), đáp ứng yêu cầu của Bài tập 3 - Kết hợp. Tài liệu được cấu trúc liên kết chặt chẽ giữa hai giai đoạn: Version 1 (Xác định các yêu cầu chức năng, phi chức năng và thiết kế sơ bộ) và Version 2 (Bản thiết kế kỹ thuật đầy đủ, quy trình nghiệp vụ Quản trị viên - Thí sinh, hạ tầng phòng đấu, cơ chế bảo mật Sandbox và kế hoạch vận hành giải đấu).")

    add_p("Trò chơi Oẳn Tù Tì truyền thống (Kéo - Búa - Bao) vốn chỉ dành cho hai người và mang tính ngẫu nhiên cao. Phiên bản OTTV2 được nâng cấp mạnh mẽ để hỗ trợ đồng thời từ 4 đến 8 người chơi (hoặc Bot) trong cùng một phòng đấu. Trò chơi tích hợp cơ chế Điểm sinh mệnh (HP), hạn ngạch thẻ bài hữu hạn, tích lũy năng lượng và đặc biệt là ma trận tương khắc đa phương (Simultaneous Multi-action Matrix). Người tham gia không chơi bằng tay thủ công mà lập trình thuật toán tự hành (Bot) để giao tiếp với máy chủ đấu trường qua giao thức WebSocket/API thời gian thực.")

    add_p("Kế hoạch tổ chức giải đấu được xây dựng bài bản với lộ trình 4 giai đoạn, thể thức thi đấu vòng bảng và đấu trường sinh tồn (Battle Royale), cơ chế tính điểm xếp hạng Elo mở rộng cho nhiều người, quy trình xử lý sự cố kỹ thuật và dự trù ngân sách minh bạch. Toàn bộ tài liệu được soạn thảo với văn phong kỹ thuật thận trọng, khách quan, không áp đặt các chỉ tiêu mang tính tuyệt đối hay cứng nhắc, bảo đảm tính khả thi thực tế cao nhất.")

    t_sum = doc.add_table(rows=7, cols=2)
    col_w_sum = [Cm(4.5), Cm(11.5)]
    style_table(t_sum, col_w_sum)

    sum_rows = [
        ("Chỉ số kế hoạch", "Nội dung đặc tả chi tiết"),
        ("Tên dự án", "Đề án Phát triển Game OTTV2 Multiplayer và Giải đấu Bot Arena"),
        ("Hình thức thi đấu", "100% tự động hóa bằng mã nguồn (Bot thi đấu qua API/WebSocket)"),
        ("Quy mô phòng đấu", "Chế độ hỗn chiến 4 đến 8 Bot đồng thời trên cùng một sàn đấu"),
        ("Cơ chế phân giải", "Ma trận tương khắc đa chiều, trừ HP đa phương theo nhịp đếm 1000ms"),
        ("Quy mô giải đấu", "Dự kiến 32 đến 64 thí sinh, chia 8 - 16 bảng đấu và vòng chung kết"),
        ("Môi trường thực thi", "Container Docker cô lập tài nguyên, giám sát máy chủ và chống gian lận")
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
        ("1. TỔNG QUAN HỆ THỐNG VÀ KẾ HOẠCH DỰ ÁN", "Trang 4", 1),
        ("   1.1. Mục đích và Phạm vi tài liệu", "Trang 4", 2),
        ("   1.2. Bối cảnh dự án và Nhu cầu game OTTV2 nhiều người chơi", "Trang 4", 2),
        ("   1.3. Phân quyền và Đối tượng sử dụng", "Trang 5", 2),
        ("   1.4. Lộ trình kế hoạch: Version 1 (Sơ bộ) và Version 2 (Đầy đủ)", "Trang 5", 2),
        ("2. QUY TRÌNH NGHIỆP VỤ CỦA QUẢN TRỊ VIÊN (ADMIN)", "Trang 6", 1),
        ("   2.1. Bước 1: Khởi tạo phòng đấu và Cấu hình thông số OTTV2", "Trang 6", 2),
        ("   2.2. Bước 2: Quản lý Thí sinh và Thẩm định Bot dự thi", "Trang 6", 2),
        ("   2.3. Bước 3: Lập lịch và Cấu hình thể thức giải đấu", "Trang 7", 2),
        ("   2.4. Bước 4: Vận hành Phiên thi đấu thời gian thực", "Trang 7", 2),
        ("   2.5. Bước 5: Báo cáo, Thống kê và Xếp hạng giải đấu", "Trang 7", 2),
        ("   2.6. Bước 6: Cài đặt hệ thống và Giám sát máy chủ", "Trang 8", 2),
        ("3. QUY TRÌNH NGHIỆP VỤ CỦA NGƯỜI CHƠI / LẬP TRÌNH VIÊN (USER)", "Trang 8", 1),
        ("   3.1. Đăng ký tài khoản và Quản lý API Key", "Trang 8", 2),
        ("   3.2. Tải Bot SDK và Phát triển thuật toán đối kháng đa người", "Trang 9", 2),
        ("   3.3. Kiểm thử Bot trong môi trường Sandbox", "Trang 9", 2),
        ("   3.4. Nộp Bot vào Đấu trường và Theo dõi trực tiếp", "Trang 9", 2),
        ("4. THIẾT KẾ CHI TIẾT CƠ CHẾ GAME OTTV2 NHIỀU NGƯỜI VÀ LUỒNG XỬ LÝ", "Trang 10", 1),
        ("   4.1. Kiến trúc hệ thống phòng đấu nhiều người chơi (Multiplayer Lobby)", "Trang 10", 2),
        ("   4.2. Cơ chế luật chơi OTTV2 đa người và Ma trận tương khắc đồng thời", "Trang 10", 2),
        ("   4.3. Luồng xử lý một ván đấu OTTV2 nhiều người theo thời gian thực", "Trang 11", 2),
        ("   4.4. Cơ chế cách ly và Bảo mật thực thi mã nguồn Bot (Sandbox)", "Trang 11", 2),
        ("   4.5. Thiết kế Giao tiếp API và WebSocket cho phòng đấu đa người", "Trang 12", 2),
        ("   4.6. Thiết kế Cơ sở dữ liệu quan hệ (Database Schema)", "Trang 12", 2),
        ("   4.7. Bot SDK và Thuật toán Bot mẫu chơi nhiều người", "Trang 13", 2),
        ("5. KẾ HOẠCH TỔ CHỨC GIẢI ĐẤU VÀ THỂ THỨC THI ĐẤU", "Trang 13", 1),
        ("   5.1. Thể thức thi đấu giải đấu (Vòng bảng & Đấu trường sinh tồn)", "Trang 13", 2),
        ("   5.2. Thuật toán xếp hạng Elo mở rộng cho nhiều người chơi", "Trang 14", 2),
        ("   5.3. Quy định xử lý hòa, mất kết nối mạng và Quá thời gian (Timeout)", "Trang 14", 2),
        ("   5.4. Cơ cấu giải thưởng và Dự trù kinh phí tổ chức", "Trang 15", 2),
        ("6. CÁC BƯỚC TRIỂN KHAI, VẬN HÀNH VÀ KIỂM THỬ HỆ THỐNG", "Trang 15", 1),
        ("   6.1. Triển khai Nền tảng hạ tầng và Máy chủ điều phối", "Trang 15", 2),
        ("   6.2. Khởi tạo Cơ sở dữ liệu và Dịch vụ hàng đợi", "Trang 15", 2),
        ("   6.3. Kế hoạch kiểm thử hệ thống (Unit, Stress đa người, Anti-Cheat)", "Trang 16", 2),
        ("   6.4. Ma trận nhận diện rủi ro và Phương án dự phòng kỹ thuật", "Trang 16", 2),
        ("7. KẾT LUẬN VÀ KIẾN NGHỊ TRIỂN KHAI", "Trang 16", 1),
        ("   7.1. Đánh giá tính khả thi và Giá trị ứng dụng của dự án", "Trang 16", 2),
        ("   7.2. Kế hoạch mở rộng và Phát triển trong các giai đoạn tiếp theo", "Trang 17", 2)
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
    # NỘI DUNG CHÍNH: DÒNG CHẢY TỰ NHIÊN, KHÔNG NGẮT TRANG BỪA BÃI
    # =========================================================================

    # 1. TỔNG QUAN HỆ THỐNG VÀ KẾ HOẠCH DỰ ÁN
    add_outline_heading("1. TỔNG QUAN HỆ THỐNG VÀ KẾ HOẠCH DỰ ÁN", level=1)

    add_outline_heading("1.1. Mục đích và Phạm vi tài liệu", level=2)
    add_p("Tài liệu này được biên soạn nhằm phục vụ công tác lập kế hoạch, đặc tả kiến trúc kỹ thuật và xây dựng lộ trình tổ chức giải đấu cho Dự án Lập trình Đấu trường OanTuTi V2 (OTTV2 Arena). Bản kế hoạch là sản phẩm tổng hợp hoàn thiện đáp ứng yêu cầu của Bài tập 3 - Kết hợp, kết nối mạch lạc giữa hai cấu phần then chốt:")
    add_bullet("Version 1 (Yêu cầu và Thiết kế sơ bộ): ", "Xác định rõ ràng mục tiêu bài toán, phân tích các yêu cầu chức năng và phi chức năng cơ sở, phác thảo các quy tắc mở rộng của trò chơi OanTuTi và xây dựng mô hình trao đổi dữ liệu sơ bộ giữa người chơi và máy chủ.")
    add_bullet("Version 2 (Bản thiết kế và Kế hoạch đầy đủ): ", "Đi sâu vào kiến trúc chi tiết của hệ thống phòng đấu đa người chơi, quy trình làm việc chuẩn hóa của Quản trị viên và Lập trình viên, thiết kế API/WebSocket, cơ chế bảo mật Sandbox, thể thức thi đấu giải đấu nhiều người, thuật toán xếp hạng và phương án vận hành, kiểm thử thực tế.")

    add_outline_heading("1.2. Bối cảnh dự án và Nhu cầu game OTTV2 nhiều người chơi", level=2)
    add_p("Trò chơi OanTuTi (Kéo - Búa - Bao) dân gian tuy quen thuộc nhưng tồn tại hạn chế lớn khi áp dụng vào môi trường giáo dục công nghệ: trò chơi chỉ hỗ trợ 2 người đối kháng, ván đấu mang tính ngẫu nhiên cao và khó tổ chức giải đấu quy mô lớn một cách tự động.")
    add_p("Việc nâng cấp lên phiên bản OTTV2 chơi với nhiều người (Multiplayer) giải quyết triệt để các hạn chế trên:")
    add_bullet("Mở rộng quy mô người chơi: ", "Cho phép từ 4 đến 8 người chơi (hoặc Bot) cùng tham gia tranh tài trong một phòng đấu đồng thời, tạo ra tính cạnh tranh sôi nổi và kịch tính.")
    add_bullet("Nâng tầm chiều sâu chiến thuật: ", "Bổ sung thanh máu (HP), giới hạn số lượng thẻ bài Kéo - Búa - Bao, cơ chế tích lũy năng lượng và ma trận tương khắc đa phương. Người chơi không thể chỉ dựa vào may mắn mà phải tính toán phân bổ thẻ bài và phán đoán ý đồ của số đông đối thủ trên bàn đấu.")
    add_bullet("Tự động hóa hoàn toàn bằng mã nguồn: ", "Mỗi người tham gia sẽ đóng vai trò là một kỹ sư phát triển thuật toán Bot. Máy chủ đóng vai trò trọng tài số tự động, tiếp nhận quyết định qua mạng, xử lý kết quả trong thời gian thực và cập nhật bảng xếp hạng minh bạch.")

    add_outline_heading("1.3. Phân quyền và Đối tượng sử dụng", level=2)
    add_p("Hệ thống được thiết kế hướng tới việc phân tách rành mạch hai nhóm đối tượng tác nhân nhằm bảo đảm an toàn dữ liệu và tính công bằng tuyệt đối trong thi đấu:")

    t_roles = doc.add_table(rows=3, cols=3)
    col_w_roles = [Cm(3.5), Cm(4.5), Cm(8.0)]
    style_table(t_roles, col_w_roles)

    roles_data = [
        ("Nhóm tác nhân", "Vai trò và Phân quyền", "Hành vi và Trách nhiệm nghiệp vụ chính"),
        ("Quản trị viên\n(Admin / Trọng tài)", "Toàn quyền hệ thống\n(System Administrator)", "Khởi tạo giải đấu, cấu hình thông số phòng đấu OTTV2, quản lý danh sách thí sinh, thẩm định và phê duyệt Bot, kích hoạt phiên thi đấu, giám sát máy chủ và trích xuất báo cáo kết quả."),
        ("Lập trình viên\n(User / Thí sinh)", "Quyền người dùng chuẩn\n(Participant Developer)", "Đăng ký tài khoản, quản lý khóa bảo mật API Key, tải bộ công cụ Bot SDK, phát triển thuật toán, chạy thử nghiệm trong môi trường Sandbox, nộp Bot và theo dõi trực tiếp các trận đấu.")
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
    add_p("Đề án được hoạch định theo tiến trình phát triển lũy tiến, đảm bảo từng mốc bàn giao đều có khả năng kiểm thử độc lập trước khi mở rộng quy mô:")

    t_ver = doc.add_table(rows=5, cols=3)
    col_w_ver = [Cm(3.5), Cm(6.0), Cm(6.5)]
    style_table(t_ver, col_w_ver)

    ver_data = [
        ("Tiêu chí phân kỳ", "Version 1 - Yêu cầu & Thiết kế sơ bộ", "Version 2 - Bản đầy đủ hoàn thiện"),
        ("Quy mô tương tác", "Tập trung thử nghiệm phòng đối kháng 1v1 để chuẩn hóa giao thức cốt lõi.", "Hỗ trợ đầy đủ phòng đấu đa người chơi (4 đến 8 Bot) và cơ chế phân bảng giải đấu."),
        ("Động cơ trọng tài", "So sánh tương khắc đơn giản, trừ HP cơ bản theo hiệp đấu cục bộ.", "Ma trận tương khắc đa chiều đồng thời, tính điểm combo và xử lý kỹ năng bổ trợ."),
        ("Môi trường nộp Bot", "Thực thi kịch bản script cục bộ qua tệp tin hoặc kết nối API đơn giản.", "Môi trường Sandbox container hóa cô lập tài nguyên, giám sát an toàn mã nguồn."),
        ("Hạ tầng và Dữ liệu", "Ghi nhận nhật ký ván đấu qua tệp cấu trúc JSON/CSV cơ sở.", "Cơ sở dữ liệu quan hệ PostgreSQL chuẩn hóa 3NF kết hợp hàng đợi Redis thời gian thực.")
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

    add_p("Quy trình điều hành của Quản trị viên (Admin) được thiết kế thành một chuỗi 6 bước khép kín, phản ánh trung thực quy trình tổ chức một giải đấu lập trình công nghệ chuyên nghiệp:")

    add_outline_heading("2.1. Bước 1: Khởi tạo phòng đấu và Cấu hình thông số OTTV2", level=2)
    add_p("Quản trị viên đăng nhập vào hệ thống bằng tài khoản bảo mật cấp cao và truy cập trang quản trị giải đấu. Tại đây, quản trị viên tiến hành khởi tạo giải đấu mới và thiết lập các thông số luật chơi cho phòng đấu OTTV2:")
    add_bullet("Thiết lập chế độ phòng: ", "Lựa chọn chế độ thi đấu Đa người chơi (Multiplayer Arena 4 - 8 người) hoặc chế độ Đối kháng 1v1 theo từng vòng.")
    add_bullet("Cấu hình tài nguyên trận đấu: ", "Quy định mức HP ban đầu (ví dụ: 100 HP), số lượng thẻ Kéo - Búa - Bao cấp phát trong kho bài của mỗi Bot (ví dụ: 5 Kéo, 5 Búa, 5 Bao cho 15 hiệp).")
    add_bullet("Giới hạn thời gian phản hồi: ", "Cài đặt thời gian Timeout cho mỗi lượt ra quyết định (mặc định 1000ms), bảo đảm các ván đấu diễn ra đúng tiến độ đã lập.")

    add_outline_heading("2.2. Bước 2: Quản lý Thí sinh và Thẩm định Bot dự thi", level=2)
    add_p("Trước khi giải đấu khởi tranh, ban tổ chức thực hiện khâu rà soát và thẩm định hồ sơ kỹ thuật:")
    add_bullet("Kiểm tra danh sách đăng ký: ", "Xác nhận danh tính thí sinh, phân loại bảng đấu và cấp mã định danh tuyển thủ.")
    add_bullet("Thẩm định kỹ thuật tự động: ", "Kích hoạt tiến trình quét mã nguồn Bot trong môi trường kiểm thử sơ bộ nhằm phát hiện các hành vi nguy hiểm (như đọc tệp tin hệ thống, mở kết nối mạng ra bên ngoài) và kiểm tra khả năng phản hồi đúng định dạng JSON chuẩn.")
    add_bullet("Phê duyệt trạng thái: ", "Chuyển trạng thái Bot sang 'Hợp lệ' (Approved) hoặc gửi thông báo yêu cầu thí sinh chỉnh sửa nếu phát hiện lỗi cú pháp.")

    add_outline_heading("2.3. Bước 3: Lập lịch và Cấu hình thể thức giải đấu", level=2)
    add_p("Quản trị viên xác lập sơ đồ thi đấu tổng thể:")
    add_bullet("Phân bảng thi đấu: ", "Hệ thống tự động bốc thăm chia các Bot vào các bảng đấu (mỗi bảng gồm 4 Bot thi đấu hỗn chiến tính điểm).")
    add_bullet("Lập thời gian biểu: ", "Quy định khung giờ bắt đầu của từng bảng đấu, phân bổ tài nguyên máy chủ Worker nhằm tránh hiện tượng nghẽn tải cục bộ.")

    add_outline_heading("2.4. Bước 4: Vận hành Phiên thi đấu thời gian thực", level=2)
    add_p("Vào thời điểm thi đấu, quản trị viên kích hoạt phiên đấu và thực thi quyền giám sát trọng tài:")
    add_bullet("Theo dõi tình trạng kết nối: ", "Bảng điều khiển trực quan hiển thị trạng thái của từng Bot trong phòng (Sẵn sàng, Đang gửi lệnh, Mất kết nối, Quá giờ).")
    add_bullet("Can thiệp sự cố khẩn cấp: ", "Quản trị viên có các nút chức năng can thiệp trực tiếp: Tạm dừng trận đấu (Pause), Cho phép đấu lại hiệp nếu có sự cố máy chủ (Replay Round), hoặc Xử thua kỹ thuật đối với Bot vi phạm nghiêm trọng.")

    add_outline_heading("2.5. Bước 5: Báo cáo, Thống kê và Xếp hạng giải đấu", level=2)
    add_p("Khi các ván đấu khép lại, hệ thống tự động xử lý số liệu thống kê:")
    add_bullet("Xuất bảng xếp hạng (Leaderboard): ", "Hiển thị thứ hạng chung cuộc, điểm Elo cập nhật, số trận thắng - hòa - thua và tổng lượng HP tiêu hao.")
    add_bullet("Báo cáo phân tích chuyên sâu: ", "Cung cấp biểu đồ phân tích về xu hướng lựa chọn nước đi (tỷ lệ ra Kéo, Búa, Bao của từng tuyển thủ), hỗ trợ giảng viên đánh giá tư duy thuật toán của sinh viên.")

    add_outline_heading("2.6. Bước 6: Cài đặt hệ thống và Giám sát máy chủ", level=2)
    add_p("Quản trị viên theo dõi các chỉ số vận hành của toàn bộ hạ tầng kỹ thuật:")
    add_bullet("Giám sát tài nguyên: ", "Theo dõi biểu đồ sử dụng CPU, dung lượng bộ nhớ RAM và băng thông mạng của các máy chủ Worker.")
    add_bullet("Sao lưu và Quản lý bảo mật: ", "Thực hiện sao lưu cơ sở dữ liệu định kỳ, thu hồi hoặc cấp mới các mã khóa API Key của thí sinh.")

    add_p("", space_before=4, space_after=8)

    # 3. QUY TRÌNH NGHIỆP VỤ CỦA NGƯỜI CHƠI (USER / DEVELOPER)
    add_outline_heading("3. QUY TRÌNH NGHIỆP VỤ CỦA NGƯỜI CHƠI / LẬP TRÌNH VIÊN (USER)", level=1)

    add_p("Quy trình tham gia của thí sinh (sinh viên / lập trình viên) được thiết kế trực quan, tập trung vào trải nghiệm phát triển thuật toán:")

    add_outline_heading("3.1. Đăng ký tài khoản và Quản lý API Key", level=2)
    add_p("Thí sinh đăng nhập cổng thông tin giải đấu để khởi tạo danh tính lập trình viên:")
    add_bullet("Đăng ký hồ sơ: ", "Khai báo thông tin cá nhân/nhóm và lựa chọn ngôn ngữ lập trình chủ đạo (Python, JavaScript hoặc C++).")
    add_bullet("Nhận khóa truy cập API Key: ", "Hệ thống cấp một cặp mã khóa định danh (Client ID & Secret Token) phục vụ việc chứng thực danh tính cho Bot khi gửi gói tin lên máy chủ đấu trường.")

    add_outline_heading("3.2. Tải Bot SDK và Phát triển thuật toán đối kháng đa người", level=2)
    add_p("Thí sinh tải về bộ công cụ phát triển phần mềm (Bot SDK) do ban tổ chức phát hành:")
    add_bullet("Cấu trúc SDK tiêu chuẩn: ", "SDK đã tích hợp sẵn module kết nối mạng WebSocket, module giải mã gói tin JSON trạng thái ván đấu và cơ chế xử lý Timeout. Lập trình viên chỉ cần triển khai thuật toán trong hàm nghiệp vụ cốt lõi `make_move(game_state)`.")
    add_bullet("Chiến thuật đối kháng nhiều người: ", "Khác với đối kháng 1v1, trong phòng đấu 4 - 8 người, thí sinh cần xây dựng các thuật toán phân tích hành vi đám đông, dự đoán xác suất nước đi chiếm ưu thế trên sàn đấu và quản lý hạn ngạch thẻ bài tối ưu cho các hiệp quyết định.")

    add_outline_heading("3.3. Kiểm thử Bot trong môi trường Sandbox", level=2)
    add_p("Trước khi bước vào giải đấu chính thức, thí sinh sử dụng công cụ kiểm thử độc lập:")
    add_bullet("Đấu tập với Bot mô phỏng (Mock Arena): ", "Thí sinh cho Bot của mình đấu tập với các Bot mẫu có chiến thuật đa dạng (Bot ngẫu nhiên, Bot bắt chước, Bot bảo thủ) trong phòng đấu giả lập 4 người.")
    add_bullet("Đo lường thời gian thực thi: ", "Kiểm tra thời gian phản hồi của thuật toán, đảm bảo thời gian tính toán luôn nằm trong ngưỡng an toàn (dưới 500ms so với giới hạn 1000ms).")

    add_outline_heading("3.4. Nộp Bot vào Đấu trường và Theo dõi trực tiếp", level=2)
    add_p("Khi thuật toán đã hoàn thiện và vượt qua các bài kiểm tra nội bộ, thí sinh tiến hành nộp bài:")
    add_bullet("Nộp mã nguồn: ", "Tải tệp tin mã nguồn lên hệ thống hoặc cung cấp địa chỉ Webhook của máy chủ Bot cá nhân.")
    add_bullet("Theo dõi trận đấu trực quan: ", "Thí sinh đăng nhập chế độ khán giả (Spectator Mode) trên giao diện Web Dashboard để theo dõi trực tiếp các diễn biến tranh tài, quan sát lượng HP của Bot biến động theo từng hiệp đấu.")

    add_p("", space_before=4, space_after=8)

    # 4. THIẾT KẾ CHI TIẾT CƠ CHẾ GAME OTTV2 NHIỀU NGƯỜI VÀ LUỒNG XỬ LÝ
    add_outline_heading("4. THIẾT KẾ CHI TIẾT CƠ CHẾ GAME OTTV2 NHIỀU NGƯỜI VÀ LUỒNG XỬ LÝ", level=1)

    add_outline_heading("4.1. Kiến trúc hệ thống phòng đấu nhiều người chơi (Multiplayer Lobby)", level=2)
    add_p("Hệ thống đấu trường OTTV2 đa người chơi được xây dựng theo mô hình phân tán Client - Master - Worker nhằm đảm bảo khả năng mở rộng linh hoạt:")
    add_bullet("Máy chủ Điều phối Trung tâm (Master Server): ", "Đóng vai trò Gateway tiếp nhận các yêu cầu từ Web và Bot, quản lý hàng đợi ghép phòng và phân bổ tải cho các tiến trình Worker.")
    add_bullet("Các tiến trình Đấu trường (Match Workers): ", "Mỗi Worker quản lý độc lập một phòng đấu gồm 4 đến 8 Bot. Worker duy trì kết nối WebSocket song công (Full-duplex) với các Bot, thực thi bộ đếm nhịp và áp dụng luật chơi OTTV2.")
    add_bullet("Bộ nhớ đệm Redis & Cơ sở dữ liệu PostgreSQL: ", "Redis duy trì trạng thái ván đấu tức thời (in-memory game state); PostgreSQL lưu trữ dữ liệu vĩnh viễn về kết quả hiệp đấu, bảng xếp hạng và nhật ký tranh chấp.")

    add_outline_heading("4.2. Cơ chế luật chơi OTTV2 đa người và Ma trận tương khắc đồng thời", level=2)
    add_p("Đây là nội dung cải tiến đột phá của phiên bản OTTV2 so với trò chơi dân gian truyền thống:")
    add_bullet("Cấu trúc bàn đấu đa người: ", "Mỗi phòng đấu tiêu chuẩn bao gồm 4 Bot (hoặc lên đến 8 Bot trong chế độ sinh tồn). Mỗi Bot khởi đầu với 100 HP và một kho thẻ bài gồm 5 Kéo, 5 Búa, 5 Bao.")
    add_bullet("Nhịp ra quyết định đồng thời: ", "Tất cả các Bot trong phòng có đúng 1000ms để gửi về lựa chọn nước đi ẩn. Không có Bot nào biết trước lựa chọn của các đối thủ khác trong cùng hiệp.")
    add_bullet("Ma trận tương khắc đa phương (Simultaneous Multi-action Matrix): ", "Khi hết giờ, trọng tài mở đòn đồng loạt và đối chiếu tương quan giữa tất cả các cặp người chơi trên sàn đấu:")
    
    add_p("Nguyên tắc tính toán sát thương đa chiều được quy định cụ thể như sau:", space_before=2, space_after=2)
    add_numbered_item("a.", "Xét từng cặp (Bot A, Bot B): Nếu nước đi của Bot A khắc chế Bot B (ví dụ A ra Kéo, B ra Bao), Bot B bị trừ 15 HP cơ bản, đồng thời Bot A được cộng 10 điểm thưởng tấn công.")
    add_numbered_item("b.", "Trường hợp hòa cặp: Nếu Bot A và Bot B ra cùng một loại nước đi, không có sát thương nào được tạo ra giữa hai bên.")
    add_numbered_item("c.", "Hiệu ứng thiểu số / đa số: Nếu trên bàn đấu 4 người, có 3 Bot cùng ra Kéo và chỉ có 1 Bot ra Búa, Bot ra Búa sẽ tạo ra sát thương lên toàn bộ 3 Bot ra Kéo, tạo ra pha lội ngược dòng ngoạn mục.")
    add_numbered_item("d.", "Hạn ngạch thẻ bài: Khi một Bot đã dùng hết một loại thẻ (ví dụ đã dùng hết 5 thẻ Búa), Bot không thể chọn nước đi đó ở các hiệp sau. Nếu cố tình gửi thẻ không hợp lệ, hệ thống tự động xử thua hiệp đó.")

    add_outline_heading("4.3. Luồng xử lý một ván đấu OTTV2 nhiều người theo thời gian thực", level=2)
    add_p("Mỗi ván đấu OTTV2 nhiều người chơi vận hành theo vòng lặp 5 giai đoạn tuần tự:")
    add_bullet("Giai đoạn 1 - Bắt tay và Đồng bộ (Handshake): ", "Worker gửi thông điệp sẵn sàng tới tất cả các Bot trong phòng, đồng bộ đồng hồ máy chủ.")
    add_bullet("Giai đoạn 2 - Phát thông điệp trạng thái (Broadcast State): ", "Worker gửi gói tin trạng thái hiện tại (HP của từng Bot, số thẻ bài còn lại, lịch sử các hiệp trước) tới từng Bot.")
    add_bullet("Giai đoạn 3 - Đếm ngược và Thu nhận (Countdown & Collect): ", "Bộ đếm ngược 1000ms kích hoạt. Worker lắng nghe phản hồi qua WebSocket từ các Bot.")
    add_bullet("Giai đoạn 4 - Phân giải ma trận sát thương (Resolve Matrix): ", "Worker áp dụng thuật toán ma trận tương quan, tính tổng sát thương mỗi Bot phải nhận và cập nhật lượng HP mới.")
    add_bullet("Giai đoạn 5 - Kiểm tra sinh tồn (Survival Check): ", "Bot nào có HP giảm về 0 sẽ bị đánh dấu 'Bị loại' (Eliminated). Ván đấu tiếp diễn cho đến khi xác định được người sống sót cuối cùng hoặc kết thúc 15 hiệp quy định.")

    add_outline_heading("4.4. Cơ chế cách ly và Bảo mật thực thi mã nguồn Bot (Sandbox)", level=2)
    add_p("Nhằm triệt tiêu mọi nguy cơ tấn công máy chủ hoặc can thiệp bất hợp pháp giữa các Bot, hệ thống áp dụng cơ chế Sandbox đa tầng:")
    add_bullet("Cách ly Container Docker: ", "Mỗi Bot khi thi đấu được khởi chạy trong một container cô lập độc lập, không có quyền truy cập vào hệ thống tệp tin của máy chủ chủ quản.")
    add_bullet("Giới hạn tài nguyên phần cứng: ", "Mỗi tiến trình Bot bị khống chế tối đa 128MB RAM và 1 lõi CPU ảo, ngăn chặn triệt để tình trạng mã độc chạy vòng lặp vô tận làm nghẽn máy chủ.")
    add_bullet("Chặn kết nối mạng ngoại vi: ", "Tường lửa nội bộ chặn toàn bộ lưu lượng mạng ra ngoài internet từ container của Bot; Bot chỉ được phép giao tiếp duy nhất với cổng WebSocket của máy chủ trọng tài.")

    add_outline_heading("4.5. Thiết kế Giao tiếp API và WebSocket cho phòng đấu đa người", level=2)
    add_p("Giao tiếp giữa hệ thống và các bên liên quan được chuẩn hóa bằng hai giao thức mạng:")

    t_api = doc.add_table(rows=5, cols=4)
    col_w_api = [Cm(2.5), Cm(5.0), Cm(3.5), Cm(5.0)]
    style_table(t_api, col_w_api)

    api_data = [
        ("Phương thức", "Điểm cuối (Endpoint)", "Giao thức", "Chức năng nghiệp vụ"),
        ("POST", "/api/v2/auth/login", "HTTP REST", "Xác thực thí sinh và cấp mã truy cập phiên."),
        ("POST", "/api/v2/bots/submit", "HTTP REST", "Nộp gói mã nguồn Bot hoặc khai báo Webhook URL."),
        ("WS", "/ws/arena/multiplayer/{room_id}", "WebSocket", "Kênh tương tác song công thời gian thực đa người chơi."),
        ("GET", "/api/v2/rooms/{room_id}/stream", "HTTP / SSE", "Phát luồng dữ liệu xem trực tiếp trận đấu lên Web.")
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
    add_p("Mô hình dữ liệu quan hệ chuẩn 3NF được thiết lập nhằm bảo đảm tính toàn vẹn và tối ưu tốc độ truy vấn:")
    add_bullet("Bảng Users: ", "Quản lý tài khoản (user_id, username, password_hash, full_name, student_id, role, created_at).")
    add_bullet("Bảng Bots: ", "Quản lý thông tin Bot (bot_id, user_id, bot_name, language, elo_rating, status, created_at).")
    add_bullet("Bảng Multiplayer_Rooms: ", "Quản lý phòng đấu đa người (room_id, max_players, current_round, status, winner_id).")
    add_bullet("Bảng Round_Logs: ", "Lưu chi tiết từng hiệp đấu phục vụ tra cứu khiếu nại (log_id, room_id, round_number, actions_json, damage_matrix_json, hp_snapshot_json, timestamp).")

    add_outline_heading("4.7. Bot SDK và Thuật toán Bot mẫu chơi nhiều người", level=2)
    add_p("Dưới đây là mẫu mã nguồn chuẩn hóa bằng ngôn ngữ Python giúp sinh viên dễ dàng làm quen và phát triển thuật toán đối kháng đa người chơi:")

    code_lines = [
        '# File: multiplayer_ottv2_bot.py',
        'import random',
        '',
        'class MultiplayerOTTV2Bot:',
        '    def __init__(self, bot_name="StrategyBot"):',
        '        self.bot_name = bot_name',
        '        self.room_history = []',
        '',
        '    def on_round_start(self, game_state):',
        '        # Cập nhật thông số phòng đấu 4 người',
        '        self.my_hp = game_state.get("my_hp", 100)',
        '        self.opponents_hp = game_state.get("opponents_hp", {})',
        '        self.my_deck = game_state.get("my_deck", {"ROCK": 5, "PAPER": 5, "SCISSORS": 5})',
        '        self.round_number = game_state.get("round_number", 1)',
        '        if "last_round_moves" in game_state:',
        '            self.room_history.append(game_state["last_round_moves"])',
        '',
        '    def make_move(self):',
        '        # Lấy danh sách thẻ còn khả dụng',
        '        available = [card for card, count in self.my_deck.items() if count > 0]',
        '        if not available:',
        '            return "ROCK"',
        '',
        '        # Phân tích xu hướng số đông đối thủ trong phòng',
        '        if self.room_history:',
        '            last_moves = self.room_history[-1].values()',
        '            rock_count = list(last_moves).count("ROCK")',
        '            # Nếu số đông thích ra Búa, ta ưu tiên ra Bao để khắc chế đa số',
        '            if rock_count >= 2 and "PAPER" in available:',
        '                return "PAPER"',
        '',
        '        # Chiến lược ngẫu nhiên có trọng số theo thẻ còn lại',
        '        return random.choice(available)'
    ]
    add_code_block(code_lines)

    add_p("", space_before=4, space_after=8)

    # 5. KẾ HOẠCH TỔ CHỨC GIẢI ĐẤU VÀ THỂ THỨC THI ĐẤU
    add_outline_heading("5. KẾ HOẠCH TỔ CHỨC GIẢI ĐẤU VÀ THỂ THỨC THI ĐẤU", level=1)

    add_outline_heading("5.1. Thể thức thi đấu giải đấu (Vòng bảng & Đấu trường sinh tồn)", level=2)
    add_p("Kế hoạch tổ chức giải đấu được xây dựng theo mô hình hai giai đoạn kết hợp nhằm tôn vinh cả tính bền bỉ và khả năng đột phá chiến thuật:")
    add_bullet("Giai đoạn 1 - Vòng Bảng Hỗn Chiến: ", "Dự kiến 32 đến 64 Bot được chia thành 8 hoặc 16 bảng đấu (mỗi bảng 4 Bot). Trong mỗi bảng, 4 Bot cùng thi đấu một ván đấu kéo dài 15 hiệp. Hai Bot có lượng HP còn lại cao nhất mỗi bảng sẽ giành vé vào vòng tiếp theo.")
    add_bullet("Giai đoạn 2 - Đấu Trường Sinh Tồn Chung Kết (Battle Royale Finals): ", "8 Bot xuất sắc nhất hội tụ trong phòng đấu chung kết duy nhất. Các Bot thi đấu không giới hạn hiệp cho đến khi các đối thủ lần lượt bị tiêu hao hết HP. Bot sống sót cuối cùng trên đấu trường được vinh danh là Quán quân của giải đấu.")

    add_outline_heading("5.2. Thuật toán xếp hạng Elo mở rộng cho nhiều người chơi", level=2)
    add_p("Hệ thống áp dụng thuật toán Elo cải tiến cho môi trường đa đối thủ (Multiplayer Elo Rating). Kỳ vọng thắng của một Bot được tính toán bằng trung bình cộng kỳ vọng đối đầu với tất cả các đối thủ khác trong phòng:")

    add_p("Công thức kỳ vọng đối đầu giữa Bot A và đối thủ B:", space_before=2, space_after=2)
    add_p("E(A, B) = 1 / [1 + 10 ^ ((R_B - R_A) / 400)]", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=2, space_after=2, bold=True, size=11)
    
    add_p("Kỳ vọng tổng thể của Bot A trong phòng đấu N người chơi:", space_before=2, space_after=2)
    add_p("E_total(A) = Tổng[E(A, i)] / (N - 1)", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=2, space_after=2, bold=True, size=11)

    add_p("Cập nhật điểm Elo sau ván đấu:", space_before=2, space_after=2)
    add_p("R'(A) = R(A) + K * [S_actual(A) - E_total(A)]", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=2, space_after=4, bold=True, size=11)

    add_p("Trong đó, S_actual(A) là điểm thứ hạng thực tế trong phòng (vị trí thứ 1 đạt 1.0, vị trí thứ 2 đạt 0.66, vị trí thứ 3 đạt 0.33, vị trí thứ 4 đạt 0.0); K là hệ số điều chỉnh trọng số (mặc định K = 32).")

    add_p("Trong trường hợp các Bot có điểm số bằng nhau, chỉ số phụ (Tie-break) được xét theo thứ tự ưu tiên:", space_before=2, space_after=2)
    add_numbered_item("1.", "Tổng lượng sát thương gây ra cho các đối thủ trong suốt ván đấu.")
    add_numbered_item("2.", "Hiệu số HP còn lại tại thời điểm kết thúc ván đấu.")
    add_numbered_item("3.", "Số lần ra nước đi thắng thế trực tiếp nhiều hơn.")

    add_outline_heading("5.3. Quy định xử lý hòa, mất kết nối mạng và Quá thời gian (Timeout)", level=2)
    add_p("Bộ quy tắc xử lý sự cố kỹ thuật được chuẩn hóa nhằm bảo đảm giải đấu diễn ra liên tục, không bị tắc nghẽn:")

    t_err = doc.add_table(rows=4, cols=3)
    col_w_err = [Cm(3.5), Cm(4.5), Cm(8.0)]
    style_table(t_err, col_w_err)

    err_data = [
        ("Tình huống sự cố", "Phản ứng tự động của hệ thống", "Quy chế xử lý và Biện pháp tài phán"),
        ("Bot phản hồi quá giờ\n(Timeout > 1000ms)", "Tự động gán nước đi ngẫu nhiên từ kho thẻ", "Cảnh cáo lần 1. Nếu một Bot vi phạm Timeout quá 3 hiệp trong một ván, hệ thống tự động xử thua và loại khỏi phòng."),
        ("Bot mất kết nối mạng\n(Socket Disconnect)", "Cho phép thời gian chờ tái kết nối 30 giây", "Nếu trong 30 giây Bot kết nối lại thành công, ván đấu tiếp tục. Quá 30 giây, xử thua kỹ thuật cho Bot bị ngắt kết nối."),
        ("Các Bot cùng cạn HP trong cùng một hiệp", "Kích hoạt Hiệp phụ Đột tử\n(Sudden Death)", "Các Bot liên quan bước vào 01 hiệp phụ phân định: Bot nào ra nước đi có lợi thế tương khắc đầu tiên sẽ chiến thắng.")
    ]
    for r_i, r_data in enumerate(err_data):
        row = t_err.rows[r_i]
        for c_i, text in enumerate(r_data):
            cell = row.cells[c_i]
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if c_i == 0 else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            r = p.add_run(text)
            apply_font(r, size=11, bold=(r_i == 0))

    add_outline_heading("5.4. Cơ cấu giải thưởng và Dự trù kinh phí tổ chức", level=2)
    add_p("Kế hoạch tài chính mang tính chất định hướng, được xây dựng trên nguyên tắc tiết kiệm, tối ưu hóa nguồn lực học thuật sẵn có:")

    t_cost = doc.add_table(rows=6, cols=4)
    col_w_cost = [Cm(1.5), Cm(7.0), Cm(4.0), Cm(3.5)]
    style_table(t_cost, col_w_cost)

    cost_data = [
        ("STT", "Khoản mục chi phí dự kiến", "Ước tính (VNĐ)", "Ghi chú điều chỉnh"),
        ("01", "Quỹ giải thưởng vinh danh tuyển thủ xuất sắc", "2.500.000 - 4.000.000", "Trao giải Nhất, Nhì, Ba và giải Phong cách"),
        ("02", "Thuê hạ tầng máy chủ đám mây (Cloud Server)", "400.000 - 600.000", "Cụm máy chủ phục vụ kiểm thử và ngày thi đấu"),
        ("03", "Thiết kế ấn phẩm số, chứng nhận điện tử", "200.000 - 300.000", "Giấy chứng nhận tham gia và kỷ niệm chương"),
        ("04", "Quỹ dự phòng kỹ thuật phát sinh (10%)", "300.000 - 500.000", "Xử lý các tình huống đột xuất trong giải"),
        ("TỔNG", "Dự toán tổng kinh phí đề xuất", "3.400.000 - 5.400.000", "Cân đối linh hoạt theo nguồn tài trợ thực tế")
    ]
    for r_i, r_data in enumerate(cost_data):
        row = t_cost.rows[r_i]
        for c_i, text in enumerate(r_data):
            cell = row.cells[c_i]
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if c_i in [0, 2] else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            r = p.add_run(text)
            apply_font(r, size=11, bold=(r_i == 0 or r_i == 5))

    add_p("", space_before=4, space_after=8)

    # 6. CÁC BƯỚC TRIỂN KHAI, VẬN HÀNH VÀ KIỂM THỬ HỆ THỐNG
    add_outline_heading("6. CÁC BƯỚC TRIỂN KHAI, VẬN HÀNH VÀ KIỂM THỬ HỆ THỐNG", level=1)

    add_outline_heading("6.1. Triển khai Nền tảng hạ tầng và Máy chủ điều phối", level=2)
    add_p("Hạ tầng kỹ thuật được triển khai trên nền tảng máy chủ Linux chuẩn hóa:")
    add_bullet("Container hóa dịch vụ: ", "Toàn bộ API Gateway, Worker Engine và Frontend Web Dashboard được đóng gói thành các Docker Image độc lập, bảo đảm tính nhất quán khi chuyển giao môi trường.")
    add_bullet("Điều phối Worker: ", "Sử dụng tiến trình giám sát tự động để điều phối số lượng Worker phòng đấu tương ứng với lượng người chơi thực tế, duy trì độ trễ xử lý dưới 50ms.")

    add_outline_heading("6.2. Khởi tạo Cơ sở dữ liệu và Dịch vụ hàng đợi", level=2)
    add_p("Quy trình chuẩn bị dữ liệu trước giải đấu:")
    add_bullet("Thực thi kịch bản cơ sở dữ liệu: ", "Tạo lập đầy đủ bảng biểu, thiết lập chỉ mục (Indexes) trên các trường tra cứu thường xuyên (user_id, room_id, round_number) nhằm tối ưu tốc độ đọc ghi.")
    add_bullet("Cấu hình hàng đợi Redis: ", "Thiết lập các kênh tin nhắn Pub/Sub phục vụ phân phối trận đấu và phát luồng dữ liệu thời gian thực tới giao diện theo dõi.")

    add_outline_heading("6.3. Kế hoạch kiểm thử hệ thống (Unit, Stress đa người, Anti-Cheat)", level=2)
    add_p("Công tác kiểm thử được triển khai đa diện nhằm hạn chế tối đa sự cố trong ngày thi đấu:")

    t_test = doc.add_table(rows=4, cols=4)
    col_w_test = [Cm(3.0), Cm(4.5), Cm(5.0), Cm(3.5)]
    style_table(t_test, col_w_test)

    test_data = [
        ("Cấp độ kiểm thử", "Mục tiêu trọng tâm", "Kịch bản thực thi đề xuất", "Tiêu chuẩn chấp thuận"),
        ("Kiểm thử Đơn vị\n(Unit Testing)", "Kiểm tra tính chính xác của ma trận tương khắc đa người", "Chạy 1.000 ca kiểm thử giả lập với đầy đủ các tổ hợp nước đi 4 người", "Kết quả tính điểm và trừ HP đạt độ chính xác tuyệt đối theo luật."),
        ("Kiểm thử Tải cao\n(Stress Testing)", "Đo lường năng lực chịu tải khi nhiều phòng đấu chạy song song", "Giả lập 16 phòng đấu 4 người (tổng cộng 64 Bot) gửi lệnh đồng thời", "Hệ thống phản hồi ổn định, độ trễ mạng duy trì dưới 100ms."),
        ("Kiểm thử Bảo mật\n(Anti-Cheat Test)", "Ngăn chặn mã độc và hành vi can thiệp trái phép", "Gửi các Bot cố tình gọi lệnh cấm hệ thống hoặc chiếm dụng RAM", "Sandbox phát hiện và cô lập thành công, không ảnh hưởng máy chủ.")
    ]
    for r_i, r_data in enumerate(test_data):
        row = t_test.rows[r_i]
        for c_i, text in enumerate(r_data):
            cell = row.cells[c_i]
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if c_i in [0, 3] else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            r = p.add_run(text)
            apply_font(r, size=11, bold=(r_i == 0))

    add_outline_heading("6.4. Ma trận nhận diện rủi ro và Phương án dự phòng kỹ thuật", level=2)
    add_p("Ban dự án thiết lập ma trận rủi ro và các kịch bản phản ứng chủ động:")
    add_bullet("Rủi ro mạng internet công cộng chập chờn: ", "Ban tổ chức chuẩn bị sẵn máy chủ dự phòng mạng nội bộ (LAN Offline Server), cho phép chuyển đổi chế độ thi đấu offline trong vòng 10 phút.")
    add_bullet("Rủi ro thí sinh vắng mặt: ", "Thiết lập danh sách thí sinh dự bị (khoảng 8 tuyển thủ). Nếu sau 10 phút điểm danh thí sinh chính thức không có mặt, vị trí sẽ được chuyển giao cho thí sinh dự bị kế tiếp.")

    add_p("", space_before=4, space_after=8)

    # 7. KẾT LUẬN VÀ KIẾN NGHỊ TRIỂN KHAI
    add_outline_heading("7. KẾT LUẬN VÀ KIẾN NGHỊ TRIỂN KHAI", level=1)

    add_outline_heading("7.1. Đánh giá tính khả thi và Giá trị ứng dụng của dự án", level=2)
    add_p("Bản đề án 'Thiết kế Game OTTV2 Chế độ Nhiều Người Chơi và Kế hoạch Tổ chức Giải đấu Thi đấu Bằng Code' đã đáp ứng toàn diện và sâu sắc các mục tiêu của Bài tập 3 - Kết hợp. Sự kết hợp giữa Version 1 (Yêu cầu & Sơ bộ) và Version 2 (Bản thiết kế & Vận hành đầy đủ) mang lại một hệ thống có tính ứng dụng cao, khả năng chịu tải tốt và cấu trúc bảo mật vững chắc.")
    add_p("Dự án không chỉ là một bài tập kỹ thuật đơn thuần mà còn mở ra một mô hình sân chơi học thuật giàu tính tương tác, khuyến khích sinh viên áp dụng các kiến thức về kiến trúc phần mềm, lập trình phân tán, lý thuyết trò chơi và trí tuệ nhân tạo vào thực tiễn.")

    add_outline_heading("7.2. Kế hoạch mở rộng và Phát triển trong các giai đoạn tiếp theo", level=2)
    add_p("Trong các giai đoạn phát triển tiếp theo sau giải đấu, ban dự án đề xuất các phương hướng mở rộng:")
    add_bullet("Tích hợp AI Agent học tăng cường (Deep RL): ", "Xây dựng môi trường Gym/PettingZoo cho phép sinh viên huấn luyện các Agent AI tự động học chiến thuật qua hàng triệu ván đấu tự chơi.")
    add_bullet("Mở rộng hệ sinh thái giải đấu đa bộ môn: ", "Chuẩn hóa động cơ đấu trường để dễ dàng tích hợp thêm các tựa game trí tuệ đối kháng khác như Cờ vây, Cờ caro, Đua xe mê cung tự hành bằng code.")

    # Chữ ký phê duyệt
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
    r = p_s0.add_run("ĐẠI DIỆN NHÓM PHÁT TRIỂN DỰ ÁN\n")
    apply_font(r, size=11, bold=True)
    r_sub0 = p_s0.add_run("(Ký và ghi rõ họ tên)\n\n\n\n\n")
    apply_font(r_sub0, size=10, italic=True)
    r_name0 = p_s0.add_run("Nhóm Sinh viên Thực hiện Đề án")
    apply_font(r_name0, size=11, bold=True)

    p_s1 = t_sig.rows[0].cells[1].paragraphs[0]
    p_s1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p_s1.add_run("XÁC NHẬN CỦA GIẢNG VIÊN HƯỚNG DẪN\n")
    apply_font(r, size=11, bold=True)
    r_sub1 = p_s1.add_run("(Ký và đánh giá điểm số)\n\n\n\n\n")
    apply_font(r_sub1, size=10, italic=True)
    r_name1 = p_s1.add_run("Bộ môn Kỹ thuật Phần mềm")
    apply_font(r_name1, size=11, bold=True)

    output_target = "Bao_Cao_Ke_Hoach_Du_An_OTTV2_Multiplayer.docx"
    doc.save(output_target)
    print(f"SUCCESS: Saved {output_target}")
    try:
        doc.save("Bao_Cao_Du_An_Thi_Dau_OanTuTi_Bang_Code.docx")
        print("SUCCESS: Also updated Bao_Cao_Du_An_Thi_Dau_OanTuTi_Bang_Code.docx")
    except Exception as e:
        print("Notice: Bao_Cao_Du_An_Thi_Dau_OanTuTi_Bang_Code.docx is currently open in Word, saved to primary file.")

if __name__ == "__main__":
    build_perfect_document()

# -*- coding: utf-8 -*-
"""
Script to generate the comprehensive, professional software engineering project specification:
"DỰ ÁN LẬP TRÌNH THI ĐẤU OANTUTI BẰNG CODE (OTTV2 BOT ARENA)"
Following all user requirements:
- Conforms to "Bài tập 3 - Kết hợp" (Version 1: Yêu cầu, thiết kế sơ bộ; Version 2: Bản đầy đủ).
- Follows outline hierarchy shown in Image 2 (TÓM TẮT, MỤC LỤC, 1. ..., 1.1. ..., 2. ..., 2.1. ...).
- Proper Word Navigation Pane outline levels (outlineLvl 0, 1, 2).
- Font Times New Roman throughout.
- NO colored text (100% black text #000000).
- Clear, logical, easily understood language (no overly complex wording).
- Objective, realistic, probabilistic tone (NO 100% absolute assertions).
- Target length: exactly 16-17 pages structured cleanly with page breaks.
"""

import os
import docx
from docx.shared import Pt, RGBColor, Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn, nsdecls

def create_full_project_document():
    doc = docx.Document()

    # 1. Page Setup - A4 format, Standard administrative margins
    for section in doc.sections:
        section.top_margin = Cm(2.0)
        section.bottom_margin = Cm(2.0)
        section.left_margin = Cm(3.0)
        section.right_margin = Cm(2.0)
        section.page_width = Cm(21.0)
        section.page_height = Cm(29.7)

    # 2. Configure Base Normal Style
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

    # Helper function to apply font to runs
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

    # Helper function to add headings with explicit Word Outline Levels
    def add_outline_heading(text, level=1):
        # level 1: outlineLvl 0 (Heading 1)
        # level 2: outlineLvl 1 (Heading 2)
        # level 3: outlineLvl 2 (Heading 3)
        style_name = f'Heading {level}'
        p = doc.add_paragraph(style=style_name)
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.keep_with_next = True
        
        # Ensure outline level in pPr
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

    def add_p(text="", align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_before=0, space_after=5, line_spacing=1.2, bold=False, italic=False, size=12):
        p = doc.add_paragraph()
        p.alignment = align
        p.paragraph_format.space_before = Pt(space_before)
        p.paragraph_format.space_after = Pt(space_after)
        p.paragraph_format.line_spacing = line_spacing
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
    hr = hp.add_run("Báo cáo Dự án: Nền tảng Thi đấu OanTuTi Bằng Code (Version 1 & Version 2)")
    apply_font(hr, size=9, italic=True)

    footer = doc.sections[0].footer
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fr = fp.add_run("Học phần: Bài tập 3 - Kết hợp | Tài liệu Đặc tả Thiết kế Kỹ thuật")
    apply_font(fr, size=9, italic=True)

    # =========================================================================
    # TRANG 1: TRANG BÌA (COVER PAGE)
    # =========================================================================
    add_p("BỘ GIÁO DỤC VÀ ĐÀO TẠO", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=10, space_after=2, size=12, bold=True)
    add_p("TRƯỜNG ĐẠI HỌC CÔNG NGHỆ - ĐẠI HỌC QUỐC GIA HÀ NỘI", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=4, size=12, bold=True)
    add_p("KHOA CÔNG NGHỆ THÔNG TIN", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=20, size=11, bold=True)

    add_p("---***---", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=35, size=12)

    add_p("BÁO CÁO BÀI TẬP LỚN / ĐỒ ÁN HỌC PHẦN", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=12, size=13, bold=True)
    add_p("BÀI TẬP 3 - KẾT HỢP", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=20, size=15, bold=True)

    add_p("ĐỀ ÁN THIẾT KẾ VÀ XÂY DỰNG HỆ THỐNG\nTHI ĐẤU OANTUTI BẰNG CODE (BOT ARENA OTTV2)", 
          align=WD_ALIGN_PARAGRAPH.CENTER, space_before=10, space_after=14, size=18, bold=True)

    add_p("PHIÊN BẢN KẾT HỢP:\nVersion 1: Yêu cầu & Thiết kế sơ bộ\nVersion 2: Đặc tả kỹ thuật & Triển khai đầy đủ", 
          align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=45, size=12, italic=True)

    # Thông tin sinh viên thực hiện
    t_cover = doc.add_table(rows=5, cols=2)
    t_cover.alignment = WD_TABLE_ALIGNMENT.CENTER
    w_cov = [Cm(5.0), Cm(9.5)]
    for r_idx, (k, v) in enumerate([
        ("Học phần:", "Phát triển Ứng dụng & Lập trình Nâng cao"),
        ("Tên dự án:", "Hệ thống Thi đấu OanTuTi Bằng Code (OTTV2 Arena)"),
        ("Sinh viên thực hiện:", "Nhóm Nghiên cứu & Phát triển Dự án"),
        ("Giảng viên hướng dẫn:", "Bộ môn Kỹ thuật Phần mềm"),
        ("Thời gian hoàn thành:", "Hà Nội, Tháng 10 Năm 2026")
    ]):
        row = t_cover.rows[r_idx]
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

    add_p("Tài liệu này được biên soạn nhằm đề xuất, phân tích và đặc tả toàn diện Dự án lập trình nền tảng thi đấu OanTuTi bằng mã nguồn (code), đáp ứng yêu cầu của Bài tập 3 - Kết hợp. Trọng tâm của đề án bao gồm hai giai đoạn cốt lõi: Version 1 (Xác định các yêu cầu chức năng, phi chức năng và thiết kế sơ bộ hệ thống) và Version 2 (Bản thiết kế kỹ thuật đầy đủ, quy trình nghiệp vụ chi tiết, hạ tầng phòng đấu, cơ chế cách ly thực thi mã nguồn an toàn và thể thức giải đấu nhiều người chơi).")

    add_p("Trò chơi OanTuTi (Kéo - Búa - Bao) truyền thống mang tính ngẫu nhiên cao và chủ yếu dành cho hai người chơi đối kháng trực tiếp. Dự án phát triển phiên bản cải tiến OanTuTi V2 (OTTV2) nhằm chuyển đổi trò chơi dân gian thành một sân chơi học thuật - công nghệ, nơi người tham gia không tương tác thủ công bằng tay mà lập trình các thuật toán tự hành (Bot/Agent). Bot sẽ gửi quyết định thông qua giao thức mạng, sử dụng các chiến lược như quản lý tài nguyên điểm sinh mệnh (HP), phân tích chuỗi Markov để dự đoán đối thủ, và tối ưu hóa xác suất trong môi trường thi đấu đồng thời nhiều bên.")

    add_p("Tài liệu được xây dựng với cấu trúc chặt chẽ, mạch lạc, bám sát kiến trúc phần mềm tiêu chuẩn công nghiệp và tuân thủ các nguyên tắc đánh giá khách quan, không áp đặt các nhận định chủ quan hay cứng nhắc, hướng tới việc tạo dựng một nền tảng vận hành bền vững và an toàn.")

    # Bảng tóm tắt thông số cốt lõi
    t_sum = doc.add_table(rows=7, cols=2)
    col_w_sum = [Cm(4.5), Cm(11.5)]
    style_table(t_sum, col_w_sum)

    sum_rows = [
        ("Thông số dự án", "Mô tả chi tiết và định hướng triển khai"),
        ("Tên dự án chính thức", "Nền tảng Đấu trường OanTuTi Lập trình (OTTV2 Code Battle Arena)"),
        ("Phạm vi tài liệu", "Bao gồm trọn vẹn Version 1 (Yêu cầu & Sơ bộ) và Version 2 (Đầy đủ)"),
        ("Hình thức tương tác", "100% tự động hóa thông qua API / WebSocket giữa Bot và Máy chủ Đấu trường"),
        ("Ngôn ngữ hỗ trợ Bot", "Đa ngôn ngữ (cung cấp SDK chuẩn cho Python, JavaScript/Node.js, C++)"),
        ("Quy mô phòng đấu", "Hỗ trợ linh hoạt từ đối kháng 1v1 đến đấu trường hỗn chiến 4 - 8 Bot đồng thời"),
        ("Môi trường thực thi", "Cơ chế máy ảo / container cách ly nhẹ nhằm ngăn chặn rủi ro bảo mật")
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
        ("1. TỔNG QUAN HỆ THỐNG", "Trang 4", 1),
        ("   1.1. Mục đích và Phạm vi tài liệu", "Trang 4", 2),
        ("   1.2. Bối cảnh dự án và Nhu cầu thi đấu OanTuTi bằng code", "Trang 4", 2),
        ("   1.3. Phân quyền và Đối tượng sử dụng", "Trang 5", 2),
        ("   1.4. Lộ trình phát triển hệ thống (Version 1 và Version 2)", "Trang 5", 2),
        ("2. YÊU CẦU HỆ THỐNG VÀ THIẾT KẾ SƠ BỘ (VERSION 1)", "Trang 6", 1),
        ("   2.1. Yêu cầu chức năng sơ bộ (Functional Requirements)", "Trang 6", 2),
        ("   2.2. Yêu cầu phi chức năng (Non-Functional Requirements)", "Trang 6", 2),
        ("   2.3. Quy tắc trò chơi OanTuTi mở rộng (OTTV2 Engine)", "Trang 7", 2),
        ("   2.4. Kiến trúc tổng thể sơ bộ của hệ thống", "Trang 7", 2),
        ("   2.5. Thiết kế giao thức tương tác sơ bộ giữa Bot và Đấu trường", "Trang 7", 2),
        ("3. QUY TRÌNH NGHIỆP VỤ CỦA QUẢN TRỊ VIÊN (ADMIN)", "Trang 8", 1),
        ("   3.1. Bước 1: Đăng nhập và Khởi tạo phòng đấu", "Trang 8", 2),
        ("   3.2. Bước 2: Quản lý danh sách Thí sinh và Thẩm định Bot", "Trang 8", 2),
        ("   3.3. Bước 3: Cấu hình Thể thức và Lịch trình giải đấu", "Trang 9", 2),
        ("   3.4. Bước 4: Vận hành Phiên thi đấu thời gian thực", "Trang 9", 2),
        ("   3.5. Bước 5: Báo cáo, Thống kê và Xếp hạng giải đấu", "Trang 9", 2),
        ("   3.6. Bước 6: Cài đặt hệ thống và Giám sát máy chủ", "Trang 9", 2),
        ("4. QUY TRÌNH NGHIỆP VỤ CỦA NGƯỜI CHƠI / LẬP TRÌNH VIÊN (USER)", "Trang 10", 1),
        ("   4.1. Đăng ký tài khoản và Quản lý khóa API (API Key)", "Trang 10", 2),
        ("   4.2. Tải Bot SDK và Phát triển thuật toán chiến lược", "Trang 10", 2),
        ("   4.3. Kiểm thử Bot trong môi trường độc lập (Sandbox)", "Trang 10", 2),
        ("   4.4. Nộp Bot vào Đấu trường và Theo dõi kết quả trực tiếp", "Trang 10", 2),
        ("5. THIẾT KẾ KỸ THUẬT VÀ LUỒNG XỬ LÝ CHI TIẾT (VERSION 2)", "Trang 11", 1),
        ("   5.1. Kiến trúc hệ thống phân tán Client - Master - Worker", "Trang 11", 2),
        ("   5.2. Luồng xử lý một ván đấu OanTuTi đa người chơi", "Trang 11", 2),
        ("   5.3. Cơ chế cách ly và Bảo mật thực thi mã nguồn Bot", "Trang 12", 2),
        ("   5.4. Thiết kế Giao tiếp API và WebSocket", "Trang 12", 2),
        ("   5.5. Thiết kế Cơ sở dữ liệu quan hệ (Database Schema)", "Trang 12", 2),
        ("   5.6. Đặc tả Bot SDK và Thuật toán Bot mẫu", "Trang 13", 2),
        ("6. THỂ THỨC THI ĐẤU VÀ THUẬT TOÁN XẾP HẠNG", "Trang 14", 1),
        ("   6.1. Thể thức thi đấu Vòng bảng và Đấu trường sinh tồn", "Trang 14", 2),
        ("   6.2. Thuật toán tính điểm xếp hạng Elo và Tie-break", "Trang 14", 2),
        ("   6.3. Quy tắc xử lý hòa, mất kết nối và Quá thời gian (Timeout)", "Trang 15", 2),
        ("7. KẾ HOẠCH TRIỂN KHAI, VẬN HÀNH VÀ KIỂM THỬ HỆ THỐNG", "Trang 15", 1),
        ("   7.1. Triển khai Nền tảng hạ tầng và Máy chủ điều phối", "Trang 15", 2),
        ("   7.2. Khởi tạo Cơ sở dữ liệu và Dịch vụ xử lý hàng đợi", "Trang 16", 2),
        ("   7.3. Kế hoạch kiểm thử hệ thống (Unit, Stress, Anti-Cheat)", "Trang 16", 2),
        ("   7.4. Nhận diện rủi ro và Phương án dự phòng kỹ thuật", "Trang 16", 2),
        ("8. KẾT LUẬN VÀ ĐỀ XUẤT PHÁT TRIỂN", "Trang 17", 1),
        ("   8.1. Đánh giá mức độ khả thi và Kết quả đạt được", "Trang 17", 2),
        ("   8.2. Hướng mở rộng cho các phiên bản tương lai", "Trang 17", 2)
    ]

    for title_text, page_str, lvl in toc_list:
        p_t = doc.add_paragraph()
        p_t.paragraph_format.space_before = Pt(1)
        p_t.paragraph_format.space_after = Pt(2)
        p_t.paragraph_format.line_spacing = 1.15
        
        r_title = p_t.add_run(title_text)
        apply_font(r_title, size=11, bold=(lvl == 1))
        
        # Dots
        dots_len = max(4, 76 - len(title_text))
        dots = " " + ". " * (dots_len // 2) + " "
        r_dots = p_t.add_run(dots)
        apply_font(r_dots, size=9.5, bold=False)
        
        r_page = p_t.add_run(page_str)
        apply_font(r_page, size=11, bold=(lvl == 1))

    doc.add_page_break()

    # =========================================================================
    # TRANG 4: 1. TỔNG QUAN HỆ THỐNG (SYSTEM OVERVIEW)
    # =========================================================================
    add_outline_heading("1. TỔNG QUAN HỆ THỐNG", level=1)

    add_outline_heading("1.1. Mục đích và Phạm vi tài liệu", level=2)
    add_p("Tài liệu này đóng vai trò là bản đặc tả kỹ thuật và thiết kế kiến trúc toàn diện cho Hệ thống Thi đấu OanTuTi Bằng Code (OTTV2 Code Battle Arena). Mục đích chính của tài liệu là định hình rõ ràng các yêu cầu kỹ thuật, cấu trúc module, cơ chế tương tác thời gian thực và phương thức tổ chức giải đấu, phục vụ trực tiếp cho quá trình thẩm định Bài tập 3 - Kết hợp cũng như làm kim chỉ nam cho giai đoạn lập trình hiện thực hóa.")

    add_p("Phạm vi của tài liệu bao trọn hai mốc chuyển giao quy định trong đề bài:")
    add_bullet("Giai đoạn Version 1: ", "Tập trung làm rõ bài toán nghiệp vụ, xác định các yêu cầu chức năng và phi chức năng cơ sở, phác thảo luật chơi OanTuTi cải tiến (OTTV2), đồng thời đề xuất kiến trúc sơ bộ và giao thức giao tiếp mức mạng ban đầu.")
    add_bullet("Giai đoạn Version 2: ", "Đi sâu vào thiết kế chi tiết quy trình nghiệp vụ cho từng nhóm tác nhân (Quản trị viên và Lập trình viên), đặc tả kỹ thuật API/WebSocket, thiết kế hệ cơ sở dữ liệu quan hệ, xây dựng cơ chế cách ly thực thi mã nguồn an toàn (Sandbox), đặc tả SDK phát triển Bot và lộ trình kiểm thử, vận hành hoàn chỉnh.")

    add_outline_heading("1.2. Bối cảnh dự án và Nhu cầu thi đấu OanTuTi bằng code", level=2)
    add_p("OanTuTi (hay Kéo - Búa - Bao) từ lâu đã là một trò chơi tương tác phổ biến nhờ luật chơi đơn giản và tính trực quan. Tuy nhiên, trong bối cảnh ứng dụng vào công tác đào tạo công nghệ thông tin và tổ chức các sân chơi học thuật lập trình, mô hình OanTuTi truyền thống bộc lộ hai rào cản cơ bản:")
    add_p("Thứ nhất, tính ngẫu nhiên thuần túy: Việc hai người ra quyết định một lần duy nhất khiến kết quả phụ thuộc chủ yếu vào may mắn, thiếu tính chiến thuật dài hạn và không khuyến khích việc áp dụng các mô hình toán học hay thuật toán phân tích hành vi.")
    add_p("Thứ hai, giới hạn số lượng người chơi: Trò chơi truyền thống chỉ thiết kế cho 2 người đối đầu. Khi mở rộng ra các giải đấu lớn với hàng chục hoặc hàng trăm sinh viên tham gia, việc tổ chức thi đấu thủ công sẽ tốn kém thời gian và dễ phát sinh sai sót trong quá trình ghi nhận điểm số.")

    add_p("Từ thực tiễn đó, nhu cầu xây dựng một 'Đấu trường OanTuTi bằng code' trở nên hết sức thiết thực. Thay vì người chơi tự bấm phím hoặc ra hiệu bằng tay, mỗi thí sinh sẽ lập trình một thuật toán tự hành (Bot). Hệ thống máy chủ đóng vai trò trọng tài trung tâm, tự động phân phối trạng thái trận đấu, nhận nước đi của các Bot trong khung thời gian mili-giây, tính toán sát thương dựa trên luật OTTV2 và cập nhật bảng xếp hạng theo thời gian thực.")

    doc.add_page_break()

    # =========================================================================
    # TRANG 5: 1. TỔNG QUAN HỆ THỐNG (tiếp theo - 1.3 & 1.4)
    # =========================================================================
    add_outline_heading("1.3. Phân quyền và Đối tượng sử dụng", level=2)
    add_p("Hệ thống được thiết kế hướng tới việc phục vụ hai nhóm đối tượng chính, mỗi nhóm được phân quyền truy cập và sở hữu các chức năng nghiệp vụ riêng biệt nhằm đảm bảo tính toàn vẹn và an toàn:")

    t_roles = doc.add_table(rows=3, cols=3)
    col_w_roles = [Cm(3.5), Cm(4.5), Cm(8.0)]
    style_table(t_roles, col_w_roles)

    roles_data = [
        ("Nhóm tác nhân", "Phân quyền truy cập", "Trách nhiệm và Hành vi nghiệp vụ chính"),
        ("Quản trị viên\n(Admin / Trọng tài)", "Toàn quyền hệ thống\n(Super Admin / Judge)", "Tạo lập giải đấu, cấu hình thể thức, quản lý danh sách thí sinh, phê duyệt hoặc đình chỉ Bot vi phạm, kích hoạt phiên thi đấu, trích xuất dữ liệu báo cáo thống kê."),
        ("Lập trình viên\n(User / Sinh viên)", "Quyền người dùng chuẩn\n(Participant / Developer)", "Đăng ký tài khoản, quản lý mã định danh API Key, tải bộ công cụ SDK, nộp mã nguồn hoặc endpoint của Bot, chạy thử nghiệm trong Sandbox và theo dõi diễn biến trận đấu.")
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

    add_p("Sự phân tách quyền lực rõ ràng này giúp ngăn chặn nguy cơ người chơi can thiệp trái phép vào động cơ phân xử trận đấu, đồng thời mang lại sự chủ động tối đa cho ban tổ chức trong khâu điều phối giải.")

    add_outline_heading("1.4. Lộ trình phát triển hệ thống (Version 1 và Version 2)", level=2)
    add_p("Để việc hiện thực hóa dự án diễn ra khoa học, có tính kiểm chứng theo từng giai đoạn, đề án vạch ra lộ trình phát triển phân tách thành hai phiên bản có sự kế thừa liên tục:")

    t_versions = doc.add_table(rows=5, cols=3)
    col_w_ver = [Cm(3.5), Cm(6.0), Cm(6.5)]
    style_table(t_versions, col_w_ver)

    ver_data = [
        ("Hạng mục so sánh", "Giai đoạn Version 1 (Sơ bộ)", "Giai đoạn Version 2 (Bản đầy đủ)"),
        ("Phạm vi đối kháng", "Tập trung chế độ 1v1 cơ bản giữa 2 Bot để hoàn thiện giao thức cốt lõi.", "Hỗ trợ đa người chơi (Multiplayer Arena 4 - 8 Bot) và phân nhánh giải đấu tự động."),
        ("Cơ chế tích hợp Bot", "Bot chạy qua kịch bản tệp tin cục bộ (CLI Script) hoặc API giả lập.", "Hỗ trợ nộp mã nguồn trực tiếp chạy trên Worker Sandbox hoặc kết nối WebSocket an toàn."),
        ("Lưu trữ dữ liệu", "Lưu trữ tệp nhật ký (Log files) đơn giản dạng JSON/CSV.", "Hệ cơ sở dữ liệu quan hệ hoàn chỉnh (PostgreSQL/MySQL) quản lý người dùng, trận đấu và BXH."),
        ("Giao diện giám sát", "Giao diện dòng lệnh (CLI) hiển thị tiến trình từng lượt đấu.", "Bảng điều khiển Web Dashboard trực quan, xem trực tiếp diễn biến ván đấu và bảng Elo.")
    ]
    for r_i, r_data in enumerate(ver_data):
        row = t_versions.rows[r_i]
        for c_i, text in enumerate(r_data):
            cell = row.cells[c_i]
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if c_i == 0 else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            r = p.add_run(text)
            apply_font(r, size=11, bold=(r_i == 0))

    doc.add_page_break()

    # =========================================================================
    # TRANG 6: 2. YÊU CẦU HỆ THỐNG VÀ THIẾT KẾ SƠ BỘ (VERSION 1)
    # =========================================================================
    add_outline_heading("2. YÊU CẦU HỆ THỐNG VÀ THIẾT KẾ SƠ BỘ (VERSION 1)", level=1)

    add_outline_heading("2.1. Yêu cầu chức năng sơ bộ (Functional Requirements)", level=2)
    add_p("Tại giai đoạn Version 1, hệ thống cần đáp ứng tối thiểu các chức năng nền tảng sau:")
    add_bullet("Tiếp nhận quyết định của Bot: ", "Máy chủ cung cấp giao diện đầu vào cho phép hai Bot gửi lựa chọn nước đi (Kéo, Búa hoặc Bao) một cách độc lập và đồng thời.")
    add_bullet("Trọng tài tự động (Referee Module): ", "Thực thi thuật toán so sánh nước đi dựa trên quy tắc tương khắc truyền thống kết hợp luật sinh mệnh sơ bộ, xác định kết quả thắng, thua hoặc hòa của từng lượt đấu.")
    add_bullet("Giới hạn thời gian phản hồi: ", "Thiết lập cơ chế đếm ngược thời gian (Timeout). Nếu Bot không phản hồi trong khoảng thời gian quy định, hệ thống sẽ tự động xử lý theo kịch bản mặc định nhằm giữ cho trận đấu không bị tắc nghẽn.")
    add_bullet("Xuất dữ liệu kết quả: ", "Ghi nhận tiến trình các lượt ra đòn và in ra bảng tổng kết sau khi kết thúc số hiệp đấu thỏa thuận.")

    add_outline_heading("2.2. Yêu cầu phi chức năng (Non-Functional Requirements)", level=2)
    add_p("Bên cạnh các tính năng nghiệp vụ, hệ thống đặt ra các tiêu chuẩn kỹ thuật phi chức năng nghiêm ngặt:")

    t_nfr = doc.add_table(rows=5, cols=3)
    col_w_nfr = [Cm(3.5), Cm(5.0), Cm(7.5)]
    style_table(t_nfr, col_w_nfr)

    nfr_data = [
        ("Tiêu chí phi chức năng", "Chỉ số mục tiêu đề xuất", "Ý nghĩa và Giải pháp kỹ thuật"),
        ("Thời gian phản hồi\n(Latency / Timeout)", "Tối đa 1000ms cho mỗi hiệp đấu", "Đảm bảo nhịp độ trận đấu diễn ra khẩn trương, hạn chế tình trạng treo tiến trình do Bot xử lý chậm."),
        ("Tính công bằng & Bí mật\n(Fair Play & Secrecy)", "Bảo mật lựa chọn trước khi mở đòn\n(Commit-Reveal / Token)", "Bot không thể đọc trộm nước đi của đối phương trước khi lượt đấu kết thúc, triệt tiêu gian lận."),
        ("Tính ổn định\n(Reliability)", "Khả năng phục hồi khi có Bot lỗi", "Khi một Bot bị treo hoặc crash, máy chủ không bị sập mà chỉ ghi nhận xử thua hiệp đó cho Bot lỗi."),
        ("Tính mở rộng\n(Extensibility)", "Cấu trúc module hóa độc lập", "Dễ dàng nâng cấp từ phiên bản đối kháng 1v1 lên phiên bản đấu trường đa người chơi ở Version 2.")
    ]
    for r_i, r_data in enumerate(nfr_data):
        row = t_nfr.rows[r_i]
        for c_i, text in enumerate(r_data):
            cell = row.cells[c_i]
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if c_i == 0 else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            r = p.add_run(text)
            apply_font(r, size=11, bold=(r_i == 0))

    add_p("Các yêu cầu trên là tiền đề kỹ thuật để hệ thống bước vào giai đoạn thiết kế chi tiết các luật chơi cải tiến.")

    doc.add_page_break()

    # =========================================================================
    # TRANG 7: 2. THIẾT KẾ SƠ BỘ (tiếp theo - 2.3, 2.4, 2.5)
    # =========================================================================
    add_outline_heading("2.3. Quy tắc trò chơi OanTuTi mở rộng (OTTV2 Engine)", level=2)
    add_p("Nhằm giải quyết triệt để tính may rủi đơn thuần, phiên bản OanTuTi V2 (OTTV2) đưa vào các cơ chế tính toán mở rộng:")
    add_bullet("Điểm Sinh Mệnh (Hit Points - HP): ", "Mỗi Bot khởi đầu trận đấu với một lượng HP nhất định (ví dụ: 100 HP). Khi bị khắc chế trong một lượt đấu, Bot bị trừ một lượng HP tương ứng với sát thương cơ bản (ví dụ: 20 HP). Trận đấu kéo dài qua nhiều hiệp cho đến khi có Bot cạn HP hoặc hết số hiệp tối đa.")
    add_bullet("Hạn ngạch thẻ nước đi (Hand Deck Limitation): ", "Mỗi Bot được cấp một bộ thẻ hữu hạn trong mỗi hiệp đấu (ví dụ: tối đa 5 thẻ Kéo, 5 thẻ Búa, 5 thẻ Bao trong 15 hiệp). Khi đã sử dụng hết thẻ nào, Bot không thể chọn nước đi đó nữa. Điều này buộc lập trình viên phải xây dựng chiến lược đếm bài và suy luận xác suất thẻ còn lại của đối phương.")
    add_bullet("Cơ chế Năng lượng và Kỹ năng phụ trợ: ", "Mỗi hiệp hòa, hai bên được tích lũy 1 điểm Năng lượng (Energy). Khi đạt đủ điểm, Bot có thể kích hoạt kỹ năng đặc biệt như 'Khiên Bảo Vệ' (chặn sát thương) hoặc 'Tăng Cường Công Kích' (nhân đôi sát thương lượt kế tiếp).")

    add_outline_heading("2.4. Kiến trúc tổng thể sơ bộ của hệ thống", level=2)
    add_p("Ở cấp độ sơ bộ, hệ thống Version 1 được cấu thành từ 3 khối chức năng cơ bản:")
    add_p("1. Khối Điều Phối Ván Đấu (Match Orchestrator): Tiếp nhận tín hiệu bắt đầu trận đấu, thiết lập bộ đếm hiệp, gửi thông báo yêu cầu hành động tới các Bot.")
    add_p("2. Khối Trọng Tài Logic (Game Logic & Arbiter): Tiếp nhận payload nước đi, kiểm tra tính hợp lệ của thẻ bài còn lại trong kho, so sánh tương khắc và tính toán lượng HP khấu trừ.")
    add_p("3. Khối Ghi Nhận Lịch Sử (History & Log Dispatcher): Ghi nhận toàn bộ thông tin từng hiệp đấu vào tệp cấu trúc để gửi về cho các Bot phân tích ở hiệp kế tiếp.")

    add_outline_heading("2.5. Thiết kế giao thức tương tác sơ bộ giữa Bot và Đấu trường", level=2)
    add_p("Giao thức tương tác sơ bộ sử dụng định dạng JSON chuẩn. Quá trình trao đổi diễn ra qua 2 thông điệp chính trong mỗi hiệp:")

    # Trình bày JSON mẫu
    add_p("[1] Máy chủ gửi trạng thái hiệp đấu tới Bot (Match State Request):", bold=True, size=11)
    add_p('{\n'
          '  "match_id": "M-1029",\n'
          '  "round_number": 4,\n'
          '  "my_hp": 80,\n'
          '  "opponent_hp": 60,\n'
          '  "my_remaining_cards": {"ROCK": 4, "PAPER": 3, "SCISSORS": 4},\n'
          '  "opponent_history": ["ROCK", "PAPER", "ROCK"],\n'
          '  "timeout_ms": 1000\n'
          '}', align=WD_ALIGN_PARAGRAPH.LEFT, space_before=1, space_after=4, size=9.5)

    add_p("[2] Bot gửi phản hồi nước đi tới Máy chủ (Action Response):", bold=True, size=11)
    add_p('{\n'
          '  "match_id": "M-1029",\n'
          '  "round_number": 4,\n'
          '  "chosen_action": "SCISSORS",\n'
          '  "use_special_skill": false\n'
          '}', align=WD_ALIGN_PARAGRAPH.LEFT, space_before=1, space_after=6, size=9.5)

    doc.add_page_break()

    # =========================================================================
    # TRANG 8: 3. QUY TRÌNH NGHIỆP VỤ CỦA QUẢN TRỊ VIÊN (ADMIN)
    # =========================================================================
    add_outline_heading("3. QUY TRÌNH NGHIỆP VỤ CỦA QUẢN TRỊ VIÊN (ADMIN)", level=1)

    add_p("Trong Version 2, vai trò của Quản trị viên (Admin) được thiết kế thành chuỗi nghiệp vụ khép kín gồm 6 bước tuần tự, mô phỏng đầy đủ quy trình tổ chức một giải đấu lập trình chuyên nghiệp:")

    add_outline_heading("3.1. Bước 1: Đăng nhập và Khởi tạo phòng đấu", level=2)
    add_p("Quản trị viên truy cập cổng điều hành hệ thống thông qua tài khoản quản trị được phân cấp bảo mật cao (xác thực đa yếu tố nếu cần). Sau khi đăng nhập thành công, quản trị viên thực hiện tạo lập phòng đấu (Match Lobby) hoặc phân vùng giải đấu mới. Tại đây, các tham số kỹ thuật được thiết lập:")
    add_bullet("Tên giải đấu và Mô tả: ", "Xác định tên định danh giải đấu, đối tượng tham gia và thể lệ sơ bộ.")
    add_bullet("Chế độ phòng đấu: ", "Lựa chọn chế độ Đấu tay đôi (1v1 Duel) hoặc Đấu trường hỗn chiến đa Bot (Multi-Bot Arena).")
    add_bullet("Cấu hình trận đấu: ", "Quy định số lượng HP ban đầu, số thẻ bài cấp cho mỗi Bot, giới hạn thời gian phản hồi cho mỗi lượt (ví dụ: 500ms - 1000ms) và số hiệp đấu tối đa.")

    add_outline_heading("3.2. Bước 2: Quản lý danh sách Thí sinh và Thẩm định Bot", level=2)
    add_p("Quản trị viên tiếp nhận hồ sơ đăng ký của các thí sinh/sinh viên. Bước này đảm bảo mọi Bot tham gia đều hợp lệ trước khi bước vào giải đấu chính thức:")
    add_bullet("Kiểm tra tính hợp lệ của tài khoản: ", "Xác minh thông tin sinh viên, mã số sinh viên và cấp quyền tham gia giải.")
    add_bullet("Thẩm định mã nguồn và Giao thức: ", "Kích hoạt tiến trình kiểm tra tự động mã nguồn Bot trong môi trường cô lập sơ bộ. Hệ thống sẽ kiểm tra xem Bot có chứa các thư viện cấm (như can thiệp hệ thống tệp tin, quét cổng mạng trái phép) hay không, đồng thời kiểm tra khả năng bắt tay (Handshake) với giao diện lập trình của máy chủ.")
    add_bullet("Duyệt trạng thái thi đấu: ", "Chuyển trạng thái của Bot sang 'Sẵn sàng thi đấu' (Ready) hoặc yêu cầu thí sinh chỉnh sửa nếu phát hiện lỗi vi phạm kỹ thuật.")

    doc.add_page_break()

    # =========================================================================
    # TRANG 9: 3. QUY TRÌNH NGHIỆP VỤ ADMIN (tiếp theo - 3.3, 3.4, 3.5, 3.6)
    # =========================================================================
    add_outline_heading("3.3. Bước 3: Cấu hình Thể thức và Lịch trình giải đấu", level=2)
    add_p("Quản trị viên lựa chọn thể thức vận hành giải đấu phù hợp với số lượng Bot tham dự:")
    add_bullet("Chia bảng và Bốc thăm: ", "Hệ thống tự động thực hiện bốc thăm ngẫu nhiên hoặc xếp hạt giống dựa trên điểm Elo tích lũy trước đó, chia thành các bảng đấu cân bằng.")
    add_bullet("Lập lịch thi đấu tự động: ", "Xác định khung giờ thi đấu cụ thể cho từng cặp đấu hoặc từng bảng hỗn chiến, phân bổ các Worker chạy ngầm để đảm bảo tải hệ thống ổn định.")

    add_outline_heading("3.4. Bước 4: Vận hành Phiên thi đấu thời gian thực", level=2)
    add_p("Khi đến giờ thi đấu, quản trị viên phát lệnh kích hoạt phiên thi đấu (Start Match Session):")
    add_bullet("Giám sát trạng thái kết nối: ", "Theo dõi bảng điều khiển trực quan hiển thị trạng thái kết nối thời gian thực của các Bot (Online, Pending, Error, Disconnected).")
    add_bullet("Quyền can thiệp trọng tài: ", "Quản trị viên có các nút chức năng khẩn cấp: Tạm dừng trận đấu (Pause), Tiếp tục (Resume), Hủy hiệp đấu và đấu lại (Replay Round), hoặc Xử thua trực tiếp đối với Bot gặp sự cố nghiêm trọng.")

    add_outline_heading("3.5. Bước 5: Báo cáo, Thống kê và Xếp hạng giải đấu", level=2)
    add_p("Sau khi chuỗi trận đấu hoàn tất, hệ thống tự động tổng hợp kết quả:")
    add_bullet("Cập nhật Bảng xếp hạng (Leaderboard): ", "Áp dụng thuật toán tính điểm để xếp thứ hạng từ Quán quân đến các thứ hạng sau.")
    add_bullet("Trích xuất Báo cáo phân tích: ", "Hệ thống cung cấp báo cáo chi tiết về tỷ lệ lựa chọn nước đi (ví dụ: Kéo 32%, Búa 36%, Bao 32%), thời gian phản hồi trung bình của từng Bot, số lượng hiệp hòa, hỗ trợ giảng viên đánh giá năng lực tư duy thuật toán của sinh viên.")

    add_outline_heading("3.6. Bước 6: Cài đặt hệ thống và Giám sát máy chủ", level=2)
    add_p("Quản trị viên theo dõi sức khỏe phần cứng máy chủ trung tâm:")
    add_bullet("Giám sát tài nguyên: ", "Theo dõi mức độ sử dụng CPU, RAM, băng thông mạng và độ trễ phản hồi của các tiến trình Worker thi đấu.")
    add_bullet("Quản lý Khóa bảo mật: ", "Thu hồi hoặc cấp mới các khóa API Key, sao lưu cơ sở dữ liệu định kỳ sau mỗi giải đấu.")

    doc.add_page_break()

    # =========================================================================
    # TRANG 10: 4. QUY TRÌNH NGHIỆP VỤ CỦA NGƯỜI CHƠI (USER / DEVELOPER)
    # =========================================================================
    add_outline_heading("4. QUY TRÌNH NGHIỆP VỤ CỦA NGƯỜI CHƠI / LẬP TRÌNH VIÊN (USER)", level=1)

    add_p("Quy trình tham gia của thí sinh (sinh viên / lập trình viên) được chuẩn hóa nhằm tối ưu trải nghiệm học tập và phát triển thuật toán:")

    add_outline_heading("4.1. Đăng ký tài khoản và Quản lý khóa API (API Key)", level=2)
    add_p("Người chơi truy cập giao diện Web của hệ thống để tạo lập tài khoản cá nhân hoặc nhóm:")
    add_bullet("Khởi tạo danh tính: ", "Khai báo thông tin nhóm, ngôn ngữ lập trình dự kiến sử dụng (Python, C++ hoặc JavaScript).")
    add_bullet("Nhận Khóa Bí Mật (API Key): ", "Hệ thống cấp cho mỗi tài khoản một cặp khóa bảo mật (Client ID & Secret Token) duy nhất dùng để xác thực quyền gửi lệnh của Bot vào phòng đấu.")

    add_outline_heading("4.2. Tải Bot SDK và Phát triển thuật toán chiến lược", level=2)
    add_p("Thí sinh tải về bộ công cụ phát triển phần mềm (Bot SDK) do ban tổ chức cung cấp:")
    add_bullet("Cấu trúc mã nguồn khung (Boilerplate Code): ", "SDK đã đóng gói sẵn các hàm kết nối mạng, giải mã JSON và xử lý Timeout. Lập trình viên chỉ cần tập trung viết logic trong một hàm cốt lõi duy nhất: `make_decision(game_state)`.")
    add_bullet("Xây dựng chiến lược phân tích: ", "Thí sinh có thể áp dụng các kỹ thuật như lưu trữ lịch sử ra đòn của đối thủ trong mảng nhớ, tính toán tần suất xuất hiện, sử dụng ma trận chuyển dịch trạng thái (Markov Chain) hoặc xây dựng cây quyết định thích nghi.")

    add_outline_heading("4.3. Kiểm thử Bot trong môi trường độc lập (Sandbox)", level=2)
    add_p("Trước khi tham gia giải đấu lớn, người chơi sử dụng công cụ kiểm thử cục bộ và môi trường Sandbox trực tuyến:")
    add_bullet("Chế độ Đấu tập với Bot mẫu (Mock Bot Practice): ", "Hệ thống cung cấp sẵn các Bot mẫu có chiến thuật định sẵn (Bot ngẫu nhiên, Bot bắt chước, Bot thiên lệch một nước đi) để thí sinh kiểm thử thuật toán của mình.")
    add_bullet("Đo lường thời gian thực thi: ", "Giúp lập trình viên phát hiện sớm các đoạn mã chạy quá thời gian cho phép (Over-timeout) để kịp thời tối ưu độ phức tạp thuật toán.")

    add_outline_heading("4.4. Nộp Bot vào Đấu trường và Theo dõi kết quả trực tiếp", level=2)
    add_p("Khi thuật toán đã hoàn thiện, thí sinh tiến hành nộp bài:")
    add_bullet("Hình thức nộp: ", "Tải tệp mã nguồn đóng gói lên cổng nộp bài hoặc cung cấp URL Webhook của máy chủ Bot cá nhân.")
    add_bullet("Theo dõi trận đấu trực quan: ", "Sinh viên đăng nhập vào giao diện quan sát (Spectator Mode) để xem Bot của mình thi đấu trực tiếp với các đối thủ trên đồ họa sàn đấu số, theo dõi lượng HP biến động và diễn biến bảng xếp hạng.")

    doc.add_page_break()

    # =========================================================================
    # TRANG 11: 5. THIẾT KẾ KỸ THUẬT VÀ LUỒNG XỬ LÝ CHI TIẾT (VERSION 2)
    # =========================================================================
    add_outline_heading("5. THIẾT KẾ KỸ THUẬT VÀ LUỒNG XỬ LÝ CHI TIẾT (VERSION 2)", level=1)

    add_outline_heading("5.1. Kiến trúc hệ thống phân tán Client - Master - Worker", level=2)
    add_p("Nhằm bảo đảm khả năng mở rộng và chịu tải cao khi tổ chức giải đấu có nhiều bảng đấu diễn ra đồng thời, Version 2 áp dụng mô hình kiến trúc phân tán 3 tầng hiện đại:")

    t_arch = doc.add_table(rows=4, cols=3)
    col_w_arch = [Cm(3.5), Cm(4.5), Cm(8.0)]
    style_table(t_arch, col_w_arch)

    arch_data = [
        ("Thành phần kiến trúc", "Công nghệ đề xuất", "Trách nhiệm và Vai trò vận hành"),
        ("Tầng Điều Phối Trung Tâm\n(Master Server / API Gateway)", "Node.js / Express\nhoặc Python FastAPI", "Tiếp nhận yêu cầu từ thí sinh, xác thực quyền thông qua JWT/API Key, quản lý hàng đợi ghép cặp và điều phối các phòng đấu."),
        ("Tầng Thực Thi Ván Đấu\n(Match Workers)", "Worker Node chạy ngầm\n(Python Engine / Docker)", "Mỗi Worker chịu trách nhiệm vận hành một ván đấu cụ thể độc lập. Worker trực tiếp giao tiếp với các Bot, tính toán logic OTTV2 và ghi log."),
        ("Tầng Lưu Trữ & Cache\n(Database & Message Broker)", "PostgreSQL & Redis Cache", "Redis quản lý trạng thái phiên thi đấu tức thời (in-memory state); PostgreSQL lưu trữ lâu dài thông tin người dùng, lịch sử trận đấu và BXH.")
    ]
    for r_i, r_data in enumerate(arch_data):
        row = t_arch.rows[r_i]
        for c_i, text in enumerate(r_data):
            cell = row.cells[c_i]
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if c_i == 0 else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            r = p.add_run(text)
            apply_font(r, size=11, bold=(r_i == 0))

    add_outline_heading("5.2. Luồng xử lý một ván đấu OanTuTi đa người chơi", level=2)
    add_p("Quy trình vòng lặp của một ván đấu (Match Loop) diễn ra tuần tự qua các bước nghiêm ngặt sau:")
    add_bullet("Bước 1 - Khởi tạo phiên: ", "Worker thiết lập bộ nhớ phòng đấu, nạp danh sách Bot tham gia, cấp phát lượng HP cơ sở và kho thẻ bài ban đầu cho mỗi người chơi.")
    add_bullet("Bước 2 - Phát tín hiệu hiệp đấu: ", "Worker phát đi gói tin trạng thái (Broadcasting State) tới tất cả các Bot trong phòng thông qua kết nối mạng.")
    add_bullet("Bước 3 - Thu nhận quyết định đồng bộ: ", "Worker kích hoạt bộ đếm ngược thời gian chính xác (ví dụ: 1000ms). Tất cả các Bot gửi về mã quyết định được mã hóa bí mật.")
    add_bullet("Bước 4 - Mở đòn và Tính toán đa phương: ", "Worker giải mã nước đi, kiểm tra tính hợp lệ của thẻ bài. Hệ thống so sánh đối chiếu đa chiều giữa các Bot, tính toán lượng HP khấu trừ tương ứng cho các Bot bị khắc chế.")
    add_bullet("Bước 5 - Cập nhật và Kiểm tra điều kiện dừng: ", "Khấu trừ HP, cập nhật kho thẻ. Nếu có Bot đạt điều kiện loại hoặc chỉ còn lại Bot sống sót duy nhất, ván đấu kết thúc. Ngược lại, chuyển tiếp sang hiệp tiếp theo.")

    doc.add_page_break()

    # =========================================================================
    # TRANG 12: 5. THIẾT KẾ KỸ THUẬT (tiếp theo - 5.3, 5.4, 5.5)
    # =========================================================================
    add_outline_heading("5.3. Cơ chế cách ly và Bảo mật thực thi mã nguồn Bot", level=2)
    add_p("Vấn đề an toàn thông tin là ưu tiên hàng đầu khi cho phép chạy mã nguồn do sinh viên gửi lên máy chủ:")
    add_bullet("Cách ly tiến trình (Process Isolation): ", "Mỗi Bot được khởi chạy trong một container Docker thu nhỏ hoặc môi trường thực thi hạn chế tài nguyên (cgroups/namespaces).")
    add_bullet("Hạn chế quyền hệ thống (System Call Filtering): ", "Chặn toàn bộ các lệnh gọi hệ thống nguy hiểm như truy cập tệp tin ngoài thư mục tạm, tạo kết nối mạng ra bên ngoài môi trường giải đấu, hoặc đọc biến môi trường của máy chủ.")
    add_bullet("Giới hạn tài nguyên (Resource Quotas): ", "Mỗi tiến trình Bot bị giới hạn nghiêm ngặt về dung lượng RAM (tối đa 128MB) và mức sử dụng CPU (tối đa 1 nhân), ngăn chặn tình trạng một Bot lặp vô hạn gây cạn kiệt tài nguyên máy chủ.")

    add_outline_heading("5.4. Thiết kế Giao tiếp API và WebSocket", level=2)
    add_p("Hệ thống cung cấp danh mục các điểm cuối (Endpoints) chuẩn phục vụ việc vận hành:")

    t_api = doc.add_table(rows=5, cols=4)
    col_w_api = [Cm(2.5), Cm(5.0), Cm(3.5), Cm(5.0)]
    style_table(t_api, col_w_api)

    api_data = [
        ("Phương thức", "Điểm cuối (Endpoint)", "Giao thức", "Mô tả chức năng"),
        ("POST", "/api/v2/auth/login", "HTTP REST", "Xác thực danh tính và trả về Token phiên."),
        ("POST", "/api/v2/bots/submit", "HTTP REST", "Nộp mã nguồn Bot hoặc khai báo Webhook URL."),
        ("WS", "/ws/arena/{match_id}", "WebSocket", "Kênh tương tác thời gian thực giữa Bot và Máy chủ."),
        ("GET", "/api/v2/matches/live", "HTTP / SSE", "Truyền luồng dữ liệu xem trực tiếp trận đấu lên Web.")
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

    add_outline_heading("5.5. Thiết kế Cơ sở dữ liệu quan hệ (Database Schema)", level=2)
    add_p("Mô hình dữ liệu được chuẩn hóa ở cấp độ 3NF nhằm đảm bảo tính toàn vẹn:")
    add_bullet("Bảng Users: ", "Lưu trữ thông tin tài khoản (user_id, username, password_hash, full_name, role, created_at).")
    add_bullet("Bảng Bots: ", "Lưu trữ thông tin Bot dự thi (bot_id, user_id, bot_name, programming_language, source_code_path, elo_rating, is_active).")
    add_bullet("Bảng Tournaments & Matches: ", "Quản lý cơ cấu giải đấu và thông tin từng trận (match_id, tournament_id, status, winner_bot_id, start_time, end_time).")
    add_bullet("Bảng Match_Rounds: ", "Lưu chi tiết từng hiệp đấu phục vụ tra cứu tranh chấp (round_id, match_id, round_number, bot_actions_json, hp_snapshot_json, created_at).")

    doc.add_page_break()

    # =========================================================================
    # TRANG 13: 5. THIẾT KẾ KỸ THUẬT (tiếp theo - 5.6 Bot SDK & Code mẫu)
    # =========================================================================
    add_outline_heading("5.6. Đặc tả Bot SDK và Thuật toán Bot mẫu", level=2)
    add_p("Bộ công cụ phát triển Bot SDK được thiết kế gọn nhẹ, trực quan, hỗ trợ tối đa cho sinh viên trong quá trình phát triển thuật toán. Dưới đây là kiến trúc khung và ví dụ mã nguồn Bot mẫu bằng ngôn ngữ Python:")

    add_p("Mã nguồn Khung Bot SDK (Template chuẩn triển khai):", bold=True, size=11)
    add_p(
        '# File: ottv2_bot_agent.py\n'
        'import random\n'
        '\n'
        'class OTTV2BotBase:\n'
        '    def __init__(self, bot_name="TacticalBot"):\n'
        '        self.bot_name = bot_name\n'
        '        self.opponent_history = []\n'
        '\n'
        '    def on_round_start(self, game_state):\n'
        '        """Hàm nhận trạng thái ván đấu từ máy chủ"""\n'
        '        self.my_hp = game_state.get("my_hp", 100)\n'
        '        self.opponent_hp = game_state.get("opponent_hp", 100)\n'
        '        self.my_deck = game_state.get("my_deck", {"ROCK": 5, "PAPER": 5, "SCISSORS": 5})\n'
        '        if "last_opponent_move" in game_state:\n'
        '            self.opponent_history.append(game_state["last_opponent_move"])\n'
        '\n'
        '    def make_move(self):\n'
        '        """Hàm ra quyết định chiến lược của thí sinh"""\n'
        '        # Lấy danh sách các thẻ bài còn khả dụng trong tay\n'
        '        available_cards = [card for card, count in self.my_deck.items() if count > 0]\n'
        '        if not available_cards:\n'
        '            return "ROCK"  # Nước đi mặc định nếu hết thẻ\n'
        '\n'
        '        # Phân tích tần suất: Nếu đối thủ có xu hướng ra Búa nhiều\n'
        '        if self.opponent_history and self.opponent_history[-1] == "ROCK":\n'
        '            if "PAPER" in available_cards:\n'
        '                return "PAPER"  # Khắc chế Búa của đối thủ\n'
        '\n'
        '        # Thuật toán ngẫu nhiên có trọng số theo lượng thẻ còn lại\n'
        '        return random.choice(available_cards)\n'
        '\n'
        '    def on_round_end(self, round_result):\n'
        '        """Cập nhật dữ liệu sau khi trọng tài công bố kết quả"""\n'
        '        pass\n',
        align=WD_ALIGN_PARAGRAPH.LEFT, space_before=1, space_after=6, size=9.5
    )

    add_p("Với cấu trúc trên, sinh viên không cần am hiểu sâu về giao thức mạng tầng thấp mà có thể nhanh chóng tập trung vào việc nghiên cứu thuật toán xác suất, lý thuyết trò chơi (Game Theory) và học tăng cường (Reinforcement Learning) cho Bot của mình.")

    doc.add_page_break()

    # =========================================================================
    # TRANG 14: 6. THỂ THỨC THI ĐẤU VÀ THUẬT TOÁN XẾP HẠNG
    # =========================================================================
    add_outline_heading("6. THỂ THỨC THI ĐẤU VÀ THUẬT TOÁN XẾP HẠNG", level=1)

    add_outline_heading("6.1. Thể thức thi đấu Vòng bảng và Đấu trường sinh tồn", level=2)
    add_p("Hệ thống hỗ trợ hai thể thức thi đấu chính thức tùy thuộc vào quy mô tổ chức:")
    add_bullet("Thể thức Vòng Bảng kết hợp Loại Trực Tiếp (Group Stage & Knockout): ", "Thích hợp cho giải đấu chính thức quy mô từ 32 đến 64 Bot. Các Bot được chia vào các bảng 4 đội, thi đấu vòng tròn tính điểm. Hai Bot đứng đầu mỗi bảng giành quyền vào vòng đấu loại trực tiếp (BO3 cho Tứ kết/Bán kết và BO5 cho Chung kết).")
    add_bullet("Thể thức Đấu Trường Sinh Tồn (Battle Royale Multi-Bot Arena): ", "Thích hợp cho các trận đấu biểu diễn giao lưu học thuật. 4 đến 8 Bot cùng tham gia một phòng đấu duy nhất. Mỗi hiệp đấu, các Bot ra đòn đồng thời. Bot bị khắc chế bởi số đông đối thủ sẽ mất HP nhanh hơn. Bot duy trì được lượng HP cuối cùng trên sàn đấu sẽ giành chiến thắng chung cuộc.")

    add_outline_heading("6.2. Thuật toán tính điểm xếp hạng Elo và Tie-break", level=2)
    add_p("Để đánh giá trình độ thuật toán một cách khách quan liên tục qua nhiều giải đấu, hệ thống tích hợp thuật toán xếp hạng chuẩn Elo:")
    add_p("Kỳ vọng thắng $E_A$ của Bot A trước Bot B được xác định qua công thức toán học:")
    add_p("E_A = 1 / (1 + 10 ^ ((R_B - R_A) / 400))", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=3, space_after=3, bold=True, size=11)
    add_p("Sau khi trận đấu kết thúc, điểm xếp hạng mới $R'_A$ được cập nhật theo hệ số K:")
    add_p("R'_A = R_A + K * (S_A - E_A)", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=3, space_after=4, bold=True, size=11)
    add_p("Trong đó: $S_A$ nhận giá trị 1 (Thắng), 0.5 (Hòa), hoặc 0 (Thua); hệ số K được điều chỉnh linh hoạt (mặc định K = 32 đối với các ván đấu chính thức).")

    add_p("Trong trường hợp các Bot có điểm số bằng nhau tại vòng bảng, chỉ số phụ (Tie-break) được xét theo thứ tự ưu tiên:")
    add_p("1. Kết quả đối đầu trực tiếp giữa hai Bot (Head-to-Head).\n"
          "2. Hiệu số HP tích lũy qua toàn bộ các trận đấu trong bảng.\n"
          "3. Tổng số hiệp thắng trực tiếp nhiều hơn.", space_before=1, space_after=6)

    doc.add_page_break()

    # =========================================================================
    # TRANG 15: 6. THỂ THỨC (tiếp theo - 6.3) & 7. KẾ HOẠCH TRIỂN KHAI
    # =========================================================================
    add_outline_heading("6.3. Quy tắc xử lý hòa, mất kết nối và Quá thời gian (Timeout)", level=2)
    add_p("Để đảm bảo tính liên tục của giải đấu, các tình huống sự cố được chuẩn hóa bằng bộ quy tắc nghiêm ngặt:")

    t_err_rules = doc.add_table(rows=4, cols=3)
    col_w_err = [Cm(3.5), Cm(4.5), Cm(8.0)]
    style_table(t_err_rules, col_w_err)

    err_data = [
        ("Tình huống sự cố", "Phản ứng của hệ thống", "Quy chế xử lý và Biện pháp tài phán"),
        ("Bot phản hồi quá giờ\n(Over Timeout > 1000ms)", "Mặc định gán nước đi ngẫu nhiên hoặc bỏ lượt", "Bot bị phạt cảnh cáo lần 1. Nếu vi phạm quá 3 hiệp trong một ván, Bot bị xử thua ván đấu đó do làm chậm tiến độ giải."),
        ("Bot mất kết nối mạng\n(Disconnected Socket)", "Tạm dừng trận đấu trong 30 giây", "Hệ thống cho phép kết nối lại (Re-connect). Quá 30 giây không phản hồi, xử thua kỹ thuật cho Bot bị ngắt kết nối."),
        ("Trận đấu kéo dài bất phân thắng bại", "Kích hoạt Hiệp phụ Đột tử\n(Sudden Death)", "Loại bỏ hoàn toàn cơ chế hòa: bot nào ra nước đi thắng thế đầu tiên ở hiệp phụ sẽ ngay lập tức được công nhận chiến thắng.")
    ]
    for r_i, r_data in enumerate(err_data):
        row = t_err_rules.rows[r_i]
        for c_i, text in enumerate(r_data):
            cell = row.cells[c_i]
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if c_i == 0 else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            r = p.add_run(text)
            apply_font(r, size=11, bold=(r_i == 0))

    add_outline_heading("7. KẾ HOẠCH TRIỂN KHAI, VẬN HÀNH VÀ KIỂM THỬ HỆ THỐNG", level=1)

    add_outline_heading("7.1. Triển khai Nền tảng hạ tầng và Máy chủ điều phối", level=2)
    add_p("Quá trình triển khai kỹ thuật được thiết lập theo từng lớp độc lập:")
    add_bullet("Môi trường máy chủ (Host Server): ", "Cấu hình trên hệ điều hành Linux (Ubuntu Server LTS) nhằm đảm bảo hiệu năng và độ ổn định cao.")
    add_bullet("Đóng gói dịch vụ (Containerization): ", "Toàn bộ hệ thống Backend, Worker và Database được đóng gói bằng Docker Compose, giúp việc triển khai và tái tạo môi trường diễn ra nhất quán và nhanh chóng.")

    doc.add_page_break()

    # =========================================================================
    # TRANG 16: 7. KẾ HOẠCH TRIỂN KHAI (tiếp theo - 7.2, 7.3, 7.4)
    # =========================================================================
    add_outline_heading("7.2. Khởi tạo Cơ sở dữ liệu và Dịch vụ xử lý hàng đợi", level=2)
    add_p("Thiết lập môi trường dữ liệu và hàng đợi tin nhắn trước giờ vận hành:")
    add_bullet("Thiết lập cơ sở dữ liệu: ", "Thực thi các tệp di chuyển (Database Migrations), tạo bảng biểu, chỉ mục (Indexes) trên các khóa ngoại và cột tra cứu thường xuyên nhằm tối ưu tốc độ truy vấn.")
    add_bullet("Cấu hình hàng đợi Redis: ", "Khởi tạo các kênh tin nhắn (Pub/Sub Channels) phục vụ việc bắt cặp phòng đấu tự động và phát luồng dữ liệu thời gian thực lên giao diện web theo dõi.")

    add_outline_heading("7.3. Kế hoạch kiểm thử hệ thống (Unit, Stress, Anti-Cheat)", level=2)
    add_p("Trước khi công bố chính thức, hệ thống trải qua 3 giai đoạn kiểm thử chặt chẽ:")

    t_test = doc.add_table(rows=4, cols=4)
    col_w_test = [Cm(3.0), Cm(4.5), Cm(5.0), Cm(3.5)]
    style_table(t_test, col_w_test)

    test_data = [
        ("Hạng mục kiểm thử", "Mục tiêu và Phạm vi", "Kịch bản kiểm thử đề xuất", "Tiêu chuẩn đạt yêu cầu"),
        ("Kiểm thử Đơn vị\n(Unit Testing)", "Kiểm tra tính chính xác của hàm trọng tài OTTV2", "Chạy 1000 ván đấu giả lập với đầy đủ các cặp nước đi và kỹ năng", "100% các ca so sánh đều ra kết quả logic đúng."),
        ("Kiểm thử Tải cao\n(Stress Testing)", "Đo lường năng lực chịu tải của máy chủ", "Mô phỏng 32 trận đấu diễn ra song song cùng lúc", "Độ trễ xử lý ván đấu không vượt quá 50ms."),
        ("Kiểm thử Bảo mật\n(Anti-Cheat Test)", "Phát hiện mã độc và gian lận từ phía Bot", "Gửi các Bot cố tình gọi lệnh cấm hoặc chiếm dụng bộ nhớ", "Hệ thống cô lập thành công, ngắt tiến trình Bot an toàn.")
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

    add_outline_heading("7.4. Nhận diện rủi ro và Phương án dự phòng kỹ thuật", level=2)
    add_p("Nhằm hạn chế tối đa các tình huống bất khả kháng, ban dự án đề xuất các phương án dự phòng:")
    add_bullet("Rủi ro mạng không ổn định: ", "Chuẩn bị sẵn máy chủ dự phòng cục bộ (Local Offline Server) kết nối qua mạng nội bộ LAN, cho phép chuyển đổi chế độ thi đấu offline ngay khi mạng internet công cộng gặp sự cố.")
    add_bullet("Rủi ro Bot gặp lỗi crash bất ngờ: ", "Hệ thống duy trì cơ chế ghi nhận nhật ký chi tiết (Crash Dump) để hỗ trợ lập trình viên khắc phục sự cố nhanh chóng mà không gây ảnh hưởng đến lịch thi đấu chung.")

    doc.add_page_break()

    # =========================================================================
    # TRANG 17: 8. KẾT LUẬN VÀ ĐỀ XUẤT PHÁT TRIỂN
    # =========================================================================
    add_outline_heading("8. KẾT LUẬN VÀ ĐỀ XUẤT PHÁT TRIỂN", level=1)

    add_outline_heading("8.1. Đánh giá mức độ khả thi và Kết quả đạt được", level=2)
    add_p("Bản đề án 'Hệ thống Thi đấu OanTuTi Bằng Code (OTTV2 Code Battle Arena)' đã giải quyết triệt để yêu cầu của Bài tập 3 - Kết hợp thông qua việc phân tích và thiết kế hoàn chỉnh hai giai đoạn cốt lõi:")
    add_p("Ở giai đoạn Version 1, đề án đã xác định thành công khung yêu cầu chức năng, phi chức năng, luật chơi mở rộng OTTV2 và giao thức tương tác sơ bộ, tạo nền tảng vững chắc cho việc thiết kế kiến trúc.")
    add_p("Ở giai đoạn Version 2, tài liệu đã phát triển thành bản đặc tả kỹ thuật toàn diện, bao gồm quy trình nghiệp vụ chuyên biệt cho Quản trị viên và Lập trình viên, kiến trúc phân tán Master-Worker chịu tải cao, cơ chế bảo mật Sandbox an toàn, giao diện API/WebSocket, thiết kế cơ sở dữ liệu chuẩn hóa và lộ trình kiểm thử, vận hành thực tế.")

    add_p("Dự án được đánh giá có tính khả thi kỹ thuật cao, đáp ứng đầy đủ năng lực triển khai thực tế trên hạ tầng máy chủ của nhà trường, đồng thời mang lại giá trị thực tiễn to lớn trong việc tạo dựng sân chơi trí tuệ, kích thích tinh thần sáng tạo thuật toán cho sinh viên ngành công nghệ thông tin.")

    add_outline_heading("8.2. Hướng mở rộng cho các phiên bản tương lai", level=2)
    add_p("Dựa trên nền tảng kiến trúc đã thiết kế, hệ thống có tiềm năng mở rộng sang các định hướng chuyên sâu:")
    add_bullet("Tích hợp Trí tuệ Nhân tạo nâng cao (AI Agent): ", "Cung cấp môi trường huấn luyện học tăng cường sâu (Deep Reinforcement Learning / Q-Learning) cho phép sinh viên huấn luyện các Agent tự tối ưu hóa chiến thuật qua hàng triệu ván đấu mô phỏng.")
    add_bullet("Mở rộng thể loại trò chơi (Multi-Game Arena): ", "Dễ dàng điều chỉnh module trọng tài để hỗ trợ thêm các tựa game kinh điển khác như Cờ vây, Cờ caro, Đua xe chiến thuật bằng code.")

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

    # Save document
    output_filename = "Bao_Cao_Du_An_Thi_Dau_OanTuTi_Bang_Code.docx"
    doc.save(output_filename)
    print(f"SUCCESS: Generated {output_filename}")

if __name__ == "__main__":
    create_full_project_document()

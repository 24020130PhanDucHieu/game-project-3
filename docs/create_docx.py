# -*- coding: utf-8 -*-
import os
import docx
from docx.shared import Pt, RGBColor, Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn, nsdecls

def create_document():
    doc = docx.Document()

    # Configure page setup - A4, standard administrative margins
    for section in doc.sections:
        section.top_margin = Cm(2.0)
        section.bottom_margin = Cm(2.0)
        section.left_margin = Cm(3.0)
        section.right_margin = Cm(2.0)
        section.page_width = Cm(21.0)
        section.page_height = Cm(29.7)

    # Base styling - Times New Roman, 12pt, Black
    normal_style = doc.styles['Normal']
    normal_style.font.name = 'Times New Roman'
    normal_style.font.size = Pt(12)
    normal_style.font.color.rgb = RGBColor(0, 0, 0)

    # Set default rFonts
    rPr = normal_style.element.get_or_add_rPr()
    rFonts = OxmlElement('w:rFonts')
    rFonts.set(qn('w:ascii'), 'Times New Roman')
    rFonts.set(qn('w:hAnsi'), 'Times New Roman')
    rFonts.set(qn('w:cs'), 'Times New Roman')
    rFonts.set(qn('w:eastAsia'), 'Times New Roman')
    rPr.append(rFonts)

    def apply_run_font(run, size=12, bold=False, italic=False):
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

    def add_p(text="", align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_before=0, space_after=6, line_spacing=1.2, bold=False, italic=False, size=12):
        p = doc.add_paragraph()
        p.alignment = align
        p.paragraph_format.space_before = Pt(space_before)
        p.paragraph_format.space_after = Pt(space_after)
        p.paragraph_format.line_spacing = line_spacing
        if text:
            r = p.add_run(text)
            apply_run_font(r, size=size, bold=bold, italic=italic)
        return p

    def add_h1(text):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.space_before = Pt(14)
        p.paragraph_format.space_after = Pt(5)
        p.paragraph_format.keep_with_next = True
        r = p.add_run(text)
        apply_run_font(r, size=13.5, bold=True)
        return p

    def add_h2(text):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.space_before = Pt(10)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.keep_with_next = True
        r = p.add_run(text)
        apply_run_font(r, size=12.5, bold=True)
        return p

    def add_h3(text):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.space_before = Pt(8)
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.keep_with_next = True
        r = p.add_run(text)
        apply_run_font(r, size=12, bold=True, italic=True)
        return p

    def add_bullet(bold_prefix, text):
        p = doc.add_paragraph(style='List Bullet')
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.line_spacing = 1.2
        if bold_prefix:
            r_pre = p.add_run(bold_prefix)
            apply_run_font(r_pre, size=12, bold=True)
        r_txt = p.add_run(text)
        apply_run_font(r_txt, size=12, bold=False)
        return p

    def style_table(table, col_widths=None):
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        # Table borders - pure black 0.5pt
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
            # prevent row split across pages
            trPr = row._tr.get_or_add_trPr()
            trPr.append(parse_xml(f'<w:cantSplit {nsdecls("w")}/>'))
            if row_idx == 0:
                trPr.append(parse_xml(f'<w:tblHeader {nsdecls("w")}/>'))

            for col_idx, cell in enumerate(row.cells):
                if col_widths and col_idx < len(col_widths):
                    cell.width = col_widths[col_idx]
                tcPr = cell._tc.get_or_add_tcPr()
                # cell margins
                tcMar = parse_xml(
                    f'<w:tcMar {nsdecls("w")}>\n'
                    f'  <w:top w:w="120" w:type="dxa"/>\n'
                    f'  <w:bottom w:w="120" w:type="dxa"/>\n'
                    f'  <w:left w:w="150" w:type="dxa"/>\n'
                    f'  <w:right w:w="150" w:type="dxa"/>\n'
                    f'</w:tcMar>'
                )
                tcPr.append(tcMar)
                # Shading for header row: very subtle light neutral tint or no tint
                if row_idx == 0:
                    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="F0F0F0"/>')
                    tcPr.append(shd)

    # ==========================
    # HEADER / FOOTER
    # ==========================
    header = doc.sections[0].header
    hp = header.paragraphs[0]
    hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    hr = hp.add_run("Kế hoạch Dự thảo: Tổ chức Giải đấu OTTV2 Nhiều Người Chơi")
    apply_run_font(hr, size=9, italic=True)

    footer = doc.sections[0].footer
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fr = fp.add_run("Tài liệu Lưu hành Nội bộ - Định hướng Tổ chức & Vận hành")
    apply_run_font(fr, size=9, italic=True)

    # ==========================
    # TIÊU ĐỀ TÀI LIỆU
    # ==========================
    p_meta = add_p("DỰ THẢO ĐỀ ÁN VẬN HÀNH HOẠT ĐỘNG PHONG TRÀO", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=2, size=11, bold=True)
    p_line = add_p("---o0o---", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=12, size=10)

    p_title = add_p("KẾ HOẠCH TỔ CHỨC GIẢI ĐẤU TRÒ CHƠI OẲN TÙ TÌ V2 (OTTV2)\nCHẾ ĐỘ ĐA NGƯỜI CHƠI (MULTIPLAYER TOURNAMENT)", 
                    align=WD_ALIGN_PARAGRAPH.CENTER, space_before=6, space_after=14, size=15, bold=True)

    # Thông tin sơ bộ
    p_info = add_p(align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=18, size=11, italic=True)
    r1 = p_info.add_run("Đơn vị xây dựng đề án: ")
    apply_run_font(r1, size=11, bold=True)
    r2 = p_info.add_run("Ban Phát triển Trò chơi & Điều phối Sự kiện\n")
    apply_run_font(r2, size=11, italic=True)
    r3 = p_info.add_run("Thời gian lập kế hoạch: ")
    apply_run_font(r3, size=11, bold=True)
    r4 = p_info.add_run("Tháng 10/2026 | Tình trạng tài liệu: Bản lấy ý kiến hoàn thiện")
    apply_run_font(r4, size=11, italic=True)

    # =======================================================
    # PHẦN: TÓM TẮT KẾ HOẠCH (EXECUTIVE SUMMARY)
    # =======================================================
    add_h1("TÓM TẮT KẾ HOẠCH (EXECUTIVE SUMMARY)")

    add_p("Tài liệu này trình bày phương án phác thảo cho việc tổ chức giải đấu thử nghiệm đối với trò chơi Oẳn Tù Tì V2 (OTTV2) ở chế độ thi đấu nhiều người. Mục đích chính của kế hoạch là tạo cơ sở thảo luận, định hình quy mô, phân bổ nguồn lực và kiểm soát các rủi ro có khả năng xuất hiện trong quá trình triển khai thực tế. Bản kế hoạch được xây dựng dựa trên nguyên tắc cẩn trọng, không đưa ra các nhận định chủ quan hay cứng nhắc, mà hướng vào các phương án thích ứng linh hoạt theo diễn biến thực tế.")

    # Bảng tóm tắt các thông số then chốt
    t_sum = doc.add_table(rows=6, cols=2)
    col_w_sum = [Cm(5.0), Cm(11.0)]
    style_table(t_sum, col_w_sum)

    sum_data = [
        ("Hạng mục cốt lõi", "Nội dung dự kiến định hướng"),
        ("Tên dự án sự kiện", "Giải đấu Thử nghiệm Giao lưu Oẳn Tù Tì V2 (OTTV2 Community Cup)"),
        ("Đối tượng tham gia", "Dự kiến ưu tiên cộng đồng thành viên nội bộ và người chơi thử nghiệm"),
        ("Quy mô người chơi", "Ước tính khoảng 32 đến 64 người tham gia tùy thuộc vào số lượng đăng ký hợp lệ"),
        ("Thời lượng giải đấu", "Dự kiến tổ chức trong 02 ngày cuối tuần nhằm tối ưu hóa tỷ lệ tham dự"),
        ("Nền tảng vận hành", "Phòng đấu kỹ thuật số có máy chủ đồng bộ thời gian thực kết hợp giám sát trực tiếp")
    ]

    for row_idx, (c0, c1) in enumerate(sum_data):
        row = t_sum.rows[row_idx]
        p0 = row.cells[0].paragraphs[0]
        p0.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p0.paragraph_format.space_before = Pt(2)
        p0.paragraph_format.space_after = Pt(2)
        r = p0.add_run(c0)
        apply_run_font(r, size=11, bold=(row_idx == 0 or True if row_idx > 0 and c0 != "" else False))

        p1 = row.cells[1].paragraphs[0]
        p1.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p1.paragraph_format.space_before = Pt(2)
        p1.paragraph_format.space_after = Pt(2)
        r = p1.add_run(c1)
        apply_run_font(r, size=11, bold=(row_idx == 0))

    doc.add_paragraph().paragraph_format.space_after = Pt(8)

    # =======================================================
    # PHẦN: MỤC LỤC TÀI LIỆU (TABLE OF CONTENTS)
    # =======================================================
    add_h1("MỤC LỤC TÀI LIỆU")

    toc_items = [
        ("TÓM TẮT KẾ HOẠCH (EXECUTIVE SUMMARY)", "Trang 1"),
        ("MỤC LỤC TÀI LIỆU", "Trang 2"),
        ("PHẦN 1: BỐI CẢNH VÀ MỤC TIÊU TỔ CHỨC", "Trang 2"),
        ("   1.1. Khái quát về phiên bản trò chơi OTTV2", "Trang 2"),
        ("   1.2. Mục tiêu hướng tới của giải đấu", "Trang 2"),
        ("   1.3. Tiêu chí và quy mô dự kiến của người tham gia", "Trang 3"),
        ("PHẦN 2: THỂ THỨC THI ĐẤU VÀ QUY TẮC VẬN HÀNH TRÒ CHƠI", "Trang 3"),
        ("   2.1. Cải tiến luật chơi OTTV2 so với mô hình truyền thống", "Trang 3"),
        ("   2.2. Cơ chế thi đấu đa người chơi (Multiplayer)", "Trang 4"),
        ("   2.3. Quy trình phân nhánh và lộ trình thi đấu", "Trang 4"),
        ("   2.4. Quy định xử lý trường hợp hòa và phân định thứ hạng", "Trang 5"),
        ("PHẦN 3: LỘ TRÌNH TRIỂN KHAI VÀ TIẾN ĐỘ THỰC HIỆN", "Trang 5"),
        ("   3.1. Phân kỳ tiến độ 04 giai đoạn", "Trang 5"),
        ("   3.2. Bảng phân bổ mốc thời gian chi tiết", "Trang 6"),
        ("PHẦN 4: CƠ CẤU NHÂN SỰ VÀ TRÁCH NHIỆM PHÂN CÔNG", "Trang 6"),
        ("   4.1. Sơ đồ các bộ phận chức năng", "Trang 6"),
        ("   4.2. Nhiệm vụ cụ thể của từng tổ công tác", "Trang 7"),
        ("PHẦN 5: DỰ TOÁN KINH PHÍ VÀ CƠ CẤU GIẢI THƯỞNG", "Trang 7"),
        ("   5.1. Bảng ước tính các khoản mục chi phí", "Trang 7"),
        ("   5.2. Khung phân bổ giải thưởng khuyến khích", "Trang 8"),
        ("PHẦN 6: NHẬN DIỆN RỦI RO VÀ PHƯƠNG ÁN DỰ PHÒNG", "Trang 8"),
        ("   6.1. Rủi ro gián đoạn kỹ thuật và đường truyền mạng", "Trang 8"),
        ("   6.2. Rủi ro biến động nhân sự và người chơi vắng mặt", "Trang 9"),
        ("   6.3. Xử lý tranh chấp, khiếu nại và bảo đảm tính minh bạch", "Trang 9"),
        ("PHẦN 7: KẾT LUẬN VÀ ĐỀ XUẤT", "Trang 10")
    ]

    for title_text, page_text in toc_items:
        p_toc = doc.add_paragraph()
        p_toc.paragraph_format.space_before = Pt(1)
        p_toc.paragraph_format.space_after = Pt(2)
        p_toc.paragraph_format.line_spacing = 1.15
        
        # Calculate dotted spacing
        is_main = title_text.startswith("PHẦN") or title_text.startswith("TÓM TẮT") or title_text.startswith("MỤC LỤC")
        
        r_t = p_toc.add_run(title_text)
        apply_run_font(r_t, size=11, bold=is_main)
        
        # Add tab or dot leaders
        # Dot leader representation
        dot_count = max(4, 75 - len(title_text))
        dots = " " + ". " * (dot_count // 2) + " "
        r_d = p_toc.add_run(dots)
        apply_run_font(r_d, size=10, bold=False)
        
        r_p = p_toc.add_run(page_text)
        apply_run_font(r_p, size=11, bold=is_main)

    doc.add_page_break()

    # =======================================================
    # PHẦN 1: BỐI CẢNH VÀ MỤC TIÊU TỔ CHỨC
    # =======================================================
    add_h1("PHẦN 1: BỐI CẢNH VÀ MỤC TIÊU TỔ CHỨC")

    add_h2("1.1. Khái quát về phiên bản trò chơi OTTV2")
    add_p("Trò chơi Oẳn Tù Tì truyền thống (Kéo - Búa - Bao) có ưu điểm lớn về sự quen thuộc và tính đại chúng. Tuy nhiên, khi áp dụng vào môi trường thi đấu có tổ chức hoặc thi đấu nhiều người cùng lúc, trò chơi truyền thống thường bộc lộ những hạn chế như tỷ lệ hòa cao, thời gian phân định thắng thua kéo dài và thiếu tính toán chiến thuật theo chiều sâu.")
    add_p("Phiên bản Oẳn Tù Tì V2 (OTTV2) được nghiên cứu phát triển nhằm bổ sung các cơ chế tương tác mới, bao gồm việc quản lý điểm năng lượng, giới hạn số lần sử dụng mỗi loại nước đi, và bổ sung các nước cờ biến thể có tính khắc chế tương hỗ. Những cải tiến này giúp tăng cường yếu tố phán đoán tâm lý và tạo điều kiện thuận lợi hơn cho việc tổ chức các trận đấu có từ 3 người chơi trở lên trên cùng một bàn thi đấu.")

    add_h2("1.2. Mục tiêu hướng tới của giải đấu")
    add_p("Việc tổ chức giải đấu được định hướng đạt được một số mục tiêu cụ thể, không đặt nặng thành tích mà tập trung vào giá trị trải nghiệm và thử nghiệm:")
    add_bullet("Kiểm nghiệm tính cân bằng của trò chơi: ", "Tạo môi trường thực tế để ghi nhận dữ liệu về tỷ lệ lựa chọn nước đi, tỷ lệ thắng thua giữa các nhánh chiến thuật, từ đó đánh giá mức độ hoàn thiện của bộ luật OTTV2.")
    add_bullet("Thử nghiệm hạ tầng phòng đấu nhiều người: ", "Đánh giá khả năng đáp ứng của hệ thống kết nối, độ trễ tín hiệu và tính chính xác trong việc xử lý đồng thời các lượt ra quyết định của nhiều người chơi.")
    add_bullet("Gắn kết cộng đồng: ", "Tạo dựng hoạt động giải trí lành mạnh, nâng cao tinh thần giao lưu giữa các thành viên tham gia.")

    add_h2("1.3. Tiêu chí và quy mô dự kiến của người tham gia")
    add_p("Ban tổ chức dự kiến xác định quy mô tổ chức dựa trên nguồn lực hiện có:")
    add_bullet("Quy mô số lượng: ", "Hướng tới mức dao động từ 32 đến 64 tuyển thủ chính thức. Trường hợp số lượng đăng ký vượt quá con số này, ban tổ chức có thể xem xét phương án tổ chức vòng sơ loại trực tuyến ngắn hoặc lập danh sách chờ.")
    add_bullet("Yêu cầu thiết bị: ", "Người tham gia cần có thiết bị kết nối mạng ổn định (máy tính hoặc điện thoại thông minh) có khả năng truy cập giao diện thi đấu mượt mà.")
    add_bullet("Tinh thần tham dự: ", "Tôn trọng các quyết định của tổ trọng tài, chấp hành khung thời gian điểm danh và duy trì văn hóa giao tiếp hòa nhã.")

    # =======================================================
    # PHẦN 2: THỂ THỨC THI ĐẤU VÀ QUY TẮC VẬN HÀNH TRÒ CHƠI
    # =======================================================
    add_h1("PHẦN 2: THỂ THỨC THI ĐẤU VÀ QUY TẮC VẬN HÀNH TRÒ CHƠI")

    add_h2("2.1. Cải tiến luật chơi OTTV2 so với mô hình truyền thống")
    add_p("Để giải quyết các hạn chế về tính ngẫu nhiên đơn thuần, OTTV2 đề xuất tích hợp các quy tắc bổ trợ sau:")
    add_bullet("Cơ chế Điểm Sinh Mệnh (HP): ", "Mỗi người chơi bước vào trận đấu với một lượng điểm sinh mệnh cơ sở (ví dụ: 5 HP). Một ván đấu không kết thúc sau một lượt duy nhất mà diễn ra qua nhiều hiệp cho đến khi lượng HP của tuyển thủ cạn kiệt.")
    add_bullet("Hạn ngạch nước đi (Hand Deck): ", "Mỗi tuyển thủ được cấp một số lượng thẻ nước đi hữu hạn trong mỗi ván (ví dụ: tối đa 3 Kéo, 3 Búa, 3 Bao). Sau khi đã sử dụng hết một loại nước đi, tuyển thủ buộc phải ra quyết định dựa trên các lựa chọn còn lại trong tay, qua đó mở ra khả năng phán đoán bài của đối phương.")
    add_bullet("Cơ chế Nước Đi Đặc Biệt (Biến thể V2): ", "Mỗi trận đấu có thể cho phép sử dụng 01 lần nước đi phụ trợ (như 'Phòng Thủ Hóa Giải' hoặc 'Nhân Đôi Sát Thương') đòi hỏi tuyển thủ phải lựa chọn thời điểm kích hoạt thích hợp.")

    add_h2("2.2. Cơ chế thi đấu đa người chơi (Multiplayer)")
    add_p("Đối với chế độ nhiều người chơi đồng thời trên một sàn đấu, ban tổ chức đề xuất áp dụng cơ chế 'Sàn Đấu Đa Diện' (Multi-side Arena):")
    add_bullet("Nhịp ra quyết định đồng bộ: ", "Hệ thống áp dụng bộ đếm ngược 5 giây cho mỗi hiệp đấu. Tất cả người chơi trong phòng buộc phải gửi lựa chọn ẩn trước khi hết thời gian.")
    add_bullet("Quy tắc tính điểm đa phương: ", "Khi có từ 3 đến 4 tuyển thủ trong một bảng đấu nhỏ, hệ thống sẽ tự động đối chiếu nước đi của từng người chơi với tất cả các đối thủ còn lại:")
    add_p("- Nếu người chơi A ra Kéo, người chơi B ra Bao, người chơi C ra Bao: Tuyển thủ A gây sát thương lên cả B và C, đồng thời nhận điểm tích lũy tương ứng.\n"
          "- Trường hợp cả 3 nước đi (Kéo, Búa, Bao) đều đồng thời xuất hiện trên bàn đấu: Hiệp đấu được tính là trạng thái phân tán cân bằng, không trừ HP cơ bản nhưng có thể áp dụng cơ chế tích lũy năng lượng cho hiệp kế tiếp.",
          space_before=2, space_after=6)

    add_h2("2.3. Quy trình phân nhánh và lộ trình thi đấu")
    add_p("Cơ cấu giải đấu được chia thành các vòng kế tiếp nhau nhằm đảm bảo tính cạnh tranh hợp lý:")

    t_format = doc.add_table(rows=4, cols=4)
    col_w_format = [Cm(3.0), Cm(4.0), Cm(5.0), Cm(4.0)]
    style_table(t_format, col_w_format)

    format_data = [
        ("Vòng thi đấu", "Quy mô dự kiến", "Thể thức đề xuất", "Số lượng đi tiếp"),
        ("Vòng Bảng", "64 tuyển thủ\n(Chia 16 bảng, mỗi bảng 4 người)", "Đấu hỗn chiến 4 người,\ntính điểm sau 5 ván", "Lấy 2 người đứng đầu mỗi bảng (32 người)"),
        ("Vòng Phân Nhánh", "32 tuyển thủ\n(Chia 8 bảng, mỗi bảng 4 người)", "Đấu hỗn chiến tích lũy HP,\nloại dần qua từng hiệp", "Lấy người xuất sắc nhất mỗi bảng (8 người)"),
        ("Vòng Chung Kết", "8 tuyển thủ xuất sắc", "Đấu nhánh loại trực tiếp (BO3)\nvà Trận Chung kết (BO5)", "Xác định Quán quân, Á quân và Quý quân")
    ]

    for row_idx, rdata in enumerate(format_data):
        row = t_format.rows[row_idx]
        for col_idx, text in enumerate(rdata):
            cell = row.cells[col_idx]
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if col_idx in [0, 1, 3] else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            r = p.add_run(text)
            apply_run_font(r, size=11, bold=(row_idx == 0))

    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    add_h2("2.4. Quy định xử lý trường hợp hòa và phân định thứ hạng")
    add_p("Nhằm ngăn chặn tình trạng trận đấu kéo dài quá thời lượng cho phép, quy định phân định được thiết lập như sau:")
    add_bullet("Chỉ số phụ ưu tiên 1: ", "So sánh tổng lượng HP còn lại tại thời điểm kết thúc hiệp quy định.")
    add_bullet("Chỉ số phụ ưu tiên 2: ", "So sánh tổng số lần ra nước đi thắng thế trực tiếp trong suốt toàn bộ trận đấu.")
    add_bullet("Hiệp phụ đột tử (Sudden Death): ", "Trường hợp các chỉ số phụ vẫn ở mức tương đương nhau, hai bên sẽ bước vào 01 hiệp phụ duy nhất không dùng thẻ bài bổ trợ để xác định người chiến thắng.")

    # =======================================================
    # PHẦN 3: LỘ TRÌNH TRIỂN KHAI VÀ TIẾN ĐỘ THỰC HIỆN
    # =======================================================
    add_h1("PHẦN 3: LỘ TRÌNH TRIỂN KHAI VÀ TIẾN ĐỘ THỰC HIỆN")

    add_h2("3.1. Phân kỳ tiến độ 04 giai đoạn")
    add_p("Quá trình tổ chức dự kiến được chia tách thành 04 giai đoạn kế tiếp nhau, có các khoảng thời gian đệm để điều chỉnh linh hoạt:")
    add_bullet("Giai đoạn 1 - Chuẩn bị & Kiểm thử (Tuần 1): ", "Hoàn thiện mã nguồn trò chơi OTTV2 chế độ phòng nhiều người, cấu hình máy chủ thử nghiệm, kiểm tra tải giả lập đối với các phiên kết nối đồng thời.")
    add_bullet("Giai đoạn 2 - Thông báo & Tiếp nhận đăng ký (Tuần 2): ", "Công bố điều lệ giải đấu, mở biểu mẫu ghi danh, hướng dẫn người tham gia làm quen giao diện qua các trận đấu tập không tính điểm.")
    add_bullet("Giai đoạn 3 - Vận hành thi đấu chính thức (Cuối tuần 2 hoặc đầu Tuần 3): ", "Tổ chức thi đấu theo lịch trình đã công bố, có sự giám sát của tổ trọng tài và kỹ thuật viên trực tuyến.")
    add_bullet("Giai đoạn 4 - Tổng kết & Trao giải (Sau thi đấu 2 ngày): ", "Đối soát kết quả thi đấu, công bố bảng xếp hạng chung cuộc, trao thưởng và thu thập phản hồi của người tham gia để hoàn thiện trò chơi.")

    add_h2("3.2. Bảng phân bổ mốc thời gian chi tiết")

    t_timeline = doc.add_table(rows=5, cols=4)
    col_w_timeline = [Cm(3.0), Cm(4.5), Cm(5.0), Cm(3.5)]
    style_table(t_timeline, col_w_timeline)

    timeline_data = [
        ("Mốc thời gian", "Nội dung công việc", "Kết quả đầu ra dự kiến", "Bộ phận phụ trách"),
        ("Ngày 01 - 04", "Kiểm thử phòng đấu nhiều người,\nhoàn thiện quy chế thi đấu", "Bản thử nghiệm ổn định,\nBộ quy tắc được phê duyệt", "Kỹ thuật & Trọng tài"),
        ("Ngày 05 - 08", "Mở cổng đăng ký trực tuyến,\ntổng hợp danh sách tuyển thủ", "Danh sách 32 - 64 người,\nBảng bốc thăm sơ bộ", "Truyền thông & Vận hành"),
        ("Ngày 09 - 10", "Tiến hành Vòng Bảng, Vòng Loại\nvà Vòng Chung Kết", "Xác định nhà vô địch,\nBiên bản trận đấu đầy đủ", "Toàn thể Ban tổ chức"),
        ("Ngày 11 - 12", "Tổng kết kinh phí, gửi giải thưởng,\nđánh giá hiệu quả phiên bản", "Báo cáo tổng kết giải đấu,\nĐề xuất nâng cấp OTTV2", "Điều phối dự án")
    ]

    for row_idx, rdata in enumerate(timeline_data):
        row = t_timeline.rows[row_idx]
        for col_idx, text in enumerate(rdata):
            cell = row.cells[col_idx]
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if col_idx in [0, 3] else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            r = p.add_run(text)
            apply_run_font(r, size=11, bold=(row_idx == 0))

    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    # =======================================================
    # PHẦN 4: CƠ CẤU NHÂN SỰ VÀ TRÁCH NHIỆM PHÂN CÔNG
    # =======================================================
    add_h1("PHẦN 4: CƠ CẤU NHÂN SỰ VÀ TRÁCH NHIỆM PHÂN CÔNG")

    add_h2("4.1. Sơ đồ các bộ phận chức năng")
    add_p("Nhằm bảo đảm tính thông suốt trong quá trình điều phối, ban tổ chức đề xuất cơ cấu gọn nhẹ gồm 03 nhóm chức năng liên kết chặt chẽ:")
    add_bullet("Trưởng Ban Điều Phối: ", "Chịu trách nhiệm chung về tiến độ, duyệt điều lệ và đưa ra quyết định xử lý trong các tình huống phát sinh vượt thẩm quyền.")
    add_bullet("Tổ Kỹ Thuật & Hạ Tầng Máy Chủ: ", "Đảm bảo phòng đấu vận hành ổn định, theo dõi lưu lượng mạng, sao lưu nhật ký (log) trận đấu và khắc phục sự cố kỹ thuật.")
    add_bullet("Tổ Trọng Tài & Điều Phối Tuyển Thủ: ", "Thực hiện điểm danh, hướng dẫn tuyển thủ vào đúng phòng thi đấu, giám sát tính trung thực và xác nhận biên bản kết quả từng cặp đấu.")

    add_h2("4.2. Nhiệm vụ cụ thể của từng tổ công tác")
    add_p("Nhiệm vụ của mỗi cá nhân được cụ thể hóa thành văn bản hướng dẫn trước giờ khai mạc, trong đó nhấn mạnh tinh thần phối hợp hỗ trợ lẫn nhau, hạn chế tình trạng đùn đẩy trách nhiệm khi xuất hiện các sự cố bất ngờ.")

    # =======================================================
    # PHẦN 5: DỰ TOÁN KINH PHÍ VÀ CƠ CẤU GIẢI THƯỞNG
    # =======================================================
    add_h1("PHẦN 5: DỰ TOÁN KINH PHÍ VÀ CƠ CẤU GIẢI THƯỞNG")

    add_h2("5.1. Bảng ước tính các khoản mục chi phí")
    add_p("Dự toán dưới đây mang tính chất ước tính sơ bộ nhằm làm căn cứ chuẩn bị ngân sách. Các con số có thể được cân đối linh hoạt tùy theo quy mô tài trợ hoặc nguồn kinh phí thực tế được cấp:")

    t_cost = doc.add_table(rows=6, cols=4)
    col_w_cost = [Cm(1.5), Cm(7.0), Cm(4.0), Cm(3.5)]
    style_table(t_cost, col_w_cost)

    cost_data = [
        ("STT", "Khoản mục chi phí", "Ước tính (VNĐ)", "Ghi chú điều chỉnh"),
        ("01", "Cơ cấu giải thưởng trao cho tuyển thủ", "2.000.000 - 3.500.000", "Bao gồm hiện kim hoặc quà tặng"),
        ("02", "Chi phí duy trì hạ tầng máy chủ & mạng", "300.000 - 500.000", "Thuê máy chủ đám mây trong đợt đấu"),
        ("03", "Thiết kế tư liệu truyền thông, chứng nhận", "200.000 - 400.000", "Thực hiện ấn phẩm số (digital)"),
        ("04", "Quỹ dự phòng phát sinh rủi ro (10%)", "300.000 - 500.000", "Xử lý các tình huống đột xuất"),
        ("TỔNG", "Dự kiến tổng mức đầu tư ước lượng", "2.800.000 - 4.900.000", "Có thể điều chỉnh theo thực tế")
    ]

    for row_idx, rdata in enumerate(cost_data):
        row = t_cost.rows[row_idx]
        for col_idx, text in enumerate(rdata):
            cell = row.cells[col_idx]
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if col_idx in [0, 2] else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            r = p.add_run(text)
            apply_run_font(r, size=11, bold=(row_idx == 0 or row_idx == 5))

    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    add_h2("5.2. Khung phân bổ giải thưởng khuyến khích")
    add_p("Cơ cấu giải thưởng định hướng ưu tiên tính khích lệ, phân bổ đều nhằm tạo động lực cho nhiều người chơi thay vì chỉ tập trung vào một vị trí duy nhất:")
    add_bullet("01 Giải Nhất (Quán Quân): ", "Tương đương 40% tổng quỹ thưởng kèm chứng nhận tuyển thủ xuất sắc.")
    add_bullet("01 Giải Nhì (Á Quân): ", "Tương đương 25% tổng quỹ thưởng kèm chứng nhận thành tích.")
    add_bullet("02 Giải Ba (Đồng Hạng Ba): ", "Tương đương 15% tổng quỹ thưởng chia đều cho hai tuyển thủ.")
    add_bullet("Giải Phong Cách / Sáng Tạo Chiến Thuật: ", "Tương đương 5% tổng quỹ thưởng dành cho tuyển thủ có lối chơi ấn tượng.")

    # =======================================================
    # PHẦN 6: NHẬN DIỆN RỦI RO VÀ PHƯƠNG ÁN DỰ PHÒNG
    # =======================================================
    add_h1("PHẦN 6: NHẬN DIỆN RỦI RO VÀ PHƯƠNG ÁN DỰ PHÒNG")

    add_h2("6.1. Rủi ro gián đoạn kỹ thuật và đường truyền mạng")
    add_p("Trong môi trường thi đấu trực tuyến, khả năng phát sinh trục trặc kỹ thuật là điều khó tránh khỏi. Ban tổ chức xây dựng các phương án ứng phó cụ thể:")
    add_bullet("Nguy cơ nghẽn mạng hoặc mất kết nối của tuyển thủ: ", "Nếu tuyển thủ bị ngắt kết nối trong vòng 30 giây đầu của trận đấu, hệ thống cho phép tạm dừng phòng đấu tối đa 02 phút để người chơi kết nối lại. Quá thời gian này, quyền quyết định lượt đi của người đó sẽ do hệ thống giữ nguyên trạng thái phòng thủ hoặc xử thua hiệp đấu đó tùy tình huống cụ thể.")
    add_bullet("Nguy cơ sập máy chủ trung tâm: ", "Đội kỹ thuật chuẩn bị sẵn 01 máy chủ dự phòng (Backup Server) với dữ liệu trạng thái được đồng bộ liên tục. Trong trường hợp cần khởi động lại, các ván đấu đang diễn ra dở dang sẽ được tổ chức đấu lại từ đầu hiệp bị gián đoạn.")

    add_h2("6.2. Rủi ro biến động nhân sự và người chơi vắng mặt")
    add_p("Thực tế cho thấy tỷ lệ người đăng ký nhưng không tham gia đúng giờ thường dao động từ 10% đến 25%. Để hạn chế ảnh hưởng tới sơ đồ thi đấu, ban tổ chức đề xuất:")
    add_bullet("Xây dựng danh sách tuyển thủ dự bị: ", "Tuyển chọn thêm khoảng 8 đến 12 tuyển thủ trong danh sách chờ. Khi có trường hợp vắng mặt sau thời hạn điểm danh quy định (10 phút trước giờ thi đấu), vị trí trống sẽ được thay thế tự động theo thứ tự đăng ký dự bị.")
    add_bullet("Kịch bản thu hẹp bảng đấu: ", "Trường hợp số lượng tuyển thủ thiếu hụt không thể bù đắp, ban tổ chức linh hoạt ghép các bảng 3 người thay vì 4 người, kèm theo hệ số quy đổi điểm tương ứng để đảm bảo quyền lợi chung.")

    add_h2("6.3. Xử lý tranh chấp, khiếu nại và bảo đảm tính minh bạch")
    add_p("Nhằm giữ vững tinh thần hòa nhã và khách quan, quy trình giải quyết khiếu nại được quy định rõ:")
    add_bullet("Căn cứ phán quyết: ", "Toàn bộ dữ liệu lượt đi và thời điểm gửi lệnh được lưu trữ tự động trên nhật ký máy chủ (Server Logs). Trọng tài sẽ căn cứ trực tiếp vào tệp nhật ký này thay vì các hình ảnh chụp màn hình riêng lẻ của người chơi.")
    add_bullet("Thời hạn khiếu nại: ", "Tuyển thủ có tối đa 05 phút sau khi trận đấu kết thúc để gửi yêu cầu xem xét lại kết quả lên tổ trọng tài. Mọi khiếu nại vượt quá khung giờ này sẽ không được tiếp nhận nhằm đảm bảo tiến độ chung của toàn giải.")

    # =======================================================
    # PHẦN 7: KẾT LUẬN VÀ ĐỀ XUẤT
    # =======================================================
    add_h1("PHẦN 7: KẾT LUẬN VÀ ĐỀ XUẤT")

    add_p("Đề án tổ chức giải đấu Oẳn Tù Tì V2 (OTTV2) ở chế độ nhiều người chơi là một bước thử nghiệm mang tính xây dựng, hướng tới việc hoàn thiện một sản phẩm giải trí nội bộ giàu tính tương tác và chiến thuật. Bản kế hoạch được thiết kế với cấu trúc chặt chẽ nhưng duy trì tính linh hoạt cao, cho phép ban tổ chức chủ động ứng phó trước các biến số kỹ thuật cũng như nguồn lực tham gia.")
    add_p("Trên cơ sở các nội dung phác thảo, ban điều phối kính đề xuất các bộ phận liên quan xem xét, đóng góp ý kiến phản biện để bản kế hoạch được hoàn thiện hơn nữa trước khi chính thức phê duyệt và triển khai.")

    # Phần ký tên / xác nhận
    doc.add_paragraph().paragraph_format.space_after = Pt(12)
    t_sign = doc.add_table(rows=1, cols=2)
    t_sign.alignment = WD_TABLE_ALIGNMENT.CENTER
    col_w_sign = [Cm(8.0), Cm(8.0)]
    for cell in t_sign.rows[0].cells:
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

    p_s0 = t_sign.rows[0].cells[0].paragraphs[0]
    p_s0.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p_s0.add_run("ĐẠI DIỆN TỔ KỸ THUẬT & TRÒ CHƠI\n")
    apply_run_font(r, size=11, bold=True)
    r_sub0 = p_s0.add_run("(Ký và ghi rõ họ tên)\n\n\n\n")
    apply_run_font(r_sub0, size=10, italic=True)
    r_name0 = p_s0.add_run("Bộ phận Phát triển OTTV2")
    apply_run_font(r_name0, size=11, italic=True)

    p_s1 = t_sign.rows[0].cells[1].paragraphs[0]
    p_s1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p_s1.add_run("TRƯỞNG BAN ĐIỀU PHỐI GIẢI ĐẤU\n")
    apply_run_font(r, size=11, bold=True)
    r_sub1 = p_s1.add_run("(Ký và ghi rõ họ tên)\n\n\n\n")
    apply_run_font(r_sub1, size=10, italic=True)
    r_name1 = p_s1.add_run("Ban Tổ chức Sự kiện")
    apply_run_font(r_name1, size=11, italic=True)

    # Save document
    output_path = r"c:\Users\Lenovo LOQ\Videos\project-tuan3\Ke_Hoach_To_Chuc_Giai_Dau_OTTV2.docx"
    doc.save(output_path)
    print("SUCCESS: File saved at", output_path)

if __name__ == "__main__":
    create_document()

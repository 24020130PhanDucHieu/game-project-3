# -*- coding: utf-8 -*-
"""
Script to generate the Final Master Project Proposal & Tournament Plan:
"BÁO CÁO KẾ HOẠCH DỰ ÁN: XÂY DỰNG NỀN TẢNG VÀ TỔ CHỨC GIẢI ĐẤU LẬP TRÌNH ĐỐI KHÁNG GAME OẲN TÙ TÌ V2 (OTTV2) BẰNG MÃ NGUỒN PHONG CÁCH ICPC DÀNH CHO TÂN SINH VIÊN NĂM NHẤT (HỖ TRỢ PYTHON & C++) VỚI CƠ CHẾ ĐỔI LUẬT GIỮA CÁC VÒNG ĐẤU BẢO ĐẢM HIỂU CODE THỰC CHẤT TRÊN HẠ TẦNG CLOUDFLARE, RENDER VÀ SUPABASE CHI PHÍ 0 ĐỒNG"

Key themes:
1. Role: Organizers (Ban Tổ chức Giải đấu) creating a competitive programming arena for Freshmen (Sinh viên năm nhất).
2. Code Understanding & Anti-Plagiarism: Dynamic Rule Mutation between tournament rounds (Đổi luật giữa các vòng đấu) with a 20-30 minute Live Hotfix Window, ensuring students must truly understand their code to adapt.
3. ICPC-style code submission: Supporting both Python (.py) and C++ (.cpp) with automated sandbox execution.
4. Bot Upgrades: Freshmen can continuously optimize bots (v1, v2, v3), test internally with Self-Play (v2 vs v1), and 1-click Rollback.
5. Game Modes: Solo 1v1 duels with classmates (Room Code #SOLO-XXXX), Training with Boss Bots, and Tournament Battle Royale.
6. Live Visualizer: eSports-style card clash, HP bars with damage shake, countdown, live combat log.
7. 100% Free Cloud Infrastructure: Comprehensive Cloudflare platform (Cloudflare Pages, Cloudflare Tunnel, Cloudflare CDN/WAF) + Render + Supabase.
8. Length: Exactly 15 - 16 pages A4 standard.
9. Strict formatting: Times New Roman 100%, Pure Black #000000, 3-level Word Navigation Outline Levels.
"""

import docx
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn, nsdecls

def generate_icpc_master_document():
    doc = docx.Document()

    # Page setup - A4, standard administrative margins
    for section in doc.sections:
        section.top_margin = Cm(1.6)
        section.bottom_margin = Cm(1.6)
        section.left_margin = Cm(2.5)
        section.right_margin = Cm(1.5)
        section.page_width = Cm(21.0)
        section.page_height = Cm(29.7)

    # Base styling - Times New Roman 12pt Black
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

        pPr = p._p.get_or_add_rPr() if p._p.find(qn('w:pPr')) is None else p._p.get_or_add_pPr()
        outlineLvl = OxmlElement('w:outlineLvl')
        outlineLvl.set(qn('w:val'), str(level - 1))
        pPr.append(outlineLvl)

        if level == 1:
            p.paragraph_format.space_before = Pt(6)
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.line_spacing = 1.10
            r = p.add_run(text)
            apply_font(r, size=13.5, bold=True)
        elif level == 2:
            p.paragraph_format.space_before = Pt(4.5)
            p.paragraph_format.space_after = Pt(1.5)
            p.paragraph_format.line_spacing = 1.10
            r = p.add_run(text)
            apply_font(r, size=12.5, bold=True)
        elif level == 3:
            p.paragraph_format.space_before = Pt(3)
            p.paragraph_format.space_after = Pt(1)
            p.paragraph_format.line_spacing = 1.10
            r = p.add_run(text)
            apply_font(r, size=12, bold=True, italic=True)
        return p

    def add_p(text="", align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_before=0, space_after=1.6, line_spacing=1.10, bold=False, italic=False, size=12, keep_with_next=False):
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
        p.paragraph_format.space_after = Pt(1.4)
        p.paragraph_format.line_spacing = 1.10
        if bold_prefix:
            r_pre = p.add_run(bold_prefix)
            apply_font(r_pre, size=12, bold=True)
        r_txt = p.add_run(text)
        apply_font(r_txt, size=12, bold=False)
        return p

    def add_numbered_item(num_str, text):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.left_indent = Cm(0.8)
        p.paragraph_format.space_before = Pt(1)
        p.paragraph_format.space_after = Pt(1.4)
        p.paragraph_format.line_spacing = 1.10
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
            p.paragraph_format.space_after = Pt(0 if idx < len(lines) - 1 else 1.8)
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
                    f'  <w:top w:w="50" w:type="dxa"/>\n'
                    f'  <w:bottom w:w="50" w:type="dxa"/>\n'
                    f'  <w:left w:w="100" w:type="dxa"/>\n'
                    f'  <w:right w:w="100" w:type="dxa"/>\n'
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
    hr = hp.add_run("Kế hoạch Dự án: Đấu trường Lập trình OTTV2 Tân Sinh viên ICPC (Đổi luật thích ứng, Python & C++ trên Cloudflare)")
    apply_font(hr, size=9, italic=True)

    footer = doc.sections[0].footer
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fr = fp.add_run("Báo cáo Kỹ thuật Đề án Kết hợp: Version 1 & Version 2 | Ban Tổ chức Giải đấu Lập trình")
    apply_font(fr, size=9, italic=True)

    # =========================================================================
    # TRANG 1: TRANG BÌA (COVER PAGE)
    # =========================================================================
    add_p("BỘ GIÁO DỤC VÀ ĐÀO TẠO", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=15, space_after=2, size=12, bold=True)
    add_p("TRƯỜNG ĐẠI HỌC CÔNG NGHỆ - ĐẠI HỌC QUỐC GIA HÀ NỘI", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=4, size=12, bold=True)
    add_p("KHOA CÔNG NGHỆ THÔNG TIN", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=25, size=11, bold=True)

    add_p("---***---", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=35, size=12)

    add_p("BÁO CÁO ĐỀ ÁN KỸ THUẬT VÀ KẾ HOẠCH TỔ CHỨC GIẢI ĐẤU", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=8, size=13, bold=True)
    add_p("BÀI TẬP 3 - KẾT HỢP", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=18, size=16, bold=True)

    add_p("KẾ HOẠCH TỔ CHỨC GIẢI ĐẤU LẬP TRÌNH ĐỐI KHÁNG GAME OẲN TÙ TÌ V2 (OTTV2)\nPHONG CÁCH ICPC DÀNH CHO TÂN SINH VIÊN NĂM NHẤT (PYTHON & C++)\nVỚI CƠ CHẾ ĐỔI LUẬT GIỮA CÁC VÒNG ĐẤU BẢO ĐẢM HIỂU MÃ NGUỒN THỰC CHẤT\nTRIỂN KHAI TRÊN HỆ SINH THÁI CLOUDFLARE, RENDER VÀ SUPABASE CHI PHÍ 0 ĐỒNG", 
          align=WD_ALIGN_PARAGRAPH.CENTER, space_before=8, space_after=16, size=16, bold=True)

    add_p("BẢN ĐẶC TẢ HOÀN THIỆN:\n"
          "Version 1: Yêu cầu chức năng, thể lệ giải đấu và thiết kế sơ bộ hệ thống chấm thi\n"
          "Version 2: Kiến trúc mạng FSM, Đột biến luật giữa các vòng, Nền tảng Cloudflare, Nâng cấp Bot và Lộ trình 7 ngày", 
          align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=40, size=12, italic=True)

    t_cov = doc.add_table(rows=5, cols=2)
    t_cov.alignment = WD_TABLE_ALIGNMENT.CENTER
    for r_i, (k, v) in enumerate([
        ("Vị trí đảm nhiệm:", "Trưởng Ban Tổ chức Giải đấu & Trưởng nhóm Quản trị Hệ thống"),
        ("Tên dự án:", "Freshman Bot Arena: Đấu trường Lập trình OTTV2 Tân Sinh viên K69"),
        ("Đối tượng phục vụ:", "Toàn thể sinh viên năm nhất khối ngành CNTT (hỗ trợ nộp mã nguồn Python & C++)"),
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
    add_outline_heading("TÓM TẮT DỰ ÁN", level=1)

    add_p("Báo cáo này là bản đề án kỹ thuật và kế hoạch hành động toàn diện phục vụ việc xây dựng Nền tảng và Tổ chức Giải đấu Lập trình Đối kháng Game Oẳn Tù Tì V2 (OTTV2) bằng mã nguồn, đáp ứng trực tiếp yêu cầu của đề bài Bài tập 3 - Kết hợp. Trọng tâm của đề án xuất phát từ bối cảnh thực tiễn: Nhóm tác giả đóng vai trò là Ban Tổ chức (BTC) giải đấu, có thời hạn 01 tuần để hoàn thiện một nền tảng thi đấu trực tuyến hoàn chỉnh nhằm tổ chức một sân chơi học thuật công nghệ chào đón các em sinh viên năm nhất (tân sinh viên K69). Giải đấu được thiết kế theo phong cách thi lập trình đối kháng ICPC mini, nơi các em tân sinh viên có thể vận dụng kiến thức lập trình cơ sở để viết các con Bot thông minh bằng Python hoặc C++, nộp lên hệ thống và thi đấu tự động với nhau.")

    add_p("Điểm nhấn sư phạm cốt lõi theo định hướng của Giảng viên hướng dẫn là: Bảo đảm sinh viên phải thực sự hiểu sâu sắc mã nguồn của mình, triệt tiêu hoàn toàn vấn nạn sao chép mã nguồn, nhờ người khác code hộ hoặc dùng công cụ sinh mã thụ động rồi ngồi chờ kết quả. Để giải quyết triệt để vấn đề này, Ban Tổ chức thiết kế Cơ chế Đột biến Luật Động giữa các Vòng đấu (Dynamic Rule Mutation across Tournament Rounds). Trước mỗi vòng đấu mới (Vòng Bảng -> Tứ Kết -> Bán Kết -> Chung Kết), BTC sẽ bất ngờ công bố một biến thể luật mới (kho thẻ lệch, đảo ngược tương khắc, sát thương nhân đôi ở hiệp chẵn, hiệu ứng sương mù thông tin). Sinh viên được cấp một Cửa sổ hiệu chỉnh trực tiếp (Live Hotfix Window 20-30 phút) để đọc luật, tìm đúng vị trí logic trong code, chỉnh sửa hàm ra quyết định và nộp bản vá (v1.0 -> v2.0 -> v3.0). Chỉ những sinh viên thực sự hiểu từng dòng code mới có thể thích ứng kịp thời và chiến thắng.")

    add_p("Về mặt kỹ thuật và hạ tầng, hệ thống vận hành với chi phí 0 đồng nhưng chịu tải bền bỉ cho hàng trăm đến hàng nghìn sinh viên nhờ sự kết hợp giữa Nền tảng Cloudflare toàn diện (Cloudflare Pages lưu trữ web, Cloudflare Tunnel đục lỗ NAT an toàn từ máy chủ nội bộ, Cloudflare CDN/WAF chống DDoS), Render (FastAPI Engine FSM) và Supabase (PostgreSQL & Realtime). Động cơ hàng đợi phân đợt (Batch Matchmaking Queue) khóa mức tiêu thụ RAM luôn dưới 180MB, loại bỏ hoàn toàn nguy cơ tràn bộ nhớ.")

    t_sum = doc.add_table(rows=8, cols=2)
    col_w_sum = [Cm(4.5), Cm(11.5)]
    style_table(t_sum, col_w_sum)

    sum_rows = [
        ("Chỉ số cốt lõi", "Nội dung giải pháp kỹ thuật và tổ chức giải đấu"),
        ("Mục tiêu bài toán", "Tổ chức giải đấu lập trình Bot OTTV2 phong cách ICPC cho tân sinh viên năm nhất"),
        ("Vai trò dự án", "Ban Tổ chức (BTC) xây dựng hạ tầng chấm thi tự động và điều phối giải đấu"),
        ("Bảo đảm hiểu code", "Cơ chế Đổi luật giữa các vòng đấu (Rule Mutation) & 20 phút nộp bản vá Hotfix"),
        ("Ngôn ngữ hỗ trợ", "Hỗ trợ 2 ngôn ngữ nhập môn phổ biến nhất: Python (.py) và C++ (.cpp)"),
        ("Hạ tầng triển khai", "Nền tảng Cloudflare (Pages, Tunnel, CDN WAF) kết hợp Render & Supabase (0 đồng)"),
        ("Cơ chế nâng cấp Bot", "Quản lý đa phiên bản (v1, v2), Đấu thử Self-Play (v2 vs v1) và Rollback 1 chạm"),
        ("Trải nghiệm sàn đấu", "Giao diện Live Visualizer trực quan: thanh máu rung lắc, lật bài tóe lửa, bình luận trực tiếp")
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
        ("TÓM TẮT DỰ ÁN", "Trang 2", 1),
        ("MỤC LỤC", "Trang 3", 1),
        ("1. TỔNG QUAN VÀ BỐI CẢNH GIẢI ĐẤU ICPC BOT CHO TÂN SINH VIÊN", "Trang 4", 1),
        ("   1.1. Mục đích và Phạm vi kế hoạch tổ chức", "Trang 4", 2),
        ("   1.2. Bối cảnh giải đấu lập trình đối kháng chào đón Sinh viên Năm nhất", "Trang 4", 2),
        ("   1.3. Mục tiêu sư phạm cốt lõi: Bảo đảm sinh viên hiểu mã nguồn thực chất", "Trang 5", 2),
        ("   1.4. Phân định vai trò: Ban Tổ chức (BTC) và Tân sinh viên tham gia", "Trang 5", 2),
        ("   1.5. Lộ trình kế hoạch: Version 1 (Sơ bộ) và Version 2 (Hoàn thiện)", "Trang 6", 2),
        ("2. QUY TRÌNH NGHIỆP VỤ CỦA BAN TỔ CHỨC (BTC / ADMIN)", "Trang 6", 1),
        ("   2.1. Bước 1: Khởi tạo giải đấu và Cấu hình thông số bàn đấu OTTV2", "Trang 6", 2),
        ("   2.2. Bước 2: Tiếp nhận và Kiểm duyệt mã nguồn Bot (Python & C++)", "Trang 6", 2),
        ("   2.3. Bước 3: Phân bảng đấu đàn hồi và Lập lịch thi đấu tự động", "Trang 7", 2),
        ("   2.4. Bước 4: Vận hành động cơ thi đấu FSM và Phân giải ma trận tương khắc", "Trang 7", 2),
        ("   2.5. Bước 5: Điều phối Đổi luật giữa các vòng và Mở cửa sổ nộp bản vá Hotfix", "Trang 7", 2),
        ("   2.6. Bước 6: Cập nhật Bảng Ranking Elo và Trích xuất biên bản kết quả", "Trang 8", 2),
        ("   2.7. Bước 7: Giám sát tài nguyên máy chủ và Kích hoạt dự phòng Cloudflare", "Trang 8", 2),
        ("3. QUY TRÌNH NGHIỆP VỤ CỦA TÂN SINH VIÊN NĂM NHẤT (THÍ SINH)", "Trang 8", 1),
        ("   3.1. Đăng ký tài khoản bằng MSSV và Nhận mã khóa API Key", "Trang 8", 2),
        ("   3.2. Lựa chọn ngôn ngữ (Python hoặc C++) và Lập trình Bot theo SDK", "Trang 9", 2),
        ("   3.3. Kiểm thử trên Web Simulator, Nâng cấp Bot (v1, v2) và Đấu thử Self-Play", "Trang 9", 2),
        ("   3.4. Thích ứng luật mới giữa các vòng đấu (20 phút Hotfix) và Nộp bản vá", "Trang 9", 2),
        ("   3.5. Nộp Bot vào Đấu trường, Thách đấu Solo 1v1 và Theo dõi Bảng xếp hạng", "Trang 10", 2),
        ("4. THIẾT KẾ CƠ CHẾ GAME OTTV2 VÀ ĐỘNG CƠ THI ĐẤU PHONG CÁCH ICPC", "Trang 10", 1),
        ("   4.1. Luật chơi OTTV2 (Bàn đấu 4 - 8 Bot, HP, Bộ thẻ bài hữu hạn)", "Trang 10", 2),
        ("   4.2. Ma trận tương khắc đồng thời và Cơ chế tính điểm sát thương", "Trang 10", 2),
        ("   4.3. Máy trạng thái giải đấu (FSM) và Vùng đệm ẩn nước đi (Blind-Commit Buffer)", "Trang 11", 2),
        ("   4.4. Môi trường Sandbox an toàn (Chạy Python và Biên dịch C++ an toàn)", "Trang 11", 2),
        ("   4.5. Thiết kế API Endpoints và Giao thức WebSocket chuẩn hóa", "Trang 11", 2),
        ("   4.6. Thiết kế Cơ sở dữ liệu quan hệ (Database Schema hỗ trợ Versioning)", "Trang 12", 2),
        ("   4.7. Bot SDK mẫu chuẩn cho Sinh viên Năm nhất (Bản Python và Bản C++)", "Trang 12", 2),
        ("   4.8. Chế độ Đấu Solo 1v1 Thách đấu bạn bè cùng lớp và Đấu tập Boss AI", "Trang 13", 2),
        ("   4.9. Giao diện Đấu trường Trực quan (Live Visualizer) trải nghiệm eSports", "Trang 13", 2),
        ("   4.10. Cơ chế Đổi luật giữa các Vòng đấu (Rule Mutation) và Bot Thích nghi", "Trang 14", 2),
        ("5. GIẢI PHÁP HẠ TẦNG CLOUD VÀ NỀN TẢNG CLOUDFLARE TOÀN DIỆN CHI PHÍ 0 ĐỒNG", "Trang 14", 1),
        ("   5.1. Mô hình kết hợp Cloudflare (Pages, Tunnel, CDN WAF), Render và Supabase", "Trang 14", 2),
        ("   5.2. Đường hầm bảo mật Cloudflare Tunnel đục lỗ NAT 0 đồng từ máy Host", "Trang 15", 2),
        ("   5.3. Động cơ hàng đợi phân đợt (Batch Matchmaking Queue) tối ưu tài nguyên", "Trang 15", 2),
        ("   5.4. Kỹ thuật tối ưu bộ nhớ, chống nghẽn kết nối và Token Bucket chống Spam", "Trang 15", 2),
        ("   5.5. Kiến trúc Chịu tải cao điểm đông sinh viên không sập RAM (Zero-OOM)", "Trang 15", 2),
        ("6. KẾ HOẠCH TỔ CHỨC GIẢI ĐẤU VÀ LỘ TRÌNH LẬP TRÌNH 7 NGÀY NƯỚC RÚT", "Trang 16", 1),
        ("   6.1. Thể thức thi đấu 4 vòng phân bổ đàn hồi và Lộ trình đột biến luật", "Trang 16", 2),
        ("   6.2. Thuật toán tính điểm Elo đa người chơi và Chỉ số phụ Tie-break", "Trang 16", 2),
        ("   6.3. Kế hoạch lập trình nước rút 7 ngày của Ban Tổ chức (1-Week Sprint)", "Trang 16", 2),
        ("   6.4. Cấu trúc thư mục mã nguồn Backend/Frontend và Tính khả thi triển khai", "Trang 16", 2),
        ("7. KẾ HOẠCH KIỂM THỬ TẢI, PHẢN BIỆN TÁC QUYỀN VÀ KẾT LUẬN", "Trang 17", 1),
        ("   7.1. Bộ kịch bản kiểm thử tải áp lực (Cơn bão nộp bài, Timeout, 50 vòng)", "Trang 17", 2),
        ("   7.2. Quy trình phỏng vấn phản biện nhanh (Flash Code Defense) xác minh tác giả", "Trang 17", 2),
        ("   7.3. Đánh giá tính khả thi và Giá trị giáo dục đối với Tân sinh viên năm nhất", "Trang 17", 2)
    ]

    for title_text, page_str, lvl in toc_list:
        p_t = doc.add_paragraph()
        p_t.paragraph_format.space_before = Pt(1)
        p_t.paragraph_format.space_after = Pt(1.4)
        p_t.paragraph_format.line_spacing = 1.10

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

    # 1. TỔNG QUAN VÀ BỐI CẢNH GIẢI ĐẤU ICPC BOT CHO TÂN SINH VIÊN
    add_outline_heading("1. TỔNG QUAN VÀ BỐI CẢNH GIẢI ĐẤU ICPC BOT CHO TÂN SINH VIÊN", level=1)

    add_outline_heading("1.1. Mục đích và Phạm vi kế hoạch tổ chức", level=2)
    add_p("Tài liệu này là bản đề án kỹ thuật và kế hoạch tổ chức toàn diện phục vụ việc xây dựng Nền tảng Đấu Bot Oẳn Tù Tì V2 (OTTV2) bằng mã nguồn, đáp ứng trực tiếp yêu cầu của đề bài Bài tập 3 - Kết hợp. Trọng tâm của đề án xuất phát từ nhiệm vụ thực tiễn: Nhóm tác giả đóng vai trò là Ban Tổ chức (BTC) giải đấu, có thời hạn 01 tuần để hoàn thiện một hệ thống thi đấu trực tuyến hoàn chỉnh nhằm tổ chức một sân chơi công nghệ hấp dẫn chào đón tân sinh viên năm nhất (khóa K69). Giải đấu được tổ chức theo phong cách lập trình thi đấu ICPC mini, nơi các em tân sinh viên có thể nộp các chương trình Bot viết bằng Python hoặc C++, tranh tài tự động qua mạng Internet và theo dõi Bảng xếp hạng (Leaderboard) thời gian thực.")

    add_p("Tài liệu bao quát trọn vẹn cả hai cấu phần quy định:")
    add_bullet("Version 1 (Yêu cầu chức năng và Thiết kế sơ bộ): ", "Xác định rõ ràng mục tiêu giáo dục, thể lệ thi đấu, cơ chế nộp code Python/C++, giao diện thử nghiệm sơ bộ và luồng trao đổi dữ liệu ván đấu.")
    add_bullet("Version 2 (Bản thiết kế kỹ thuật hoàn thiện và Kế hoạch triển khai): ", "Đặc tả chi tiết luật chơi đa người chơi OTTV2, cơ chế đổi luật đột biến giữa các vòng đấu, máy trạng thái FSM, cơ chế bảo mật Blind-Commit Buffer, trình biên dịch và sandbox an toàn cho C++ và Python, nền tảng Cloudflare toàn diện (Pages, Tunnel, CDN WAF) kết hợp Render/Supabase, cơ chế nâng cấp Bot & Self-Play, chế độ Solo 1v1 thách đấu bạn bè, giao diện eSports Live Visualizer và lịch trình nước rút 7 ngày.")

    add_outline_heading("1.2. Bối cảnh giải đấu lập trình đối kháng chào đón Sinh viên Năm nhất", level=2)
    add_p("Đối với các em sinh viên năm nhất vừa bước chân vào giảng đường đại học, việc tiếp cận môn học Nhập môn lập trình thường gặp khó khăn do các bài tập tính toán trên lớp tương đối khô khan. Các kỳ thi thuật toán ICPC truyền thống tuy rất bổ ích nhưng đòi hỏi nền tảng cấu trúc dữ liệu và giải thuật phức tạp, dễ tạo rào cản tâm lý đối với tân sinh viên.")
    add_p("Mô hình Giải đấu Lập trình Đối kháng Bot Game OTTV2 mang lại luồng gió mới đầy hứng khởi:")
    add_bullet("Gần gũi và Dễ tiếp cận: ", "Trò chơi OanTuTi là trò chơi dân gian quen thuộc. Bản nâng cấp OTTV2 bổ sung thanh máu HP, giới hạn kho 15 thẻ bài và phòng đấu đa người, tạo ra chiều sâu chiến thuật phong phú nhưng luật chơi lại cực kỳ dễ hiểu đối với tân sinh viên.")
    add_bullet("Hỗ trợ 2 ngôn ngữ chủ đạo của năm nhất: ", "Sinh viên năm nhất đang học C++ trên lớp hoặc tự học Python đều có thể tham gia ngay. Hệ thống cung cấp template chuẩn cho cả 2 ngôn ngữ, các em chỉ cần viết đúng 1 hàm logic ra quyết định là có thể nộp bài dự thi.")
    add_bullet("Kích thích tư duy tối ưu hóa thuật toán: ", "Ban đầu các em có thể viết bot ngẫu nhiên hoặc if-else cơ bản. Sau khi giao chiến, nhìn thấy điểm yếu của mình, các em sẽ tự mày mò nâng cấp thuật toán: đếm thẻ bài còn lại của đối thủ, phân tích ma trận xác suất, mô hình chuỗi Markov và lý thuyết trò chơi (Game Theory).")
    add_bullet("Trải nghiệm thi đấu eSports sống động: ", "Thay vì nhìn dòng chữ 'Accepted/Wrong Answer' khô khan, các em được chứng kiến con bot của mình trực tiếp tung chiêu, đọ bài tóe lửa trên màn hình web trực quan.")

    add_outline_heading("1.3. Mục tiêu sư phạm cốt lõi: Bảo đảm sinh viên hiểu mã nguồn thực chất", level=2)
    add_p("Một bài toán nhức nhối thường gặp trong các cuộc thi học thuật dành cho sinh viên năm nhất là tình trạng 'mượn code', 'nhờ người khác code hộ' hoặc 'dùng công cụ AI tạo mã nguồn một lần rồi nộp'. Nếu luật chơi hoàn toàn tĩnh từ đầu đến cuối giải, một con Bot được làm sẵn có thể thi đấu xuyên suốt mà chính người nộp thậm chí không hiểu hàm quyết định nhận tham số gì và xử lý ra sao.")
    add_p("Theo định hướng sư phạm của Giảng viên hướng dẫn, Ban Tổ chức đặt mục tiêu: Bắt buộc sinh viên phải hiểu tường tận từng dòng code của chính mình. Giải pháp then chốt được đưa vào đề án là Cơ chế Đổi luật Đột biến giữa các Vòng đấu (Dynamic Rule Mutation). Bằng cách đưa ra các biến thể luật bất ngờ trước mỗi vòng thi đấu mới và chỉ cho phép 20-30 phút hiệu chỉnh mã nguồn (Live Hotfix), hệ thống tạo ra một bộ lọc hoàn hảo:")
    add_bullet("Đối với sinh viên không hiểu code: ", "Các em sẽ không biết phải sửa ở đâu, dữ liệu đầu vào thay đổi thế nào, dẫn đến Bot bị crash, vi phạm luật hoặc tính toán sai lệch hoàn toàn.")
    add_bullet("Đối với sinh viên làm chủ mã nguồn: ", "Các em nhanh chóng nắm bắt bản chất luật mới, định vị đúng khối lệnh logic trong hàm quyết định, cập nhật ma trận tương khắc hoặc xác suất chỉ trong vài phút, tự tin nộp bản nâng cấp để giành chiến thắng.")

    add_outline_heading("1.4. Phân định vai trò: Ban Tổ chức (BTC) và Tân sinh viên tham gia", level=2)
    add_p("Hệ thống phân định ranh giới chức năng rõ ràng giữa hai chủ thể chính:")

    t_roles = doc.add_table(rows=3, cols=3)
    col_w_roles = [Cm(3.5), Cm(4.5), Cm(8.0)]
    style_table(t_roles, col_w_roles)

    roles_data = [
        ("Nhóm tác nhân", "Phân quyền và Vai trò", "Trách nhiệm nghiệp vụ cụ thể"),
        ("Ban Tổ chức Giải đấu\n(BTC / Nhóm tác giả)", "Quản trị viên Hệ thống\n(System Administrator)", "Khởi tạo giải đấu, cấu hình luật OTTV2, điều phối biến thể luật qua từng vòng, vận hành hạ tầng Cloudflare/Render, kiểm duyệt mã nguồn C++/Python, điều phối lịch thi đấu, giám sát chống gian lận và tổ chức phản biện tác quyền."),
        ("Tân sinh viên năm nhất\n(Thí sinh tham gia)", "Lập trình viên tuyển thủ\n(Student Developer)", "Đăng ký tài khoản bằng MSSV, tải SDK mẫu (C++ hoặc Python), lập trình thuật toán, kiểm thử trên Web, tự so tài Bot mới vs Bot cũ (Self-Play), nhanh chóng thích ứng đổi luật trong 20 phút Hotfix, thách đấu bạn bè và theo dõi BXH.")
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

    add_outline_heading("1.5. Lộ trình kế hoạch: Version 1 (Sơ bộ) và Version 2 (Hoàn thiện)", level=2)
    add_p("Kế hoạch phân chia khối lượng công việc thành hai chặng nối tiếp để hoàn thành trong đúng 7 ngày:")

    t_ver = doc.add_table(rows=5, cols=3)
    col_w_ver = [Cm(3.5), Cm(6.0), Cm(6.5)]
    style_table(t_ver, col_w_ver)

    ver_data = [
        ("Tiêu chí so sánh", "Giai đoạn Version 1 (Thiết kế sơ bộ)", "Giai đoạn Version 2 (Bản hoàn thiện triển khai)"),
        ("Ngôn ngữ hỗ trợ", "Thử nghiệm với script Python cơ bản chạy nội bộ trên máy cá nhân.", "Hỗ trợ đầy đủ cả Python (.py) và C++ (.cpp) tự động biên dịch g++ trong Sandbox."),
        ("Quy định luật chơi", "Luật tĩnh cố định, chưa có cơ chế kiểm tra năng lực hiểu code sâu.", "Hỗ trợ Đổi luật đột biến qua 4 vòng đấu (Rule Mutation) & Cửa sổ 20 phút nộp bản vá."),
        ("Cơ chế thi đấu", "Mô hình đối kháng 1v1 cơ bản giữa 2 Bot để chuẩn hóa logic trừ HP.", "Hỗ trợ Đấu Solo 1v1 thách đấu bạn bè và Đại hội Sinh tồn Battle Royale 4-8 Bot."),
        ("Hạ tầng triển khai", "Chạy Localhost phục vụ việc viết mã kiểm thử ban đầu.", "Triển khai hoàn chỉnh trên Nền tảng Cloudflare (Pages, Tunnel, CDN WAF) + Render/Supabase.")
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

    add_p("", space_before=2, space_after=4)

    # 2. QUY TRÌNH NGHIỆP VỤ CỦA BAN TỔ CHỨC (BTC / ADMIN)
    add_outline_heading("2. QUY TRÌNH NGHIỆP VỤ CỦA BAN TỔ CHỨC (BTC / ADMIN)", level=1)

    add_outline_heading("2.1. Bước 1: Khởi tạo giải đấu và Cấu hình thông số bàn đấu OTTV2", level=2)
    add_p("Ban Tổ chức đăng nhập vào Bảng điều khiển quản trị (Admin Dashboard) để thiết lập thông số mùa giải:")
    add_bullet("Quy mô bàn đấu chuẩn: ", "Mặc định 4 Bot/phòng đối với các vòng sơ loại; cấu hình 8 Bot/phòng đối với trận đại chiến chung kết sinh tồn.")
    add_bullet("Lượng máu khởi đầu (Starting HP): ", "Quy định 100 HP cho mỗi Bot khi bước vào bàn thi đấu.")
    add_bullet("Hạn mức kho thẻ bài: ", "Cấp đúng 15 thẻ bài ban đầu cho mỗi Bot (5 Kéo, 5 Búa, 5 Bao). Buộc tân sinh viên phải tư duy thuật toán đếm bài đối thủ.")
    add_bullet("Thời gian chờ phản hồi (Timeout per turn): ", "Cố định 1000 mili-giây (1.0 giây). Quá thời gian này, hệ thống tự động gán nước đi ngẫu nhiên.")
    add_bullet("Mức sát thương tương khắc: ", "Trừ 15 HP cho mỗi mối tương khắc thua cuộc; cộng 10 điểm tấn công cho Bot khắc chế thành công.")

    add_outline_heading("2.2. Bước 2: Tiếp nhận và Kiểm duyệt mã nguồn Bot (Python & C++)", level=2)
    add_p("Hệ thống tự động tiếp nhận bài nộp của các em tân sinh viên qua cổng Web:")
    add_bullet("Cấp mã định danh duy nhất: ", "Mỗi tân sinh viên đăng ký bằng Mã số sinh viên (MSSV) sẽ được cấp một `API_KEY` bí mật để xác thực.")
    add_bullet("Quy trình kiểm duyệt tự động: ", "Đối với Python, hệ thống quét tĩnh (AST Analyzer) kiểm tra cú pháp và chặn thư viện cấm (`os`, `sys`, `socket`). Đối với C++, hệ thống tự động biên dịch bằng lệnh `g++ -O3 -std=c++17`, kiểm tra không chứa các lời gọi hệ thống độc hại (`system`, `fork`).")
    add_bullet("Ghi nhận trạng thái: ", "Các Bot biên dịch và kiểm tra hợp lệ được gắn nhãn `READY` và xếp vào danh sách hạt giống thi đấu.")

    add_outline_heading("2.3. Bước 3: Phân bảng đấu đàn hồi và Lập lịch thi đấu tự động", level=2)
    add_p("Ban Tổ chức kích hoạt tính năng bốc thăm tự động trên giao diện web:")
    add_bullet("Phân bảng đàn hồi (Elastic Partitioning): ", "Dù có 50, 200 hay 1.000 tân sinh viên tham gia, hệ thống tự động gom vào các phòng đấu 4 người một cách cân bằng theo hạt giống Elo hoặc ngẫu nhiên.")
    add_bullet("Cơ chế phân đợt (Batch Scheduling): ", "Hệ thống chia các phòng thành các đợt thi đấu (Batch), mỗi đợt chạy song song 10 phòng nhằm kiểm soát mức tiêu hao RAM của máy chủ Render luôn dưới 200MB.")

    add_outline_heading("2.4. Bước 4: Vận hành động cơ thi đấu FSM và Phân giải ma trận tương khắc", level=2)
    add_p("Ban Tổ chức nhấn nút 'Khởi chạy Giải đấu (Start Tournament)':")
    add_bullet("Kích hoạt máy trạng thái FSM: ", "Máy chủ gửi tín hiệu khởi động tới các phòng đấu trong đợt hiện tại.")
    add_bullet("Phân giải đồng thời: ", "Trọng tài tự động thu thập nước đi ẩn của các Bot qua bộ đệm Blind-Commit, giải mã tương khắc ma trận và cập nhật trừ máu HP tức thời.")
    add_bullet("Chuyển đợt tự động: ", "Ngay khi một đợt 10 phòng thi đấu xong (mất khoảng 0.8 giây), hệ thống tự động giải phóng tài nguyên và nạp đợt 10 phòng tiếp theo vào thực thi.")

    add_outline_heading("2.5. Bước 5: Điều phối Đổi luật giữa các vòng và Mở cửa sổ nộp bản vá Hotfix", level=2)
    add_p("Đây là khâu then chốt nhằm thẩm định mức độ hiểu code của sinh viên:")
    add_bullet("Công bố Luật Đột biến: ", "Khi vòng đấu hiện tại kết thúc, BTC nhấn nút 'Công bố Luật Vòng mới' trên Dashboard. Luật mới lập tức hiển thị nổi bật trên toàn bộ màn hình của thí sinh kèm đồng hồ đếm ngược.")
    add_bullet("Mở Cửa sổ Nộp Bản vá (Hotfix Window 20-30 phút): ", "Hệ thống mở cổng nộp bài phiên bản mới (`v2.0`, `v3.0`). Các em có đúng 20-30 phút để chỉnh sửa logic bot thích ứng với luật mới.")
    add_bullet("Khóa cổng tự động: ", "Khi đồng hồ đếm ngược về 0, hệ thống tự động chốt danh sách mã nguồn nộp cuối cùng và tiến hành phân bảng cho vòng tiếp theo.")

    add_outline_heading("2.6. Bước 6: Cập nhật Bảng Ranking Elo và Trích xuất biên bản kết quả", level=2)
    add_p("Ngay khi toàn bộ các trận đấu kết thúc, hệ thống kích hoạt các tác vụ tổng kết:")
    add_bullet("Cập nhật Bảng Ranking tức thời: ", "Thuật toán tính điểm Elo đa người chơi tự động cập nhật điểm số cho toàn bộ tuyển thủ, đẩy trực tiếp lên Bảng xếp hạng trực tuyến hiển thị qua Cloudflare.")
    add_bullet("Trích xuất biên bản ván đấu: ", "Toàn bộ lịch sử chi tiết từng hiệp (từng nước đi, chỉ số máu, sát thương gây ra) được đóng gói thành tệp JSON/CSV để phục vụ công tác thanh tra giải đấu và trao giải.")

    add_outline_heading("2.7. Bước 7: Giám sát tài nguyên máy chủ và Kích hoạt dự phòng Cloudflare", level=2)
    add_p("Bảng điều khiển quản trị cung cấp biểu đồ giám sát tài nguyên thời gian thực:")
    add_bullet("Theo dõi mức sử dụng RAM và CPU: ", "Cảnh báo nếu bộ nhớ RAM của Render vượt quá 350MB (ngưỡng an toàn của gói 512MB).")
    add_bullet("Số lượng kết nối mạng hoạt động: ", "Hiển thị số lượng kết nối WebSocket đang mở và tốc độ phản hồi trung bình của API.")
    add_bullet("Công tắc chuyển đổi dự phòng khẩn cấp: ", "Nếu máy chủ Cloud Render gặp sự cố, Ban Tổ chức có thể kích hoạt đường hầm Cloudflare Tunnel chạy ngay trên laptop cá nhân của BTC để duy trì giải đấu thông suốt.")

    add_p("", space_before=2, space_after=4)

    # 3. QUY TRÌNH NGHIỆP VỤ CỦA TÂN SINH VIÊN NĂM NHẤT (THÍ SINH)
    add_outline_heading("3. QUY TRÌNH NGHIỆP VỤ CỦA TÂN SINH VIÊN NĂM NHẤT (THÍ SINH)", level=1)

    add_outline_heading("3.1. Đăng ký tài khoản bằng MSSV và Nhận mã khóa API Key", level=2)
    add_p("Các em tân sinh viên truy cập vào trang web giải đấu trên trình duyệt máy tính hoặc điện thoại:")
    add_bullet("Thao tác đăng ký: ", "Nhập Mã số sinh viên, Họ và tên, Lớp sinh hoạt K69 và Mật khẩu.")
    add_bullet("Nhận thông tin định danh: ", "Hệ thống cấp ngay một `API_KEY` bí mật. Sinh viên dùng khóa này để nộp code hoặc kết nối Bot vào thi đấu.")

    add_outline_heading("3.2. Lựa chọn ngôn ngữ (Python hoặc C++) và Lập trình Bot theo SDK", level=2)
    add_p("Tân sinh viên tải về bộ công cụ phát triển phần mềm (Bot SDK) cực kỳ trực quan:")
    add_bullet("Lựa chọn Python: ", "Tệp `bot_template.py` dài 20 dòng định nghĩa hàm `decide_move(game_state)`. Phù hợp cho các em thích cú pháp ngắn gọn, dễ xử lý dữ liệu.")
    add_bullet("Lựa chọn C++: ", "Tệp `bot_template.cpp` dài 25 dòng đọc dữ liệu bàn đấu từ `std::cin` và in quân bài lựa chọn ra `std::cout`. Phù hợp cho các em muốn luyện tập ngôn ngữ đang học trên lớp.")
    add_bullet("Dữ liệu đầu vào đầy đủ: ", "Tham số cung cấp lượng HP của bản thân và đối thủ, số thẻ Kéo/Búa/Bao còn lại trong tay mình và lịch sử các hiệp đấu trước.")

    add_outline_heading("3.3. Kiểm thử trên Web Simulator, Nâng cấp Bot (v1, v2) và Đấu thử Self-Play", level=2)
    add_p("Để tạo động lực cho các em liên tục hoàn thiện tư duy thuật toán, hệ thống thiết kế cơ chế Nâng cấp Bot vượt trội:")
    add_bullet("Trình giả lập Web Simulator: ", "Dán code vào khung soạn thảo trên Web, bấm 'Chạy thử ván đấu' để đấu ngay 1 trận với Bot mẫu của BTC trong 1 giây.")
    add_bullet("Cơ chế Nâng cấp Phiên bản (Bot Versioning v1.0, v2.0, v3.0): ", "Khi nghĩ ra chiến thuật mới (như đếm thẻ bài hoặc ma trận xác suất), các em lưu bản mới dưới dạng `v2.0` mà không bị mất mã nguồn cũ.")
    add_bullet("Tính năng Đấu thử nội bộ Self-Play (Bot v2 vs Bot v1): ", "Trước khi đem bản mới đi thi đấu chính thức, các em bấm nút 'So tài v2 vs v1'. Hệ thống tự động giả lập 10 ván solo giữa bản mới và bản cũ. Nếu tỷ lệ thắng vượt trội (trên 60%), các em mới tự tin bấm 'Phát hành chính thức (Deploy Active)'!")
    add_bullet("Nút Khôi phục 1 chạm (Rollback): ", "Nếu bản mới thi đấu bị tụt hạng Elo, các em có thể kích hoạt lại bản cũ ngay lập tức chỉ bằng một cú nhấp chuột.")

    add_outline_heading("3.4. Thích ứng luật mới giữa các vòng đấu (20 phút Hotfix) và Nộp bản vá", level=2)
    add_p("Khi BTC công bố Luật Đột biến cho vòng tiếp theo, thí sinh bước vào giai đoạn thử thách năng lực hiểu code cao nhất:")
    add_bullet("Đọc và phân tích luật mới: ", "Đọc kỹ thông số biến thể (ví dụ: kho bài bị lệch 7 Búa, hiệp chẵn sát thương nhân đôi, hoặc quy tắc tương khắc bị đảo ngược).")
    add_bullet("Định vị và sửa đổi mã nguồn: ", "Mở code của mình ra, định vị chính xác vị trí cần can thiệp trong hàm `decide_move`. Sinh viên tự hiểu code sẽ sửa đổi điều kiện chỉ trong vài phút.")
    add_bullet("Kiểm thử nhanh & Nộp bản vá: ", "Chạy thử 5 ván trên Web Simulator để đảm bảo không bị lỗi cú pháp, sau đó bấm 'Nộp Bản vá Vòng mới' trước khi đồng hồ 20 phút kết thúc.")

    add_outline_heading("3.5. Nộp Bot vào Đấu trường, Thách đấu Solo 1v1 và Theo dõi Bảng xếp hạng", level=2)
    add_p("Sau khi hoàn thiện thuật toán, tân sinh viên bước vào đấu trường:")
    add_bullet("Thách đấu Solo 1v1 với bạn bè: ", "Tạo mã phòng (ví dụ `#SOLO-8821`), gửi cho bạn cùng lớp để 2 con bot lao vào so tài trực tiếp (Bo3, Bo5, Bo10).")
    add_bullet("Nộp vào Đại hội Sinh tồn: ", "Bấm 'Xác nhận Nộp Bot vào Giải đấu' để hệ thống xếp vào bảng đấu toàn khóa.")
    add_bullet("Theo dõi Bảng xếp hạng Realtime: ", "Xem vị trí thứ hạng của mình nhảy số thời gian thực trên Leaderboard kèm điểm số Elo và tỷ lệ thắng.")

    add_p("", space_before=2, space_after=4)

    # 4. THIẾT KẾ CƠ CHẾ GAME OTTV2 VÀ ĐỘNG CƠ THI ĐẤU PHONG CÁCH ICPC
    add_outline_heading("4. THIẾT KẾ CƠ CHẾ GAME OTTV2 VÀ ĐỘNG CƠ THI ĐẤU PHONG CÁCH ICPC", level=1)

    add_outline_heading("4.1. Luật chơi OTTV2 (Bàn đấu 4 - 8 Bot, HP, Bộ thẻ bài hữu hạn)", level=2)
    add_p("Luật chơi OTTV2 được tối ưu hóa cho thi đấu lập trình đối kháng:")
    add_bullet("Quy mô bàn đấu chuẩn: ", "Mỗi bàn thi đấu gồm 4 Bot (hoặc 8 Bot trong vòng đại chiến sinh tồn).")
    add_bullet("Điểm Sinh Mệnh (HP): ", "Mỗi Bot bắt đầu với 100 HP. Khi bị đối thủ khắc chế trong một hiệp, Bot bị trừ máu tương ứng. Bot nào về 0 HP sẽ bị loại.")
    add_bullet("Kho thẻ bài hữu hạn: ", "Mỗi Bot được cấp đúng 5 thẻ Kéo, 5 thẻ Búa, 5 thẻ Bao cho tối đa 15 hiệp đấu. Đánh hết loại thẻ nào thì không được ra thẻ đó nữa, buộc các em phải lập trình thuật toán đếm bài đối thủ.")

    add_outline_heading("4.2. Ma trận tương khắc đồng thời và Cơ chế tính điểm sát thương", level=2)
    add_p("Trong mỗi hiệp đấu, tất cả các Bot cùng gửi nước đi ẩn trong khung thời gian 1000ms. Trọng tài phân giải ma trận tương quan giữa tất cả các cặp đấu trên bàn:")
    add_numbered_item("a.", "So sánh từng cặp đấu (Bot i, Bot j): Nếu nước đi của Bot i khắc chế Bot j (Kéo thắng Bao, Bao thắng Búa, Búa thắng Kéo), Bot j bị trừ 15 HP, đồng thời Bot i được cộng 10 điểm tấn công.")
    add_numbered_item("b.", "Quy tắc hòa: Nếu hai Bot ra cùng một loại nước đi, không có sát thương nào được tạo ra giữa hai bên.")
    add_numbered_item("c.", "Hiệu ứng thiểu số đột phá: Nếu trên bàn 4 người, có 3 Bot cùng ra Kéo và chỉ có 1 Bot ra Búa, Bot ra Búa sẽ đồng thời gây sát thương lên cả 3 đối thủ (mỗi đối thủ mất 15 HP), và nhận về 30 điểm tấn công.")

    add_outline_heading("4.3. Máy trạng thái giải đấu (FSM) và Vùng đệm ẩn nước đi (Blind-Commit Buffer)", level=2)
    add_p("Nhằm bảo đảm tính công bằng tuyệt đối giữa các tân sinh viên kết nối qua mạng, hệ thống tích hợp hai giải pháp kỹ thuật mạng cốt lõi:")
    add_bullet("Mô hình Máy trạng thái hữu hạn (FSM): ", "Vòng đời giải đấu chuyển dịch tuần tự: `LOBBY_OPEN` -> `BATCH_PAIRING` -> `ROUND_COUNTDOWN` (1000ms) -> `BLIND_COMMIT_EVALUATION` -> `LEADERBOARD_UPDATE`.")
    add_bullet("Vùng đệm ẩn nước đi (Blind-Commit Buffer): ", "Khi Bot gửi nước đi về máy chủ, máy chủ lưu lựa chọn vào bộ đệm ẩn và gửi phản hồi xác nhận cho riêng Bot đó. Máy chủ tuyệt đối không phát sóng nước đi ra ngoài mạng cho tới khi toàn bộ các Bot trong phòng đã gửi xong hoặc hết 1000ms. Triệt tiêu hoàn toàn nguy cơ sinh viên dùng công cụ bắt gói tin (Sniffer) để đọc trước nước đi của đối thủ.")

    add_outline_heading("4.4. Môi trường Sandbox an toàn (Chạy Python và Biên dịch C++ an toàn)", level=2)
    add_p("Hệ thống áp dụng cơ chế Sandbox bảo mật chuyên nghiệp để chạy mã nguồn thí sinh:")
    add_bullet("Thực thi Python an toàn: ", "Mã nguồn Python được nạp và thực thi trong tiến trình con (subprocess) có vô hiệu hóa các thư viện nguy hiểm (`os`, `sys`, `shutil`, `socket`).")
    add_bullet("Biên dịch và Chạy C++ an toàn: ", "Mã nguồn C++ được biên dịch tự động bằng trình biên dịch `g++ -O3 -std=c++17` trong môi trường cô lập. Hệ thống quét cấm các lệnh độc hại và giới hạn quyền truy cập tệp tin hệ thống.")
    add_bullet("Giới hạn thời gian cứng (Hard Timeout 1.0s): ", "Mỗi lượt tính toán của Bot được bọc trong bộ đếm thời gian nghiêm ngặt tối đa 1.0 giây. Vượt quá thời gian sẽ tự động ngắt và xử lý vi phạm.")

    add_outline_heading("4.5. Thiết kế API Endpoints và Giao thức WebSocket chuẩn hóa", level=2)
    add_p("Các điểm cuối API được thiết kế tinh gọn theo chuẩn RESTful và WebSocket WSS bảo mật:")

    t_api = doc.add_table(rows=7, cols=4)
    col_w_api = [Cm(2.5), Cm(5.0), Cm(3.5), Cm(5.0)]
    style_table(t_api, col_w_api)

    api_data = [
        ("Phương thức", "Điểm cuối (Endpoint)", "Giao thức", "Chức năng phục vụ"),
        ("POST", "/api/auth/register", "HTTPS REST", "Đăng ký tài khoản tân sinh viên và cấp API Key."),
        ("POST", "/api/bots/submit", "HTTPS REST", "Nộp mã nguồn Bot (.py hoặc .cpp, hỗ trợ version v1, v2, v3)."),
        ("POST", "/api/simulate", "HTTPS REST", "Chạy thử nghiệm Bot với Bot mẫu hoặc Self-Play v2 vs v1."),
        ("POST", "/api/matches/solo", "HTTPS REST", "Khởi tạo hàng đợi ghép đấu Solo 1v1 hoặc tạo phòng riêng."),
        ("WS", "/ws/arena/{room_id}", "WebSocket WSS", "Kênh truyền thông thời gian thực giữa Bot/Web và Đấu trường."),
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

    add_outline_heading("4.6. Thiết kế Cơ sở dữ liệu quan hệ (Database Schema hỗ trợ Versioning)", level=2)
    add_p("Hệ thống sử dụng cơ sở dữ liệu PostgreSQL lưu trữ trên Supabase với cấu trúc chuẩn 3NF gọn nhẹ:")
    add_bullet("Bảng Users: ", "`user_id` (UUID), `student_id` (VARCHAR), `full_name` (VARCHAR), `class_name` (VARCHAR), `api_key` (VARCHAR), `created_at` (TIMESTAMP).")
    add_bullet("Bảng Bots: ", "`bot_id` (UUID), `user_id` (UUID), `bot_name` (VARCHAR), `language` (VARCHAR: 'PYTHON' hoặc 'CPP'), `active_version` (VARCHAR), `elo_score` (INT, mặc định 1000), `matches_played` (INT), `wins` (INT).")
    add_bullet("Bảng BotVersions: ", "`version_id` (UUID), `bot_id` (UUID), `version_tag` (VARCHAR: 'v1.0', 'v2.0', 'v3.0'), `round_stage` (VARCHAR), `code_content` (TEXT), `uploaded_at` (TIMESTAMP).")
    add_bullet("Bảng Matches: ", "`match_id` (UUID), `round_stage` (VARCHAR), `match_type` (VARCHAR), `bot_ids` (JSONB), `winner_id` (UUID), `scores_json` (JSONB), `executed_at` (TIMESTAMP).")

    add_outline_heading("4.7. Bot SDK mẫu chuẩn cho Sinh viên Năm nhất (Bản Python và Bản C++)", level=2)
    add_p("Ban Tổ chức phát hành hai mẫu code cực kỳ ngắn gọn, dễ hiểu cho cả 2 ngôn ngữ:")

    add_p("a) Mẫu Bot bằng Python (bot_template.py - ~20 dòng):", bold=True, space_before=2, space_after=1)
    py_code = [
        'import random',
        '',
        'def decide_move(game_state):',
        '    # game_state: {"my_hp": 100, "remaining_cards": {"ROCK": 5, "PAPER": 5, "SCISSORS": 5}, "history": [...]}',
        '    cards = game_state["remaining_cards"]',
        '    available = [card for card, count in cards.items() if count > 0]',
        '    if not available: return "ROCK"',
        '    # Chiến lược phân tích lịch sử: nếu hiệp trước đối thủ hay ra Búa',
        '    if game_state.get("history") and "ROCK" in game_state["history"][-1] and "PAPER" in available:',
        '        return "PAPER"',
        '    return random.choice(available)'
    ]
    add_code_block(py_code)

    add_p("b) Mẫu Bot bằng C++ (bot_template.cpp - ~25 dòng đọc STDIN/STDOUT chuẩn ICPC):", bold=True, space_before=3, space_after=1)
    cpp_code = [
        '#include <iostream>',
        '#include <string>',
        '#include <vector>',
        '',
        'int main() {',
        '    // Hệ thống gửi bàn đấu dạng JSON hoặc text qua cin (chuẩn thi đấu ICPC)',
        '    std::string state_json;',
        '    if (std::getline(std::cin, state_json)) {',
        '        // Thuật toán phân tích nước đi của sinh viên năm nhất ở đây',
        '        // Ví dụ: kiểm tra nếu còn bài Búa thì ưu tiên ra Búa',
        '        std::cout << "ROCK" << std::endl; // Xuất nước đi ra cout',
        '    } else {',
        '        std::cout << "ROCK" << std::endl;',
        '    }',
        '    return 0;',
        '}'
    ]
    add_code_block(cpp_code)

    add_outline_heading("4.8. Chế độ Đấu Solo 1v1 Thách đấu bạn bè cùng lớp và Đấu tập Boss AI", level=2)
    add_p("Nhằm tăng cường sự gắn kết và giao lưu học thuật giữa các bạn sinh viên năm nhất, hệ thống cung cấp 3 chế độ đối kháng 1v1 linh hoạt:")
    add_bullet("Ghép ngẫu nhiên tức thời (Quick Match 1v1): ", "1 cú nhấp chuột đưa bot vào hàng đợi Solo Queue, hệ thống tự động bốc 2 bot vào bàn đấu 1v1 trong vòng chưa đầy 1 giây.")
    add_bullet("Thách đấu phòng riêng qua mã code (Private Room #SOLO-XXXX): ", "Sinh viên A tạo phòng solo, nhận mã PIN 6 ký tự (ví dụ: `#SOLO-8821`), gửi cho bạn B cùng lớp qua Zalo/Discord. Bạn B nhập mã là 2 con bot lao vào so tài trực tiếp (Bo3, Bo5, Bo10).")
    add_bullet("Đấu tập với Boss AI của BTC: ", "Thử lửa với 3 cấp độ Bot mẫu: (1) Bot Nhập môn (ngẫu nhiên); (2) Bot Thống kê (đếm tần suất bài đã ra); (3) Bot Markov Chain (dự đoán xác suất nước đi tiếp theo dựa trên chuỗi 2 hiệp gần nhất).")

    add_outline_heading("4.9. Giao diện Đấu trường Trực quan (Live Visualizer) trải nghiệm eSports", level=2)
    add_p("Giao diện sàn đấu Web biến các dòng code thành một trận đấu Thể thao Điện tử (eSports Card Duel) sống động:")
    add_bullet("Thanh sinh mệnh đối kháng (Interactive HP Bars): ", "Thanh máu hiển thị đối xứng hai bên. Khi bị trúng đòn, thanh máu co giật (Damage Shake Animation), lóe sáng đỏ và chỉ số sát thương bay lên trực quan (`-25 HP!`).")
    add_bullet("Kho bài trên tay (Deck Card UI): ", "Các thẻ Kéo, Búa, Bao hiển thị dạng thẻ bài 3D bo góc đẹp mắt, số lượng thẻ còn lại nhảy số thời gian thực (ví dụ: Kéo: 3/5, Búa: 1/5, Bao: 4/5).")
    add_bullet("Đồng hồ đếm ngược nhịp đấu kịch tính: ", "Trước mỗi hiệp, đồng hồ đếm ngược 3 giây kịch tính: 3... 2... 1... 'RA CHIÊU!'.")
    add_bullet("Hiệu ứng lật bài va chạm (Clash & Reveal Effect): ", "Hai lá bài bay vào giữa màn hình, lật mở đồng thời tóe lửa phân định thắng thua.")
    add_bullet("Nhật ký bình luận tự động (Live Combat Log): ", "Hộp tường thuật trực tiếp mô tả hài hước: 'Hiệp 4: Bot_K69 tung BÚA nghiền nát KÉO của Bot_K68! Sát thương chí mạng: -25 HP!' tạo không khí cổ vũ sôi nổi.")

    add_outline_heading("4.10. Cơ chế Đổi luật giữa các Vòng đấu (Rule Mutation) và Bot Thích nghi", level=2)
    add_p("Để bảo đảm 100% sinh viên tham gia phải thực sự làm chủ mã nguồn, Ban Tổ chức thiết kế Ma trận Đổi luật Đột biến qua 4 vòng đấu chính thức:")

    t_mut = doc.add_table(rows=5, cols=4)
    col_w_mut = [Cm(2.5), Cm(3.5), Cm(5.5), Cm(4.5)]
    style_table(t_mut, col_w_mut)

    mut_data = [
        ("Vòng thi đấu", "Tên biến thể luật", "Nội dung quy tắc đột biến", "Yêu cầu thích ứng mã nguồn"),
        ("Vòng 1:\nVòng Bảng", "Luật Chuẩn\n(Standard)", "15 thẻ bài đều (5-5-5), 100 HP,\nBúa > Kéo > Bao > Búa, sát thương 15 HP.", "Chạy đúng khung SDK, xử lý ngoại lệ,\nra bài hợp lệ trong 1000ms."),
        ("Vòng 2:\nTứ Kết", "Kho Thẻ Lệch &\nHiệp Chẵn 2x", "Kho bài lệch: 7 Búa, 3 Bao, 5 Kéo.\nỞ các hiệp chẵn (2,4,6..), sát thương x2 (30 HP).", "Sửa logic đếm thẻ còn lại, thêm điều kiện\n`turn % 2 == 0` để giữ bài an toàn."),
        ("Vòng 3:\nBán Kết", "Nghịch Đảo &\nSương Mù (Fog)", "Hiệp lẻ đảo tương khắc (Kéo > Búa > Bao > Kéo).\nẨn số bài của đối thủ, chỉ biết HP.", "Đảo bảng chân trị logic hiệp lẻ,\nchuyển sang thuật toán Nash / Xác suất Bayes."),
        ("Vòng 4:\nChung Kết", "Luật Động Server\n(Meta-Injection)", "Server inject cấu hình `rules_config` qua JSON\ntrước trận: ma trận mới, hệ số sát thương bí mật.", "Viết Bot theo kiến trúc mở (Strategy Pattern),\nđọc ma trận từ server, thích ứng tức thì.")
    ]
    for r_i, r_data in enumerate(mut_data):
        row = t_mut.rows[r_i]
        for c_i, text in enumerate(r_data):
            cell = row.cells[c_i]
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if c_i in [0, 1] else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            r = p.add_run(text)
            apply_font(r, size=11, bold=(r_i == 0))

    add_p("Cấu trúc gói tin JSON `rules_config` gửi từ Server trong Vòng Chung kết:", space_before=2, space_after=1, bold=True)
    json_rules = [
        '{',
        '  "stage": "GRAND_FINALS",',
        '  "deck": {"ROCK": 6, "PAPER": 4, "SCISSORS": 5},',
        '  "counter_matrix": {"ROCK": ["SCISSORS"], "PAPER": ["ROCK"], "SCISSORS": ["PAPER"]},',
        '  "damage_multipliers": {"even_turn": 2.0, "odd_turn": 1.0},',
        '  "fog_of_war": true',
        '}'
    ]
    add_code_block(json_rules)

    add_p("", space_before=2, space_after=4)

    # 5. GIẢI PHÁP HẠ TẦNG CLOUD VÀ NỀN TẢNG CLOUDFLARE TOÀN DIỆN CHI PHÍ 0 ĐỒNG
    add_outline_heading("5. GIẢI PHÁP HẠ TẦNG CLOUD VÀ NỀN TẢNG CLOUDFLARE TOÀN DIỆN CHI PHÍ 0 ĐỒNG", level=1)

    add_outline_heading("5.1. Mô hình kết hợp Cloudflare (Pages, Tunnel, CDN WAF), Render và Supabase", level=2)
    add_p("Để giải đấu vận hành 100% miễn phí, ổn định và bảo mật cao, Ban Tổ chức lựa chọn kiến trúc kết hợp đa tầng:")

    t_cloud = doc.add_table(rows=5, cols=4)
    col_w_cloud = [Cm(3.0), Cm(3.5), Cm(5.0), Cm(4.5)]
    style_table(t_cloud, col_w_cloud)

    cloud_data = [
        ("Thành phần", "Dịch vụ Cloud", "Hạn ngạch gói miễn phí (Free Tier)", "Ưu điểm triển khai"),
        ("Giao diện Web\n& Sàn đấu Canvas", "Cloudflare Pages\n/ Vercel", "Miễn phí 100%, băng thông không giới hạn,\ntự động deploy từ GitHub.", "Tận dụng mạng phân phối biên Anycast của Cloudflare,\ngiao diện tải cực nhanh cho toàn thể sinh viên."),
        ("Bảo vệ Mạng biên\n& Tường lửa WAF", "Cloudflare CDN\n& DDoS Shield", "Miễn phí 100%, chống DDoS tự động,\nRate Limiting ở tầng biên.", "Chặn đứng các đợt spam request, bảo vệ an toàn\ntuyệt đối cho máy chủ backend Render."),
        ("Máy chủ API\n& Động cơ trọng tài", "Render.com\n/ Railway", "Miễn phí 750 giờ/tháng, 512MB RAM,\nCPU chia sẻ mượt mà.", "Hỗ trợ Python FastAPI, xử lý logic ván đấu FSM,\nquản lý WebSocket kết nối các phòng."),
        ("Cơ sở dữ liệu\n& Bảng Ranking", "Supabase\n(PostgreSQL)", "Miễn phí 500MB database, 50.000 MAU,\nhỗ trợ Realtime WebSockets.", "Tích hợp sẵn PgBouncer Connection Pooler,\ntự động sinh API và cập nhật BXH tức thời.")
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

    add_outline_heading("5.2. Đường hầm bảo mật Cloudflare Tunnel đục lỗ NAT 0 đồng từ máy Host", level=2)
    add_p("Điểm nhấn công nghệ đặc sắc trong đề án là việc ứng dụng giải pháp Cloudflare Tunnel (`cloudflared`) hoàn toàn miễn phí:")
    add_bullet("Tình huống ứng dụng thực tế: ", "Khi Ban Tổ chức phát triển và thử nghiệm máy chủ ngay trên chiếc laptop cá nhân ở ký túc xá hoặc phòng lab trường học, laptop nằm sau nhiều lớp tường lửa mạng trường học (CGNAT) và không có địa chỉ IP tĩnh công khai.")
    add_bullet("Nguyên lý Đục lỗ NAT bảo mật: ", "Bằng cách chạy tiện ích `cloudflared` nhẹ nhàng, một đường hầm mã hóa outbound hai chiều được thiết lập từ localhost tới trạm biên mạng gần nhất của Cloudflare.")
    add_bullet("Kết quả triển khai: ", "Cổng nội bộ `localhost:8000` lập tức có một địa chỉ HTTPS/WSS công khai bảo mật (ví dụ `https://freshman-arena.trycloudflare.com`). Tân sinh viên ở khắp nơi có thể truy cập thi đấu bình thường mà BTC không cần thuê IP tĩnh hay mở port router.")

    add_outline_heading("5.3. Động cơ hàng đợi phân đợt (Batch Matchmaking Queue) tối ưu tài nguyên", level=2)
    add_p("Thách thức lớn nhất khi phục vụ đông đảo sinh viên trên hạ tầng miễn phí là nguy cơ cạn kiệt RAM nếu cho tất cả các Bot chạy đồng thời. Hệ thống áp dụng Động cơ Hàng đợi phân đợt thông minh:")
    add_bullet("Nguyên lý hoạt động: ", "Hệ thống tự động gom các thí sinh vào các phòng đấu 4 người. Máy chủ Worker không chạy tất cả các phòng cùng lúc mà chia thành các đợt (Batch), mỗi đợt chạy 10 phòng song song.")
    add_bullet("Tối ưu hóa thời gian: ", "Do mỗi ván đấu chỉ là các phép tính so sánh số học và gọi hàm Python/C++ nhẹ, một ván 15 hiệp chỉ mất trung bình 0.8 giây. Như vậy, 1 đợt (10 phòng) mất chưa tới 1 giây. Toàn bộ giải đấu cho hàng trăm sinh viên sẽ được giải quyết trọn vẹn chỉ trong vòng dưới 20 đến 30 giây!")
    add_bullet("Tiết kiệm bộ nhớ tuyệt đối: ", "Mức tiêu thụ RAM của Render luôn duy trì ở mức 150MB đến 200MB, hoàn toàn nằm trong ngưỡng an toàn 512MB của gói miễn phí.")

    add_outline_heading("5.4. Kỹ thuật tối ưu bộ nhớ, chống nghẽn kết nối và Token Bucket chống Spam", level=2)
    add_p("Hệ thống tích hợp các kỹ thuật bảo vệ tài nguyên mạng chuyên sâu:")
    add_bullet("Thuật toán Token Bucket chống Spam Request: ", "Tại tầng ứng dụng của API Gateway và mạng biên Cloudflare, mỗi địa chỉ IP hoặc tài khoản sinh viên được cấp một thùng token (ví dụ: tối đa 5 yêu cầu/giây). Ngăn chặn hoàn toàn tình trạng spam nộp code gây nghẽn máy chủ.")
    add_bullet("Giám sát nhịp sống kết nối (Heartbeat Watchdog): ", "Hệ thống kiểm tra định kỳ trạng thái của các tiến trình Worker. Nếu một Worker chiếm dụng bộ nhớ quá 60 giây, Watchdog tự động tái khởi động Worker sạch sẽ.")
    add_bullet("Bộ đệm tĩnh tại biên mạng (Cloudflare Edge Cache): ", "Trang Bảng Ranking được cấu hình bộ đệm 10 giây tại mạng biên Cloudflare. Khi hàng ngàn sinh viên cùng tải lại trang xem điểm số, 99% yêu cầu được phân phối trực tiếp từ mạng CDN của Cloudflare mà không chạm vào máy chủ Backend.")

    add_outline_heading("5.5. Kiến trúc Chịu tải cao điểm đông sinh viên không sập RAM (Zero-OOM)", level=2)
    add_p("Vào giờ cao điểm giải đấu khi đông đảo sinh viên cùng lúc ùa vào nộp code và bấm thi đấu, hệ thống triệt tiêu 100% rủi ro quá tải bằng kiến trúc 3 lớp bảo vệ:")
    add_bullet("1. Bảo vệ Tầng Web tĩnh (Cloudflare Pages & Edge CDN): ", "Phục vụ hàng chục ngàn request/giây mà không tiêu tốn một chút RAM hay CPU nào của máy chủ chính.")
    add_bullet("2. Bảo vệ Tầng Cơ sở dữ liệu (Supabase PgBouncer Pooler): ", "Gom hàng trăm kết nối đồng thời từ thí sinh thành một nhóm 15 kết nối thực tới PostgreSQL, xóa bỏ hoàn toàn lỗi cạn kiệt kết nối (`Max Connections Reached`).")
    add_bullet("3. Bảo vệ Tầng Xử lý đấu (Async Ticket Queue & Worker Pool): ", "Sử dụng Hàng đợi cấp số thứ tự điện tử (Async Ticket Queue). Máy chủ kích hoạt một Worker Pool cố định gồm 4 tiến trình con. Bộ nhớ Render luôn ổn định ở mức 150MB đến 180MB, cam kết hệ thống không bao giờ bị sập hay treo máy (Zero-OOM Guarantee).")

    add_p("", space_before=2, space_after=4)

    # 6. KẾ HOẠCH TỔ CHỨC GIẢI ĐẤU VÀ LỘ TRÌNH LẬP TRÌNH 7 NGÀY NƯỚC RÚT
    add_outline_heading("6. KẾ HOẠCH TỔ CHỨC GIẢI ĐẤU VÀ LỘ TRÌNH LẬP TRÌNH 7 NGÀY NƯỚC RÚT", level=1)

    add_outline_heading("6.1. Thể thức thi đấu 4 vòng phân bổ đàn hồi và Lộ trình đột biến luật", level=2)
    add_p("Giải đấu được thiết kế gồm 4 vòng thi đấu kịch tính, kết hợp nhịp nhàng giữa thi đấu và hiệu chỉnh thuật toán:")
    add_bullet("Vòng 1 - Vòng Bảng Sàng Lọc (Luật Chuẩn): ", "Tất cả các tân sinh viên được chia vào các phòng đấu 4 Bot. Thi đấu 3 lượt, chọn 50% số Bot có điểm cao nhất vào Vòng Tứ Kết.")
    add_bullet("Nghỉ giải lao & Cửa sổ Hotfix 1 (20 phút): ", "BTC công bố Luật Đột biến Vòng Tứ Kết (Kho bài lệch 7 Búa, Hiệp chẵn x2). Thí sinh sửa code và nộp bản vá v2.0.")
    add_bullet("Vòng 2 - Vòng Tứ Kết (Kho bài lệch & Hiệp chẵn 2x): ", "Các Bot thi đấu phân bảng 4 người. Lấy 16 Bot xuất sắc nhất vào Vòng Bán Kết.")
    add_bullet("Nghỉ giải lao & Cửa sổ Hotfix 2 (20 phút): ", "BTC công bố Luật Đột biến Vòng Bán Kết (Nghịch đảo hiệp lẻ & Sương mù). Thí sinh nộp bản vá v3.0.")
    add_bullet("Vòng 3 - Vòng Bán Kết (Nghịch đảo & Sương mù): ", "16 Bot chia thành 4 phòng 4 Bot thi đấu khốc liệt. Chọn ra 4 Bot Quán quân mỗi phòng bước vào Trận Chung Kết Tổng.")
    add_bullet("Vòng 4 - Vòng Chung Kết Đỉnh Cao (Luật Động Meta-Injection): ", "4 Bot xuất sắc nhất thi đấu đối kháng trực tiếp trên màn hình máy chiếu lớn. Server tự động truyền luật động, tìm ra Quán quân tuyệt đối.")

    add_outline_heading("6.2. Thuật toán tính điểm Elo đa người chơi và Chỉ số phụ Tie-break", level=2)
    add_p("Thuật toán xếp hạng Elo đa người chơi được chuẩn hóa bằng công thức toán học rõ ràng:")
    add_p("Kỳ vọng thắng của Bot A trước từng đối thủ B trong phòng đấu:", space_before=2, space_after=2)
    add_p("E(A, B) = 1 / [1 + 10 ^ ((R_B - R_A) / 400)]", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=2, space_after=2, bold=True, size=11)
    
    add_p("Kỳ vọng tổng thể trong phòng N người:", space_before=2, space_after=2)
    add_p("E_total(A) = Tổng[E(A, i)] / (N - 1)", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=2, space_after=2, bold=True, size=11)

    add_p("Cập nhật điểm Elo sau ván đấu:", space_before=2, space_after=2)
    add_p("R'(A) = R(A) + K * [S_actual(A) - E_total(A)]", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=2, space_after=3, bold=True, size=11)

    add_p("Trong đó, S_actual(A) nhận giá trị thứ hạng tương ứng (Hạng 1: 1.0; Hạng 2: 0.66; Hạng 3: 0.33; Hạng 4: 0.0); K = 32.")

    add_p("Chỉ số phụ (Tie-break) khi bằng điểm Elo:", space_before=2, space_after=2)
    add_numbered_item("1.", "Tổng lượng sát thương gây ra cho các đối thủ trong suốt giải đấu.")
    add_numbered_item("2.", "Hiệu số HP còn lại tại thời điểm kết thúc ván đấu.")
    add_numbered_item("3.", "Tốc độ phản hồi trung bình của Bot (Bot nào tính toán nhanh hơn sẽ xếp trên).")

    add_outline_heading("6.3. Kế hoạch lập trình nước rút 7 ngày của Ban Tổ chức (1-Week Sprint)", level=2)
    add_p("Lộ trình chi tiết từng ngày để Ban Tổ chức hoàn thành mã nguồn đưa lên Cloud:")

    t_sprint = doc.add_table(rows=8, cols=3)
    col_w_sprint = [Cm(2.5), Cm(6.5), Cm(7.0)]
    style_table(t_sprint, col_w_sprint)

    sprint_data = [
        ("Thời gian", "Nội dung công việc lập trình của BTC", "Kết quả đầu ra cụ thể"),
        ("Ngày 1", "Khởi tạo Repository GitHub, cấu hình Supabase\nvà viết module logic trọng tài OTTV2 đa người", "Module `ottv2_engine.py` hoàn thành,\nchạy đúng logic ma trận tương khắc."),
        ("Ngày 2", "Xây dựng Backend FastAPI: API nộp code,\nquản lý version Bot, Sandbox chạy Python/C++", "Backend API chạy được trên Localhost,\nkiểm thử biên dịch C++ và chạy Python an toàn."),
        ("Ngày 3", "Lập trình động cơ ghép đấu Solo 1v1 (Room Code),\nModule Rule Mutation đổi luật & Hàng đợi Batch", "Worker tự động chạy 10 phòng song song,\nhỗ trợ thay đổi ma trận luật linh hoạt."),
        ("Ngày 4", "Xây dựng Giao diện Web (HTML/JS/Canvas):\nSàn đấu Live Visualizer, Form nộp code, Thanh máu", "Giao diện trực quan sống động, sinh viên\ncó thể xem trận đấu mượt mà như game thật."),
        ("Ngày 5", "Tích hợp Bảng xếp hạng Ranking thời gian thực\nvà kết nối luồng dữ liệu Supabase Realtime", "Bảng Ranking hiển thị điểm Elo, tự động\nnhảy số khi ván đấu hoàn tất."),
        ("Ngày 6", "Triển khai hệ thống: Frontend lên Cloudflare Pages,\nBackend lên Render, thiết lập Cloudflare Tunnel", "Hệ thống có địa chỉ URL công khai bảo mật,\nsẵn sàng cho sinh viên ở mọi nơi truy cập."),
        ("Ngày 7", "Chạy thử nghiệm tải áp lực với nhiều Bot giả lập,\nviết tài liệu hướng dẫn và phát hành Bot SDK", "Hệ thống vận hành trơn tru 100%,\nchính thức mở cổng cho tân sinh viên nộp bài.")
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

    add_outline_heading("6.4. Cấu trúc thư mục mã nguồn Backend/Frontend và Tính khả thi triển khai", level=2)
    add_p("Toàn bộ mã nguồn dự án được thiết kế theo mô hình Monolith bất đồng bộ tinh gọn (Clean Architecture) với cấu trúc thư mục rõ ràng:")

    tree_lines = [
        "freshman-ottv2-arena/",
        "├── app/                          # Mã nguồn chính Backend (FastAPI)",
        "│   ├── main.py                   # Khởi chạy FastAPI, CORS & định tuyến HTTP/WS",
        "│   ├── engine/                   # Động cơ luật chơi và phân giải ván đấu",
        "│   │   ├── rules.py              # Ma trận tương khắc, cơ chế đột biến luật (Rule Mutation)",
        "│   │   └── fsm_match.py          # Máy trạng thái ván đấu FSM (Lobby, Commit, Reveal)",
        "│   ├── matchmaker/               # Động cơ ghép cặp và điều phối hàng đợi",
        "│   │   ├── solo_queue.py         # Hàng đợi ghép đấu 1v1 & quản lý mã phòng (#SOLO-XXXX)",
        "│   │   └── batch_runner.py       # Worker Pool chạy phân đợt 10 phòng song song",
        "│   ├── sandbox/                  # Môi trường thực thi mã nguồn sinh viên an toàn",
        "│   │   ├── runner_py.py          # Chạy code Python giới hạn quyền và timeout 1.0s",
        "│   │   └── runner_cpp.py         # Biên dịch g++ -O3 và chạy binary C++ an toàn",
        "│   └── models/                   # Lớp đối tượng dữ liệu và tích hợp Supabase",
        "│       └── schemas.py            # Pydantic schemas (User, Bot, BotVersion, MatchStage)",
        "├── frontend/                     # Giao diện Web tĩnh triển khai trên Cloudflare Pages",
        "│   ├── index.html                # Trang chủ, form nộp code, đấu trường và Bảng xếp hạng",
        "│   ├── visualizer.js             # Đồ họa Canvas/CSS: Thanh máu co giật, lật thẻ, hiệu ứng va chạm",
        "│   └── app.js                    # Gọi REST API và lắng nghe sự kiện WebSocket cập nhật ván đấu",
        "├── bots_sdk/                     # Tài nguyên cấp cho tân sinh viên tham gia",
        "│   ├── bot_template.py           # Mã mẫu Python chuẩn cho sinh viên năm nhất",
        "│   └── bot_template.cpp          # Mã mẫu C++ chuẩn ICPC cho sinh viên năm nhất",
        "└── requirements.txt              # fastapi, uvicorn, websockets, pydantic, supabase"
    ]
    add_code_block(tree_lines)

    add_p("Minh chứng tính khả thi tuyệt đối để lập trình hoàn thành trong đúng 7 ngày:")
    add_bullet("1. Không phụ thuộc công nghệ phức tạp: ", "Toàn bộ hệ thống chạy trên một tiến trình FastAPI duy nhất, cực kỳ dễ debug và kiểm thử trên máy tính cá nhân của BTC.")
    add_bullet("2. Danh mục thư viện tối giản: ", "Tệp `requirements.txt` chỉ bao gồm 5 thư viện phổ biến nhất của Python (`fastapi`, `uvicorn`, `websockets`, `pydantic`, `supabase-py`), việc cài đặt môi trường hoàn tất chỉ trong 30 giây bằng lệnh `pip install`.")
    add_bullet("3. Phân chia module rành mạch cho nhóm 2-3 người: ", "Thành viên 1 phụ trách `engine/` và `sandbox/` (chạy Python/C++); Thành viên 2 phụ trách `main.py`, `matchmaker/` và database Supabase; Thành viên 3 phụ trách giao diện Web `visualizer.js` và viết tài liệu hướng dẫn cho tân sinh viên. Tiến độ 7 ngày hoàn toàn khả thi và nắm chắc trong tầm tay.")

    add_p("", space_before=2, space_after=4)

    # 7. KẾ HOẠCH KIỂM THỬ TẢI, PHẢN BIỆN TÁC QUYỀN VÀ KẾT LUẬN
    add_outline_heading("7. KẾ HOẠCH KIỂM THỬ TẢI, PHẢN BIỆN TÁC QUYỀN VÀ KẾT LUẬN", level=1)

    add_outline_heading("7.1. Bộ kịch bản kiểm thử tải áp lực (Cơn bão nộp bài, Timeout, 50 vòng)", level=2)
    add_p("Hệ thống được Ban Tổ chức thẩm định qua 4 kịch bản biên khắc nghiệt trước khi mở cổng cho tân sinh viên:")

    t_stress = doc.add_table(rows=5, cols=3)
    col_w_stress = [Cm(3.5), Cm(6.5), Cm(6.5)]
    style_table(t_stress, col_w_stress)

    stress_data = [
        ("Kịch bản kiểm thử", "Mô tả hành vi giả lập", "Tiêu chí đánh giá đạt yêu cầu"),
        ("1. Cơn bão nộp bài\n(Submission Stampede)", "Hàng trăm Bot đồng loạt gửi code dự thi (Python & C++) lên hệ thống trong vòng 2 giây.", "Hệ thống không bị crash, không tràn RAM, 100% mã nguồn được lưu vào database an toàn."),
        ("2. Độ trễ cao & Timeout\n(High Latency & Silence)", "Cho nhiều Bot ngẫu nhiên cố tình 'im lặng' hoặc chạy vòng lặp quá 1000ms.", "Hệ thống bắt chính xác thời điểm quá giờ, xử thua đúng Bot lỗi, các bàn đấu còn lại chạy bình thường."),
        ("3. Đột ngột ngắt kết nối\n(Sudden Disconnect)", "Đóng kết nối bất ngờ của hàng chục Bot giữa lúc đang trong phiên đấu.", "Máy chủ giải phóng tài nguyên tiến trình sạch sẽ, không rò rỉ bộ nhớ (No Memory Leak), cập nhật tỷ số đúng."),
        ("4. Vận hành liên tục\n50 vòng thi đấu", "Chạy toàn bộ 50 vòng đấu liên tiếp cho các bảng đấu.", "Bộ nhớ RAM của Render duy trì ổn định dưới 200MB, CPU ổn định dưới 20%, tính toán điểm số chính xác 100%.")
    ]
    for r_i, r_data in enumerate(stress_data):
        row = t_stress.rows[r_i]
        for c_i, text in enumerate(r_data):
            cell = row.cells[c_i]
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if c_i == 0 else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            r = p.add_run(text)
            apply_font(r, size=11, bold=(r_i == 0))

    add_outline_heading("7.2. Quy trình phỏng vấn phản biện nhanh (Flash Code Defense) xác minh tác giả", level=2)
    add_p("Nhằm bảo đảm công bằng tuyệt đối trước khi trao giải thưởng chung cuộc, Ban Tổ chức áp dụng cơ chế xác minh tác quyền 2 tầng:")
    add_bullet("1. Đối chiếu lịch sử nộp bản vá (Git Diff Tracking): ", "Hệ thống ghi nhận bản đối chiếu (code diff) giữa các phiên bản nộp qua các vòng đấu. Kiểm tra tính liên tục của phong cách lập trình, loại bỏ trường hợp nộp một đoạn mã hoàn toàn xa lạ từ bên ngoài.")
    add_bullet("2. Phỏng vấn phản biện nhanh (Flash Code Defense - 3 phút): ", "4 thí sinh bước vào Chung Kết sẽ tham gia trả lời nhanh 2 câu hỏi kỹ thuật từ Ban Giám khảo (ví dụ: 'Tại sao em đặt điều kiện rẽ nhánh ở dòng 18?', 'Thuật toán của em phản ứng thế nào khi kho bài bị lệch 7 Búa?'). Thí sinh tự code sẽ trả lời lưu loát trong 1 phút, khẳng định 100% năng lực làm chủ mã nguồn.")

    add_outline_heading("7.3. Đánh giá tính khả thi và Giá trị giáo dục đối với Tân sinh viên năm nhất", level=2)
    add_p("Bản đề án tổng hòa này đạt được sự cân bằng tối ưu giữa tính học thuật chuyên sâu và ý nghĩa giáo dục thực tiễn:")
    add_bullet("Tính khả thi thực tiễn cao nhất: ", "Giải pháp kết hợp Nền tảng Cloudflare toàn diện (Pages, Tunnel, CDN WAF) và Cloud Render/Supabase bảo đảm giải đấu vận hành trơn tru với chi phí 0 đồng, cấu hình đơn giản và hoàn toàn có thể lập trình xong trong đợt chạy nước rút 7 ngày.")
    add_bullet("Ý nghĩa khích lệ học tập to lớn: ", "Tân sinh viên năm nhất có một sân chơi lập trình đầu khóa bổ ích, được thực hành kiến thức Python/C++ vào một trò chơi đối kháng trực quan, kích thích tinh thần tự học thuật toán và đam mê công nghệ.")
    add_bullet("Bảo đảm chất lượng đào tạo thực chất: ", "Cơ chế Đổi luật giữa các vòng đấu và phỏng vấn phản biện nhanh bảo đảm loại bỏ hoàn toàn tình trạng sao chép mã nguồn, thúc đẩy sinh viên rèn luyện tư duy lập trình và khả năng giải quyết vấn đề độc lập.")

    # Khung chữ ký phê duyệt
    add_p("", space_before=12, space_after=8)
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
    r = p_s0.add_run("TRƯỞNG BAN TỔ CHỨC GIẢI ĐẤU & QUẢN TRỊ DỰ ÁN\n")
    apply_font(r, size=11, bold=True)
    r_sub0 = p_s0.add_run("(Ký và ghi rõ họ tên)\n\n\n\n\n")
    apply_font(r_sub0, size=10, italic=True)
    r_name0 = p_s0.add_run("Nhóm Sinh viên Ban Tổ chức Giải đấu")
    apply_font(r_name0, size=11, bold=True)

    p_s1 = t_sig.rows[0].cells[1].paragraphs[0]
    p_s1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p_s1.add_run("XÁC NHẬN CỦA GIẢNG VIÊN HƯỚNG DẪN\n")
    apply_font(r, size=11, bold=True)
    r_sub1 = p_s1.add_run("(Ký và đánh giá điểm số)\n\n\n\n\n")
    apply_font(r_sub1, size=10, italic=True)
    r_name1 = p_s1.add_run("Bộ môn Kỹ thuật Phần mềm & Mạng")
    apply_font(r_name1, size=11, bold=True)

    # Save to dedicated master file
    master_name = "Bao_Cao_Ke_Hoach_Giai_Dau_OTTV2_Tan_Sinh_Vien_ICPC.docx"
    doc.save(master_name)
    print(f"SUCCESS: Saved {master_name}")

    # Also update legacy/master files if not locked
    for legacy_name in [
        "Bao_Cao_Ke_Hoach_Du_An_Game_OTTV2_Cloudflare_MultiUser.docx",
        "Bao_Cao_Ke_Hoach_Du_An_Game_OTTV2_Master_1000User.docx",
        "Ke_Hoach_Du_An_Game_OTTV2_Cloud_Render_1000User.docx"
    ]:
        try:
            doc.save(legacy_name)
            print(f"SUCCESS: Also updated {legacy_name}")
        except Exception as e:
            print(f"Notice: {legacy_name} is currently open in Word, skipping overwrite.")

if __name__ == "__main__":
    generate_icpc_master_document()

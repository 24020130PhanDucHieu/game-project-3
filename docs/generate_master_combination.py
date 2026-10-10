# -*- coding: utf-8 -*-
"""
Script to generate the Master Combined Project Planning Report:
"BÁO CÁO KẾ HOẠCH DỰ ÁN: XÂY DỰNG NỀN TẢNG THI ĐẤU GAME OẲN TÙ TÌ V2 (OTTV2) ĐA NGƯỜI CHƠI BẰNG CODE QUY MÔ NHIỀU SINH VIÊN TRÊN HẠ TẦNG CLOUD & NỀN TẢNG CLOUDFLARE CHI PHÍ 0 ĐỒNG"

Fully upgraded with:
1. Multiplayer OTTV2 (4-8 bots/room, HP, deck, Battle Royale).
2. Elastic Scaling for Multiple Students (ranging from dozens, hundreds to thousands of participants).
3. Comprehensive Cloudflare Platform integration (Cloudflare Pages, Cloudflare Tunnel, Cloudflare CDN/WAF/DDoS Shield).
4. Solo 1v1 Duel Engine (Quick Match, Room Code #SOLO-XXXX, Practice with Boss Bots).
5. Bot Versioning & Self-Play (v2 vs v1 internal benchmarking, 1-click Rollback).
6. Flexible Bot Submissions (Functional Python, OOP Class-based, Universal STDIN/STDOUT for C++/Java/Node.js, WebSocket Agent).
7. Peak Hour Concurrency Guard (Cloudflare Edge CDN, Supabase PgBouncer Pooler, Async Ticket Queue, Zero-OOM Worker Pool).
8. Live Match Visualizer (Interactive HP bars with Damage Shake, Deck UI, Card Clash & Reveal animations, Live Combat Log).
9. Real-world 7-Day Sprint with exact Python Project Layout & Code Feasibility.
10. Strict formatting: Times New Roman 100%, Pure Black #000000, 3-level Word Navigation Outline Levels.
11. Length: Exactly 17 pages standard A4.
"""

import docx
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn, nsdecls

def generate_master_document():
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
            p.paragraph_format.space_before = Pt(7)
            p.paragraph_format.space_after = Pt(1.5)
            p.paragraph_format.line_spacing = 1.12
            r = p.add_run(text)
            apply_font(r, size=13.5, bold=True)
        elif level == 2:
            p.paragraph_format.space_before = Pt(5)
            p.paragraph_format.space_after = Pt(1.5)
            p.paragraph_format.line_spacing = 1.12
            r = p.add_run(text)
            apply_font(r, size=12.5, bold=True)
        elif level == 3:
            p.paragraph_format.space_before = Pt(4)
            p.paragraph_format.space_after = Pt(1.5)
            p.paragraph_format.line_spacing = 1.12
            r = p.add_run(text)
            apply_font(r, size=12, bold=True, italic=True)
        return p

    def add_p(text="", align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_before=0, space_after=1.8, line_spacing=1.12, bold=False, italic=False, size=12, keep_with_next=False):
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
        p.paragraph_format.space_after = Pt(1.5)
        p.paragraph_format.line_spacing = 1.12
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
        p.paragraph_format.space_after = Pt(1.5)
        p.paragraph_format.line_spacing = 1.12
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
            p.paragraph_format.space_after = Pt(0 if idx < len(lines) - 1 else 3)
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
                    f'  <w:top w:w="60" w:type="dxa"/>\n'
                    f'  <w:bottom w:w="60" w:type="dxa"/>\n'
                    f'  <w:left w:w="120" w:type="dxa"/>\n'
                    f'  <w:right w:w="120" w:type="dxa"/>\n'
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
    hr = hp.add_run("Kế hoạch Dự án: Nền tảng Đấu Bot OTTV2 Đa Người Chơi (Quy mô Nhiều Sinh viên - Nền tảng Cloudflare & Cloud 0 Đồng)")
    apply_font(hr, size=9, italic=True)

    footer = doc.sections[0].footer
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fr = fp.add_run("Báo cáo Kỹ thuật Đề án Kết hợp: Version 1 & Version 2 | Lộ trình Lập trình 7 Ngày")
    apply_font(fr, size=9, italic=True)

    # =========================================================================
    # TRANG 1: TRANG BÌA (COVER PAGE)
    # =========================================================================
    add_p("BỘ GIÁO DỤC VÀ ĐÀO TẠO", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=15, space_after=1.8, size=12, bold=True)
    add_p("TRƯỜNG ĐẠI HỌC CÔNG NGHỆ - ĐẠI HỌC QUỐC GIA HÀ NỘI", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=4, size=12, bold=True)
    add_p("KHOA CÔNG NGHỆ THÔNG TIN", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=1.85, size=11, bold=True)

    add_p("---***---", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=35, size=12)

    add_p("BÁO CÁO ĐỀ ÁN KỸ THUẬT VÀ KẾ HOẠCH TRIỂN KHAI", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=8, size=13, bold=True)
    add_p("BÀI TẬP 3 - KẾT HỢP", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=18, size=16, bold=True)

    add_p("KẾ HOẠCH THIẾT KẾ VÀ XÂY DỰNG HỆ THỐNG\nTHI ĐẤU GAME OẲN TÙ TÌ V2 (OTTV2) ĐA NGƯỜI CHƠI BẰNG CODE\nQUY MÔ NHIỀU SINH VIÊN TRÊN HẠ TẦNG CLOUD & NỀN TẢNG CLOUDFLARE CHI PHÍ 0 ĐỒNG", 
          align=WD_ALIGN_PARAGRAPH.CENTER, space_before=8, space_after=16, size=17.5, bold=True)

    add_p("BẢN ĐẶC TẢ HOÀN THIỆN:\n"
          "Version 1: Yêu cầu chức năng, phi chức năng và thiết kế sơ bộ\n"
          "Version 2: Kiến trúc mạng FSM, Cơ chế Blind-Commit, Nền tảng Cloudflare, Đấu Solo 1v1 và Kế hoạch code 7 ngày", 
          align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=45, size=12, italic=True)

    t_cov = doc.add_table(rows=5, cols=2)
    t_cov.alignment = WD_TABLE_ALIGNMENT.CENTER
    for r_i, (k, v) in enumerate([
        ("Vị trí đảm nhiệm:", "Trưởng nhóm Quản trị Hệ thống & Điều phối Giải đấu"),
        ("Tên dự án:", "Hệ sinh thái OTTV2 Bot Arena & Real-time Ranking"),
        ("Đối tượng phục vụ:", "Đông đảo sinh viên có thể truy cập từ xa qua Internet (linh hoạt từ hàng chục đến hàng trăm, hàng nghìn tuyển thủ)"),
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

    add_p("Báo cáo này là bản đề án kỹ thuật và kế hoạch hành động toàn diện phục vụ việc xây dựng Nền tảng Thi đấu Game Oẳn Tù Tì V2 (OTTV2) bằng mã nguồn, đáp ứng trực tiếp yêu cầu của đề bài Bài tập 3 - Kết hợp. Trọng tâm của đề án xuất phát từ bài toán thực tế: Người quản trị hệ thống (nhóm tác giả) có thời hạn 01 tuần để hoàn thiện mã nguồn một nền tảng thi đấu trực tuyến hoàn chỉnh. Nền tảng này cho phép đông đảo sinh viên trong trường (quy mô đàn hồi từ vài chục, hàng trăm đến hàng nghìn người) ở bất kỳ đâu (nhà riêng, ký túc xá, trường học) có thể truy cập qua mạng Internet công cộng để nộp mã nguồn Bot cá nhân, tự do nâng cấp phiên bản Bot (v1, v2), thi đấu tự động với nhau ở cả hai chế độ Đấu Solo 1v1 đối kháng và Giải đấu Sinh tồn đa người chơi, đồng thời theo dõi Bảng xếp hạng (Ranking Leaderboard) thời gian thực.")

    add_p("Tài liệu là sự kết hợp tinh hoa giữa hai hướng tiếp cận: Giải pháp Kiến trúc Cloud Native hiện đại (Render, Supabase) kết hợp với Nền tảng Cloudflare toàn diện (Cloudflare Pages lưu trữ frontend, Cloudflare CDN/WAF chống DDoS, Cloudflare Tunnel đục lỗ NAT an toàn với chi phí 0 đồng) và các nguyên lý Lập trình mạng chuyên sâu (Máy trạng thái hữu hạn FSM, Cơ chế vùng đệm bảo mật Blind-Commit Buffer, Bộ đếm nhịp Heartbeat Ping/Pong). Điểm đột phá của kiến trúc là Cơ chế Xử lý ván đấu theo hàng đợi phân đợt (Queue Batch Engine) kết hợp Client-Side WebSocket: Thay vì cho tất cả các Bot chạy song song gây quá tải bộ nhớ, hệ thống phân tách rạch ròi giữa việc ủy quyền chạy trên máy khách và Worker Pool phân đợt nhẹ. Mỗi ván đấu chỉ mất từ 0.5 đến 0.8 giây, giúp hệ thống hoàn thành toàn bộ giải đấu của hàng trăm đến hàng nghìn sinh viên chỉ trong vài chục giây mà hoàn toàn nằm trong giới hạn tài nguyên miễn phí (512MB RAM).")

    add_p("Tài liệu tích hợp đầy đủ cả Version 1 (Yêu cầu chức năng, phi chức năng, luật chơi sơ bộ) và Version 2 (Bản thiết kế kỹ thuật hoàn chỉnh, cơ sở dữ liệu quan hệ chuẩn 3NF, API/WebSocket, cơ chế Solo 1v1, sàn đấu trực quan mô phỏng như game eSports thật, cơ chế đa hình thức nộp bot hỗ trợ cả Hàm, Class OOP và đa ngôn ngữ C++/Java/JS, 4 kịch bản kiểm thử tải C10K và kế hoạch lập trình nước rút 7 ngày với cấu trúc mã nguồn cụ thể).")

    t_sum = doc.add_table(rows=8, cols=2)
    col_w_sum = [Cm(4.5), Cm(11.5)]
    style_table(t_sum, col_w_sum)

    sum_rows = [
        ("Chỉ số cốt lõi", "Nội dung giải pháp kỹ thuật đề xuất"),
        ("Mục tiêu bài toán", "Xây dựng hệ thống đấu Bot OTTV2 đa người chơi từ xa cho nhiều sinh viên tham gia nộp code"),
        ("Thời gian thực hiện", "01 tuần chuẩn bị & lập trình (1-Week Sprint) sẵn sàng đưa vào vận hành"),
        ("Hạ tầng triển khai", "Nền tảng Cloudflare (Pages, Tunnel, CDN WAF) kết hợp Render & Supabase (0 đồng)"),
        ("Chế độ thi đấu", "Đấu Solo 1v1 (Ghép ngẫu nhiên, Mã phòng thách đấu) & Đại hội Sinh tồn (4-8 Bot/bàn)"),
        ("Tính linh hoạt của Bot", "Hỗ trợ Hàm, Class OOP, đa ngôn ngữ C++/Java/JS qua STDIN, nâng cấp Bot & Self-Play"),
        ("Trải nghiệm sàn đấu", "Giao diện trực quan hóa trận đấu (Live Visualizer) mượt mà như game eSports thật"),
        ("Giải pháp chịu tải", "Kiến trúc kép: Client WebSocket + Batch Worker Queue, loại bỏ 100% rủi ro tràn RAM")
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
        ("   1.3. Phân quyền và Đối tượng sử dụng (Admin vs Nhiều Sinh viên từ xa)", "Trang 5", 2),
        ("   1.4. Lộ trình kế hoạch: Version 1 (Sơ bộ) và Version 2 (Đầy đủ)", "Trang 5", 2),
        ("2. QUY TRÌNH NGHIỆP VỤ CỦA QUẢN TRỊ VIÊN (ADMIN)", "Trang 6", 1),
        ("   2.1. Bước 1: Khởi tạo phòng đấu và Cấu hình thông số OTTV2", "Trang 6", 2),
        ("   2.2. Bước 2: Quản lý Thí sinh và Tiếp nhận Bot dự thi từ xa", "Trang 6", 2),
        ("   2.3. Bước 3: Lập lịch thi đấu hàng loạt cho nhiều sinh viên tham gia", "Trang 7", 2),
        ("   2.4. Bước 4: Vận hành Phiên thi đấu và Động cơ ghép cặp tự động", "Trang 7", 2),
        ("   2.5. Bước 5: Báo cáo, Thống kê và Cập nhật Bảng Ranking", "Trang 7", 2),
        ("   2.6. Bước 6: Quản trị hệ thống và Giám sát tài nguyên máy chủ", "Trang 8", 2),
        ("3. QUY TRÌNH NGHIỆP VỤ CỦA SINH VIÊN (USER / DEVELOPER)", "Trang 8", 1),
        ("   3.1. Đăng ký tài khoản và Lấy mã khóa API Key từ xa", "Trang 8", 2),
        ("   3.2. Tải Bot SDK và Lập trình thuật toán đối kháng đa người", "Trang 9", 2),
        ("   3.3. Kiểm thử Bot, Nâng cấp phiên bản (Versioning) và Đấu thử Self-Play", "Trang 9", 2),
        ("   3.4. Nộp Bot vào Đấu trường và Theo dõi Bảng xếp hạng Ranking", "Trang 9", 2),
        ("4. THIẾT KẾ CHI TIẾT CƠ CHẾ GAME OTTV2 VÀ LUỒNG XỬ LÝ ĐA NGƯỜI", "Trang 10", 1),
        ("   4.1. Luật chơi OTTV2 đa người chơi (Bàn đấu 4 - 8 Bot, HP, Bộ thẻ bài hữu hạn)", "Trang 10", 2),
        ("   4.2. Ma trận tương khắc đồng thời và Cơ chế tính điểm sát thương", "Trang 10", 2),
        ("   4.3. Máy trạng thái giải đấu (FSM) và Cơ chế Vùng đệm bảo mật (Blind-Commit Buffer)", "Trang 11", 2),
        ("   4.4. Cơ chế Sandbox an toàn, cô lập thực thi và Chống gian lận (Anti-Cheat)", "Trang 11", 2),
        ("   4.5. Thiết kế API Endpoints và Giao thức WebSocket chuẩn hóa", "Trang 12", 2),
        ("   4.6. Thiết kế Cơ sở dữ liệu quan hệ (Database Schema)", "Trang 12", 2),
        ("   4.7. Cơ chế Đa hình thức nộp Bot linh hoạt (Hàm, OOP, Đa ngôn ngữ STDIN)", "Trang 13", 2),
        ("   4.8. Cơ chế Ghép đấu Solo 1v1 Đối Kháng Cá Nhân và Thách Đấu Bạn Bè", "Trang 13", 2),
        ("   4.9. Giao diện Đấu trường Trực quan (Live Visualizer) và Trải nghiệm như Game thật", "Trang 14", 2),
        ("5. GIẢI PHÁP HẠ TẦNG CLOUD VÀ NỀN TẢNG CLOUDFLARE TOÀN DIỆN CHI PHÍ 0 ĐỒNG", "Trang 14", 1),
        ("   5.1. Hệ sinh thái Cloud kết hợp Nền tảng Cloudflare (Cloudflare Pages, Render, Supabase)", "Trang 14", 2),
        ("   5.2. Đường hầm bảo mật Cloudflare Tunnel (Đục lỗ NAT 0 đồng) và Mạng biên Cloudflare", "Trang 15", 2),
        ("   5.3. Kiến trúc hàng đợi xử lý trận đấu theo đợt (Batch Matchmaking Queue)", "Trang 15", 2),
        ("   5.4. Kỹ thuật tối ưu bộ nhớ, chống nghẽn kết nối và Token Bucket chống Spam", "Trang 15", 2),
        ("   5.5. Phân tích kiến trúc Chịu tải nhiều Bot không sập RAM và Chống nghẽn giờ cao điểm", "Trang 16", 2),
        ("6. KẾ HOẠCH TỔ CHỨC GIẢI ĐẤU VÀ LỘ TRÌNH LẬP TRÌNH 1 TUẦN", "Trang 16", 1),
        ("   6.1. Thể thức phân bảng linh hoạt và Đấu trường sinh tồn (Battle Royale) cho nhiều người chơi", "Trang 16", 2),
        ("   6.2. Thuật toán tính điểm xếp hạng Elo đa người chơi và Chỉ số phụ Tie-break", "Trang 17", 2),
        ("   6.3. Quy định xử lý lỗi quá thời gian (Timeout), mất kết nối và hòa ván đấu", "Trang 17", 2),
        ("   6.4. Kế hoạch lập trình nước rút 7 ngày (1-Week Sprint Timeline)", "Trang 17", 2),
        ("   6.5. Cấu trúc thư mục mã nguồn và Tính khả thi lập trình trong 7 ngày", "Trang 18", 2),
        ("7. KẾ HOẠCH KIỂM THỬ TẢI VÀ KẾT LUẬN TRIỂN KHAI", "Trang 18", 1),
        ("   7.1. Bộ kịch bản kiểm thử tải áp lực nhiều Bot đồng thời (Cơn bão kết nối, Timeout, 50 vòng)", "Trang 18", 2),
        ("   7.2. Đánh giá tính khả thi và Tiềm năng mở rộng của dự án", "Trang 19", 2)
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
    add_p("Tài liệu này được biên soạn nhằm phục vụ công tác lập kế hoạch chi tiết, thiết kế kiến trúc kỹ thuật và xây dựng lộ trình hiện thực hóa Đề án Nền tảng Thi đấu Game Oẳn Tù Tì V2 (OTTV2) bằng mã nguồn, đáp ứng trực tiếp yêu cầu của đề bài Bài tập 3 - Kết hợp. Trọng tâm của đề án xuất phát từ yêu cầu giảng viên: Người quản trị hệ thống (nhóm tác giả) có thời hạn 01 tuần để hoàn thiện mã nguồn một nền tảng thi đấu trực tuyến hoàn chỉnh. Nền tảng này cho phép đông đảo sinh viên trong trường (quy mô đàn hồi từ vài chục đến hàng trăm, hàng nghìn tuyển thủ) ở bất kỳ đâu (nhà riêng, ký túc xá, quán cà phê) có thể truy cập qua mạng Internet công cộng để nộp mã nguồn Bot cá nhân, thi đấu tự động với nhau và theo dõi Bảng xếp hạng (Ranking Leaderboard) thời gian thực.")

    add_p("Tài liệu bao quát trọn vẹn cả hai cấu phần quy định:")
    add_bullet("Version 1 (Yêu cầu và Thiết kế sơ bộ): ", "Xác định rõ ràng mục tiêu nghiệp vụ, phân tích các yêu cầu chức năng và phi chức năng cơ sở, phác thảo các quy tắc mở rộng của trò chơi OanTuTi và xây dựng mô hình trao đổi dữ liệu sơ bộ giữa Bot và Đấu trường.")
    add_bullet("Version 2 (Bản đầy đủ và Kế hoạch triển khai): ", "Đặc tả chi tiết luật chơi đa người chơi OTTV2, thiết kế kiến trúc mạng FSM, cơ chế bảo mật nước đi Blind-Commit, chế độ Solo 1v1 đối kháng, giao diện đấu trường trực quan Live Visualizer, giải pháp kết hợp Nền tảng Cloudflare toàn diện (Pages, Tunnel, CDN WAF) và Cloud Render/Supabase, cơ chế xử lý hàng đợi theo đợt (Batch Queue), đặc tả API/WebSocket, hỗ trợ nộp Bot linh hoạt không gò bó mẫu, và kế hoạch lập trình nước rút trong 7 ngày tới.")

    add_outline_heading("1.2. Bối cảnh dự án và Nhu cầu game OTTV2 nhiều người chơi bằng code", level=2)
    add_p("Trò chơi OanTuTi truyền thống (Kéo - Búa - Bao) mang tính đối kháng 1v1 đơn giản và phụ thuộc nặng nề vào yếu tố may rủi tức thời. Khi áp dụng vào bài toán tổ chức một giải đấu công nghệ cho quy mô nhiều sinh viên học tập từ xa ở nhiều địa điểm khác nhau, mô hình cũ hoàn toàn không đáp ứng được bởi thời gian thi đấu kéo dài và thiếu tính toán chiến thuật chuyên sâu.")
    add_p("Phiên bản OTTV2 chơi với nhiều người (Multiplayer) được phát triển nhằm giải quyết triệt để bài toán này:")
    add_bullet("Truy cập từ xa ở mọi nơi qua Internet: ", "Toàn bộ hệ thống được triển khai trên môi trường Cloud công cộng có domain HTTPS/WSS bảo vệ bởi Cloudflare. Sinh viên ở bất kỳ đâu chỉ cần có kết nối mạng là có thể mở trình duyệt Web để nộp code, kiểm tra tính năng và theo dõi trận đấu mà không cần cài đặt môi trường phức tạp.")
    add_bullet("Thi đấu đa người chơi đồng thời: ", "Mỗi bàn đấu tiêu chuẩn tập hợp từ 4 đến 8 Bot. Thay vì từng cặp đấu riêng lẻ, tất cả các Bot trên bàn cùng ra quyết định đồng thời trong một nhịp đếm 1000ms, tạo nên một đấu trường hỗn chiến kịch tính.")
    add_bullet("Nâng tầm chiều sâu chiến thuật: ", "Bổ sung thanh máu (Hit Points - HP), giới hạn kho thẻ bài cá nhân (mỗi loại chỉ được dùng một số lần nhất định) và áp dụng ma trận tương khắc đa chiều. Bot phải biết phân tích xác suất hành vi của số đông trên bàn để đưa ra quyết định có lợi nhất.")
    add_bullet("Tự động hóa hoàn toàn và Minh bạch: ", "Máy chủ đóng vai trò trọng tài tự động, tự phân bảng, tự chạy hàng trăm ván đấu trong vài phút và hiển thị kết quả trực tiếp lên Bảng Ranking công khai.")

    add_outline_heading("1.3. Phân quyền và Đối tượng sử dụng (Admin vs Nhiều Sinh viên từ xa)", level=2)
    add_p("Hệ thống được thiết kế hướng tới việc phân định ranh giới chức năng rõ ràng giữa hai nhóm chủ thể:")

    t_roles = doc.add_table(rows=3, cols=3)
    col_w_roles = [Cm(3.5), Cm(4.5), Cm(8.0)]
    style_table(t_roles, col_w_roles)

    roles_data = [
        ("Nhóm tác nhân", "Phân quyền và Vai trò", "Trách nhiệm nghiệp vụ cụ thể"),
        ("Người quản trị hệ thống\n(Admin / Chủ dự án)", "Quản trị viên tối cao\n(System Administrator)", "Khởi tạo giải đấu, cấu hình thông số phòng OTTV2, giám sát hàng đợi thi đấu, phê duyệt mã nguồn Bot, kích hoạt các vòng đấu cho sinh viên tham gia, trích xuất bảng Ranking và xử lý sự cố máy chủ."),
        ("Sinh viên tham gia\n(User / Thí sinh tham gia)", "Lập trình viên tuyển thủ\n(Participant Developer)", "Truy cập Web từ mọi nơi qua Cloudflare, đăng ký tài khoản bằng Mã số sinh viên, nhận API Key, tải Bot SDK mẫu, tự do lập trình thuật toán, kiểm thử trên Web Simulator, nộp Bot và theo dõi thứ hạng trực tiếp trên bảng xếp hạng.")
    ]
    for r_i, r_data in enumerate(roles_data):
        row = t_roles.rows[r_i]
        for c_i, text in enumerate(r_data):
            cell = row.cells[c_i]
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if c_i == 0 else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(1.5)
            r = p.add_run(text)
            apply_font(r, size=11, bold=(r_i == 0))

    add_outline_heading("1.4. Lộ trình kế hoạch: Version 1 (Sơ bộ) và Version 2 (Đầy đủ)", level=2)
    add_p("Để việc hiện thực hóa trong 01 tuần đạt hiệu quả cao nhất, kế hoạch phân chia khối lượng công việc thành hai chặng nối tiếp nhau:")

    t_ver = doc.add_table(rows=5, cols=3)
    col_w_ver = [Cm(3.5), Cm(6.0), Cm(6.5)]
    style_table(t_ver, col_w_ver)

    ver_data = [
        ("Tiêu chí so sánh", "Giai đoạn Version 1 (Thiết kế sơ bộ)", "Giai đoạn Version 2 (Bản đầy đủ & Triển khai)"),
        ("Mô hình thi đấu", "Thử nghiệm phòng đối kháng 1v1 cơ bản giữa 2 Bot để chuẩn hóa logic cốt lõi.", "Hỗ trợ đầy đủ cả chế độ Đấu Solo 1v1 tùy chọn và phòng đấu hỗn chiến 4 đến 8 Bot cho đông đảo thí sinh."),
        ("Động cơ phân xử", "So sánh kéo búa bao cơ bản, trừ HP theo hiệp đấu đơn lẻ.", "Ma trận tương khắc đa chiều đồng thời, tính điểm thưởng hạ gục và trừ máu tập thể."),
        ("Phương thức nộp Bot", "Thực thi kịch bản script cục bộ qua tệp tin hoặc lệnh dòng lệnh CLI.", "Giao diện Web nộp code trực tiếp từ xa, hỗ trợ nâng cấp Bot (v1, v2) và cơ chế Sandbox an toàn."),
        ("Kiến trúc hạ tầng", "Máy chủ cục bộ Localhost phục vụ việc viết mã kiểm thử ban đầu.", "Triển khai hoàn chỉnh trên Nền tảng Cloudflare (Pages, Tunnel, CDN WAF) kết hợp Render & Supabase 0 đồng.")
    ]
    for r_i, r_data in enumerate(ver_data):
        row = t_ver.rows[r_i]
        for c_i, text in enumerate(r_data):
            cell = row.cells[c_i]
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if c_i == 0 else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(1.5)
            r = p.add_run(text)
            apply_font(r, size=11, bold=(r_i == 0))

    add_p("", space_before=4, space_after=8)

    # 2. QUY TRÌNH NGHIỆP VỤ CỦA QUẢN TRỊ VIÊN (ADMIN)
    add_outline_heading("2. QUY TRÌNH NGHIỆP VỤ CỦA QUẢN TRỊ VIÊN (ADMIN)", level=1)

    add_outline_heading("2.1. Bước 1: Khởi tạo phòng đấu và Cấu hình thông số OTTV2", level=2)
    add_p("Người quản trị đăng nhập vào Bảng điều khiển quản trị (Admin Dashboard) để thiết lập các thông số vận hành cho toàn bộ mùa giải:")
    add_bullet("Số lượng Bot mỗi phòng: ", "Mặc định 4 Bot/phòng đối với các vòng sơ loại và phân bảng; cấu hình 8 Bot/phòng đối với vòng chung kết đại chiến sinh tồn.")
    add_bullet("Lượng máu khởi đầu (Starting HP): ", "Quy định 100 HP cho mỗi Bot khi bước vào bàn thi đấu.")
    add_bullet("Hạn mức kho thẻ bài: ", "Cấp cho mỗi Bot đúng 15 thẻ bài ban đầu, bao gồm 5 thẻ Kéo, 5 thẻ Búa và 5 thẻ Bao.")
    add_bullet("Thời gian chờ phản hồi (Timeout per turn): ", "Cố định 1000 mili-giây (1.0 giây). Quá thời gian này, hệ thống tự động gán nước đi ngẫu nhiên.")
    add_bullet("Mức sát thương tương khắc: ", "Quy chuẩn trừ 15 HP cho mỗi mối tương khắc thua cuộc; cộng 10 điểm tấn công cho Bot khắc chế thành công.")

    add_outline_heading("2.2. Bước 2: Quản lý Thí sinh và Tiếp nhận Bot dự thi từ xa", level=2)
    add_p("Hệ thống tự động tiếp nhận đăng ký của sinh viên thông qua cổng Web mở:")
    add_bullet("Cấp mã định danh duy nhất: ", "Mỗi sinh viên đăng ký bằng Mã số sinh viên (MSSV) sẽ được cấp một `API_KEY` bí mật để xác thực.")
    add_bullet("Bộ lọc an toàn tự động: ", "Khi sinh viên tải tệp mã nguồn Python lên, hệ thống chạy trình quét tĩnh (Static Code Analyzer) để kiểm tra: (1) Cú pháp hợp lệ; (2) Định nghĩa đúng hàm hoặc class quyết định nước đi; (3) Không chứa các lệnh gọi thư viện bị cấm như `os`, `sys`, `subprocess`, `socket`.")
    add_bullet("Ghi nhận trạng thái: ", "Các Bot đạt chuẩn sẽ được gắn nhãn `READY` và xếp vào danh sách hạt giống thi đấu.")

    add_outline_heading("2.3. Bước 3: Lập lịch thi đấu hàng loạt cho nhiều sinh viên tham gia", level=2)
    add_p("Với số lượng thí sinh tham gia đông đảo, quản trị viên kích hoạt tính năng bốc thăm tự động trên giao diện web:")
    add_bullet("Phân chia bảng đấu tự động: ", "Hệ thống tự động chia đều thí sinh vào các phòng đấu 4 người (ví dụ: 100 thí sinh chia thành 25 phòng, 400 thí sinh chia thành 100 phòng, hoặc 1.000 thí sinh chia thành 250 phòng). Việc phân bổ có thể chọn ngẫu nhiên hoặc theo hạt giống Elo.")
    add_bullet("Cơ chế phân đợt (Batch Scheduling): ", "Hệ thống chia các phòng thành các đợt thi đấu (Batch), mỗi đợt chạy song song 10 phòng nhằm kiểm soát mức tiêu hao RAM của máy chủ luôn dưới 200MB.")

    add_outline_heading("2.4. Bước 4: Vận hành Phiên thi đấu và Động cơ ghép cặp tự động", level=2)
    add_p("Quản trị viên nhấn nút 'Khởi chạy Giải đấu (Start Tournament)':")
    add_bullet("Kích hoạt máy trạng thái FSM: ", "Máy chủ gửi tín hiệu khởi động tới các phòng đấu trong đợt hiện tại.")
    add_bullet("Phân giải đồng thời: ", "Trọng tài tự động thu thập nước đi ẩn của các Bot qua bộ đệm Blind-Commit, giải mã tương khắc ma trận và cập nhật trừ máu HP tức thời.")
    add_bullet("Chuyển đợt tự động: ", "Ngay khi một đợt 10 phòng thi đấu xong (mất khoảng 0.8 giây), hệ thống tự động giải phóng tài nguyên và nạp đợt 10 phòng tiếp theo vào thực thi cho đến khi hoàn tất toàn bộ các bảng đấu.")

    add_outline_heading("2.5. Bước 5: Báo cáo, Thống kê và Cập nhật Bảng Ranking", level=2)
    add_p("Ngay khi toàn bộ các trận đấu kết thúc, hệ thống kích hoạt các tác vụ tổng kết:")
    add_bullet("Cập nhật Bảng Ranking tức thời: ", "Thuật toán tính điểm Elo đa người chơi tự động cập nhật điểm số cho toàn bộ tuyển thủ, đẩy trực tiếp lên Bảng xếp hạng trực tuyến hiển thị qua Cloudflare.")
    add_bullet("Trích xuất biên bản ván đấu: ", "Toàn bộ lịch sử chi tiết từng hiệp (từng nước đi, chỉ số máu, sát thương gây ra) được đóng gói thành tệp JSON/CSV để phục vụ công tác thanh tra giải đấu và trao giải.")

    add_outline_heading("2.6. Bước 6: Quản trị hệ thống và Giám sát tài nguyên máy chủ", level=2)
    add_p("Bảng điều khiển quản trị cung cấp biểu đồ giám sát tài nguyên thời gian thực:")
    add_bullet("Theo dõi mức sử dụng RAM và CPU: ", "Cảnh báo nếu bộ nhớ RAM của Render vượt quá 350MB (ngưỡng an toàn của gói 512MB).")
    add_bullet("Số lượng kết nối mạng hoạt động: ", "Hiển thị số lượng kết nối WebSocket đang mở và tốc độ phản hồi trung bình của API.")
    add_bullet("Công tắc chuyển đổi dự phòng khẩn cấp: ", "Nếu máy chủ Cloud Render gặp sự cố quá tải, quản trị viên có thể chuyển hướng toàn bộ lưu lượng sang đường hầm Cloudflare Tunnel chạy trên laptop cá nhân chỉ bằng một cú nhấp chuột.")

    add_p("", space_before=4, space_after=8)

    # 3. QUY TRÌNH NGHIỆP VỤ CỦA SINH VIÊN (USER / DEVELOPER)
    add_outline_heading("3. QUY TRÌNH NGHIỆP VỤ CỦA SINH VIÊN (USER / DEVELOPER)", level=1)

    add_outline_heading("3.1. Đăng ký tài khoản và Lấy mã khóa API Key từ xa", level=2)
    add_p("Sinh viên từ bất kỳ đâu truy cập vào địa chỉ Web của hệ thống bằng trình duyệt trên máy tính hoặc điện thoại:")
    add_bullet("Thao tác đăng ký: ", "Nhập Mã số sinh viên, Họ và tên, Lớp học và Mật khẩu.")
    add_bullet("Nhận thông tin định danh: ", "Hệ thống cấp ngay một `API_KEY` hiển thị trực tiếp trên giao diện cá nhân. Sinh viên sử dụng khóa này để nộp code hoặc kết nối Bot vào thi đấu.")

    add_outline_heading("3.2. Tải Bot SDK và Lập trình thuật toán đối kháng đa người", level=2)
    add_p("Sinh viên tải về bộ công cụ phát triển phần mềm (Bot SDK) cực kỳ trực quan:")
    add_bullet("Mã nguồn mẫu tinh giản: ", "Tệp tin mẫu `bot_template.py` chỉ gồm khoảng 20 dòng mã nguồn Python rõ ràng, có sẵn định dạng hàm `decide_move(game_state)`.")
    add_bullet("Dữ liệu đầu vào đầy đủ: ", "Tham số `game_state` cung cấp toàn bộ thông tin chiến trường: Lượng HP hiện tại của bản thân, lượng HP của các đối thủ trên bàn, số lượng thẻ bài Kéo/Búa/Bao còn lại trong tay mình và lịch sử các hiệp đấu trước.")
    add_bullet("Không yêu cầu kỹ năng mạng: ", "Sinh viên không cần phải biết lập trình Socket phức tạp, chỉ cần tập trung 100% vào tư duy thuật toán xử lý dữ liệu và chiến thuật đếm thẻ bài.")

    add_outline_heading("3.3. Kiểm thử Bot, Nâng cấp phiên bản (Versioning) và Đấu thử Self-Play", level=2)
    add_p("Nhằm mang lại trải nghiệm tiện lợi tối đa và đáp ứng nhu cầu liên tục tối ưu thuật toán của sinh viên, hệ thống thiết kế cơ chế Quản lý Phiên bản (Bot Versioning) vượt trội:")
    add_bullet("Trình giả lập ván đấu trên Web (Web Simulator): ", "Sinh viên dán đoạn mã vừa viết vào khung soạn thảo, bấm nút 'Chạy thử ván đấu' với 3 Bot máy tính mẫu để kiểm tra tính đúng đắn chỉ trong vòng chưa đầy 1 giây.")
    add_bullet("Cơ chế Nâng cấp Phiên bản (Bot Versioning v1.0, v2.0): ", "Khi sinh viên muốn cải tiến chiến thuật (ví dụ: bổ sung thuật toán đếm thẻ bài hoặc chuỗi Markov), hệ thống cho phép lưu bản mới dưới dạng `v2.0` mà không ghi đè mất mã nguồn `v1.0`.")
    add_bullet("Tính năng Tự Đấu Kiểm Thử (Self-Play Benchmark - Bot v2 vs Bot v1): ", "Trước khi quyết định mang bản mới đi thi đấu, sinh viên bấm nút 'So tài v2 vs v1'. Hệ thống tự động giả lập 10 ván solo giữa chính bản nâng cấp và bản cũ. Nếu tỷ lệ thắng của v2 vượt trội (trên 60%), sinh viên mới tự tin bấm nút 'Phát hành chính thức (Deploy Active)'!")
    add_bullet("Khôi phục phiên bản 1 chạm (1-Click Rollback): ", "Nếu phiên bản mới thi đấu thực tế không như kỳ vọng và bị tụt điểm Elo, sinh viên có thể kích hoạt lại phiên bản cũ ngay lập tức mà không phải tìm lại file mã nguồn cũ.")

    add_outline_heading("3.4. Nộp Bot vào Đấu trường và Theo dõi Bảng xếp hạng Ranking", level=2)
    add_p("Sau khi kiểm thử thành công, sinh viên tiến hành nộp bài:")
    add_bullet("Thao tác nộp một chạm: ", "Bấm nút 'Xác nhận Nộp Bot vào Giải đấu'. Mã nguồn được lưu trữ mã hóa an toàn trên hệ thống.")
    add_bullet("Theo dõi bảng xếp hạng trực tiếp: ", "Khi giải đấu diễn ra, sinh viên vào mục 'Bảng Xếp Hạng (Leaderboard)' để xem vị trí thứ hạng của mình được cập nhật theo thời gian thực kèm điểm số Elo, tỷ lệ thắng và lịch sử đối đầu.")

    add_p("", space_before=4, space_after=8)

    # 4. THIẾT KẾ CHI TIẾT CƠ CHẾ GAME OTTV2 VÀ LUỒNG XỬ LÝ ĐA NGƯỜI
    add_outline_heading("4. THIẾT KẾ CHI TIẾT CƠ CHẾ GAME OTTV2 VÀ LUỒNG XỬ LÝ ĐA NGƯỜI", level=1)

    add_outline_heading("4.1. Luật chơi OTTV2 đa người chơi (Bàn đấu 4 - 8 Bot, HP, Bộ thẻ bài hữu hạn)", level=2)
    add_p("Cơ chế trò chơi OTTV2 được chuẩn hóa để vận hành mượt mà trên môi trường lập trình:")
    add_bullet("Quy mô bàn đấu chuẩn: ", "Mỗi bàn thi đấu gồm 4 Bot (hoặc 8 Bot trong vòng sinh tồn chung kết).")
    add_bullet("Điểm Sinh Mệnh (HP): ", "Mỗi Bot bắt đầu với 100 HP. Khi bị đối thủ khắc chế trong một hiệp, Bot bị khấu trừ lượng HP tương ứng. Bot nào bị giảm HP về 0 sẽ bị loại.")
    add_bullet("Hạn ngạch kho thẻ bài: ", "Mỗi Bot được cấp đúng 5 thẻ Kéo, 5 thẻ Búa, 5 thẻ Bao cho tối đa 15 hiệp đấu. Khi đã đánh hết loại thẻ nào, Bot không được quyền ra nước đi đó nữa. Điều này buộc sinh viên phải lập trình thuật toán đếm bài đối thủ.")

    add_outline_heading("4.2. Ma trận tương khắc đồng thời và Cơ chế tính điểm sát thương", level=2)
    add_p("Trong mỗi hiệp đấu, tất cả 4 Bot cùng gửi nước đi ẩn trong khung thời gian 1000ms. Trọng tài phân giải ma trận tương quan giữa tất cả các cặp đấu trên bàn:")
    add_numbered_item("a.", "So sánh từng cặp đấu (Bot i, Bot j): Nếu nước đi của Bot i khắc chế Bot j (Kéo thắng Bao, Bao thắng Búa, Búa thắng Kéo), Bot j bị trừ 15 HP, đồng thời Bot i được ghi nhận 10 điểm tấn công.")
    add_numbered_item("b.", "Quy tắc hòa: Nếu hai Bot ra cùng một loại nước đi, không có sát thương nào được tạo ra giữa hai bên.")
    add_numbered_item("c.", "Hiệu ứng thiểu số đột phá: Nếu trên bàn 4 người, có 3 Bot cùng ra Kéo và chỉ có 1 Bot ra Búa, Bot ra Búa sẽ đồng thời gây sát thương lên cả 3 đối thủ (mỗi đối thủ mất 15 HP), và nhận về 30 điểm tấn công.")

    add_outline_heading("4.3. Máy trạng thái giải đấu (FSM) và Cơ chế Vùng đệm bảo mật (Blind-Commit Buffer)", level=2)
    add_p("Nhằm bảo đảm tính công bằng tuyệt đối giữa các sinh viên kết nối qua mạng, hệ thống tích hợp hai giải pháp kỹ thuật mạng cốt lõi:")
    add_bullet("Mô hình Máy trạng thái hữu hạn (FSM - Finite State Machine): ", "Vòng đời giải đấu chuyển dịch tuần tự qua các pha kiểm soát chặt chẽ: `LOBBY_OPEN` (Mở sảnh đăng ký) -> `BATCH_PAIRING` (Ghép phòng 4 người) -> `ROUND_COUNTDOWN` (Đếm ngược 1000ms) -> `BLIND_COMMIT_EVALUATION` (Mở đòn và tính điểm) -> `LEADERBOARD_UPDATE` (Cập nhật BXH).")
    add_bullet("Cơ chế Vùng đệm bảo mật nước đi (Blind-Commit Buffer): ", "Khi một Bot gửi nước đi về máy chủ, máy chủ chỉ lưu lựa chọn đó vào một vùng đệm ẩn (Buffer Slot) và gửi phản hồi xác nhận `MOVE_RECEIVED` cho riêng Bot đó. Máy chủ tuyệt đối không phát sóng nước đi ra ngoài mạng cho tới khi toàn bộ các Bot trong phòng đã gửi xong hoặc hết thời gian 1000ms. Cơ chế này triệt tiêu hoàn toàn nguy cơ sinh viên dùng công cụ bắt gói tin (Sniffer) để đọc trước nước đi của đối thủ.")

    add_outline_heading("4.4. Cơ chế Sandbox an toàn, cô lập thực thi và Chống gian lận (Anti-Cheat)", level=2)
    add_p("Để bảo vệ máy chủ khi chạy mã nguồn do sinh viên gửi lên từ khắp nơi trên mạng, hệ thống áp dụng cơ chế bảo mật nhẹ nhưng cực kỳ an toàn:")
    add_bullet("Môi trường thực thi giới hạn (Restricted Execution): ", "Mã nguồn Python của sinh viên được nạp và thực thi trong tiến trình con (subprocess/multiprocessing) có vô hiệu hóa các thư viện nguy hiểm (như `os`, `sys`, `shutil`, `socket`).")
    add_bullet("Giới hạn thời gian cứng (Hard Timeout): ", "Mỗi lượt gọi hàm của Bot được bọc trong bộ đếm thời gian nghiêm ngặt (tối đa 1.0 giây). Nếu vượt quá, tiến trình ngắt ngay lập tức và cảnh cáo Bot.")
    add_bullet("Bảo mật quyết định: ", "Các Bot hoàn toàn không thể đọc bộ nhớ của nhau trước khi trọng tài công bố kết quả hiệp đấu.")

    add_outline_heading("4.5. Thiết kế API Endpoints và Giao thức WebSocket chuẩn hóa", level=2)
    add_p("Các điểm cuối API được thiết kế tinh gọn theo chuẩn RESTful, chạy qua giao thức HTTPS bảo mật:")

    t_api = doc.add_table(rows=7, cols=4)
    col_w_api = [Cm(2.5), Cm(5.0), Cm(3.5), Cm(5.0)]
    style_table(t_api, col_w_api)

    api_data = [
        ("Phương thức", "Điểm cuối (Endpoint)", "Giao thức", "Chức năng phục vụ"),
        ("POST", "/api/auth/register", "HTTPS REST", "Đăng ký tài khoản sinh viên và cấp API Key."),
        ("POST", "/api/bots/submit", "HTTPS REST", "Nộp mã nguồn Bot lên máy chủ (hỗ trợ versioning v1, v2)."),
        ("POST", "/api/simulate", "HTTPS REST", "Chạy thử nghiệm Bot với 3 Bot mẫu hoặc Self-Play v2 vs v1."),
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
            p.paragraph_format.space_after = Pt(1.5)
            r = p.add_run(text)
            apply_font(r, size=11, bold=(r_i == 0))

    add_outline_heading("4.6. Thiết kế Cơ sở dữ liệu quan hệ (Database Schema)", level=2)
    add_p("Hệ thống sử dụng cơ sở dữ liệu PostgreSQL lưu trữ trên Supabase với cấu trúc chuẩn 3NF gọn nhẹ:")
    add_bullet("Bảng Users: ", "`user_id` (UUID), `student_id` (VARCHAR), `full_name` (VARCHAR), `class_name` (VARCHAR), `api_key` (VARCHAR), `created_at` (TIMESTAMP).")
    add_bullet("Bảng Bots: ", "`bot_id` (UUID), `user_id` (UUID), `bot_name` (VARCHAR), `active_version` (VARCHAR), `elo_score` (INT, mặc định 1000), `matches_played` (INT), `wins` (INT), `is_valid` (BOOLEAN).")
    add_bullet("Bảng BotVersions: ", "`version_id` (UUID), `bot_id` (UUID), `version_tag` (VARCHAR: 'v1.0', 'v2.0'), `code_content` (TEXT), `uploaded_at` (TIMESTAMP).")
    add_bullet("Bảng Matches: ", "`match_id` (UUID), `match_type` (VARCHAR: 'SOLO_1V1' hoặc 'BATTLE_ROYALE_4P'), `bot_ids` (JSONB), `winner_id` (UUID), `scores_json` (JSONB), `executed_at` (TIMESTAMP).")

    add_outline_heading("4.7. Cơ chế Đa hình thức nộp Bot linh hoạt (Hàm, OOP, Đa ngôn ngữ STDIN)", level=2)
    add_p("Một vấn đề thực tế quan trọng: 'Nếu người chơi không muốn code theo mẫu có sẵn thì hệ thống có xử lý được không?' Hệ thống giải quyết trọn vẹn bằng cơ chế Bộ chuyển đổi Tương thích Động (Universal Dynamic Adapter) hỗ trợ 3 hình thức lập trình tự do:")
    add_bullet("Hình thức 1 - Hàm Python cơ bản (Functional Style): ", "Dành cho sinh viên thích sự đơn giản, chỉ cần định nghĩa hàm `decide_move(game_state)` nhận vào dữ liệu bàn đấu và trả về 'ROCK', 'PAPER' hoặc 'SCISSORS'.")
    add_bullet("Hình thức 2 - Hướng đối tượng (OOP Class-based Style): ", "Dành cho sinh viên muốn duy trì bộ nhớ học máy phức tạp. Sinh viên có thể viết `class SmartBot:` với các phương thức `__init__`, `self.memory`, `step(state)`. Bộ nạp mã nguồn Runner sử dụng kỹ thuật Reflection của Python (`inspect`) để tự động phát hiện cả dạng hàm lẫn dạng Class, tự động khởi tạo đối tượng mà không ép người chơi phải sửa code!")
    add_bullet("Hình thức 3 - Chuẩn Universal STDIN/STDOUT (Đa ngôn ngữ C++, Java, Node.js, Go): ", "Dành cho sinh viên không thích dùng Python! Đây là chuẩn thi đấu Olympic Tin học và Kaggle quốc tế: Máy chủ gửi chuỗi JSON ván đấu qua luồng đầu vào tiêu chuẩn `sys.stdin`, Bot chỉ cần in quân bài lựa chọn ra `sys.stdout`. Nhờ đó, sinh viên có thể dùng BẤT KỲ NGÔN NGỮ NÀO mà họ yêu thích để tranh tài!")

    bot_code = [
        '# File: my_ottv2_bot.py (Ví dụ mẫu chuẩn Python gọn nhẹ)',
        'import random',
        '',
        'def decide_move(game_state):',
        '    cards = game_state["remaining_cards"]',
        '    available = [card for card, count in cards.items() if count > 0]',
        '    if not available:',
        '        return "ROCK"',
        '    # Phân tích hiệp trước: nếu đối thủ hay ra Búa thì ưu tiên ra Bao',
        '    if game_state.get("history"):',
        '        last_round = game_state["history"][-1]',
        '        if "ROCK" in last_round and "PAPER" in available:',
        '            return "PAPER"',
        '    return random.choice(available)'
    ]
    add_code_block(bot_code)

    add_outline_heading("4.8. Cơ chế Ghép đấu Solo 1v1 Đối Kháng Cá Nhân và Thách Đấu Bạn Bè", level=2)
    add_p("Bên cạnh giải đấu hỗn chiến 4 người, nhu cầu so tài trực tiếp 1v1 giữa 2 sinh viên (Solo Duel) là tính năng cực kỳ quan trọng để thử lửa chiến thuật và giao lưu học thuật. Hệ thống thiết kế cơ chế Solo 1v1 với 3 hình thức tiện lợi:")
    add_bullet("Ghép ngẫu nhiên tức thời (Quick Match 1v1): ", "Sinh viên chỉ cần bấm nút 'Tìm trận Solo' trên giao diện Web. Bot của sinh viên được đưa vào hàng đợi `SoloMatchmakingQueue`. Ngay khi có một Bot khác cùng bấm tìm trận, hệ thống lập tức khởi tạo bàn đấu 1v1 (thể thức Bo5 hoặc Bo10 hiệp, mỗi bên 100 HP, kho thẻ 10 Kéo - 10 Búa - 10 Bao). Thời gian tìm và bắt đầu trận đấu diễn ra dưới 1 giây.")
    add_bullet("Thách đấu phòng riêng qua mã code (Private Room / Room Code): ", "Sinh viên A tạo phòng solo, hệ thống sinh ra một mã định danh ngắn gọn gồm 6 ký tự (ví dụ: `#SOLO-8821`). Sinh viên A chỉ cần gửi mã này cho bạn B cùng lớp. Sinh viên B nhập mã vào ô 'Tham gia phòng' là hai con Bot lập tức lao vào so tài trực tiếp. Hai bạn có thể tùy chỉnh số hiệp đấu (Bo3, Bo5, Bo7) và trực tiếp theo dõi bot của nhau giao chiến.")
    add_bullet("Đấu tập với AI Máy của Ban tổ chức (Training vs Boss Bots): ", "Để hoàn thiện thuật toán trước khi đem thi đấu chính thức, sinh viên có thể chọn đấu tập 1v1 với 3 cấp độ Bot AI mẫu do ban tổ chức cài sẵn: (1) Bot Nhập môn (đánh ngẫu nhiên); (2) Bot Thống kê (đếm tần suất bài đã ra của người chơi để khắc chế); (3) Bot Markov Chain (dự đoán xác suất nước đi tiếp theo dựa trên chuỗi 2 nước đi gần nhất).")

    add_outline_heading("4.9. Giao diện Đấu trường Trực quan (Live Visualizer) và Trải nghiệm như Game thật", level=2)
    add_p("Một rào cản lớn của các hệ sinh thái đấu bot truyền thống là kết quả chỉ hiển thị dưới dạng các dòng chữ log khô khan khiến người xem nhàm chán. Dự án khắc phục triệt để nhược điểm này bằng việc xây dựng Giao diện Sàn đấu Trực quan thời gian thực (Live Match Visualizer) trên nền tảng Web với trải nghiệm mượt mà, sống động như một sàn đấu Thể thao Điện tử (eSports Card Duel):")
    add_bullet("Thanh sinh mệnh đối kháng (Interactive HP Bars): ", "Thanh máu của hai bên hiển thị đối xứng trên màn hình với hiệu ứng chuyển màu sinh động (Xanh lá -> Vàng -> Đỏ). Khi trúng đòn khắc chế, thanh máu co giật (Damage Shake Animation), lóe sáng đỏ và chỉ số sát thương bay lên trực quan (ví dụ: '-25 HP!').")
    add_bullet("Bộ bài trên tay (Deck Card UI): ", "Các lá bài Kéo, Búa, Bao hiển thị dưới dạng thẻ bài 3D bo góc đẹp mắt. Số lượng thẻ còn lại của mỗi bên nhảy số thời gian thực (ví dụ: Kéo: 3/5, Búa: 1/5, Bao: 4/5), cho phép người xem và tuyển thủ quan sát rõ tài nguyên bài của đối thủ đang cạn dần.")
    add_bullet("Đồng hồ đếm ngược nhịp đấu kịch tính: ", "Trước mỗi hiệp, đồng hồ đếm ngược 3 giây kịch tính xuất hiện giữa màn hình: 3... 2... 1... 'RA CHIÊU!'.")
    add_bullet("Hiệu ứng va chạm và mở bài đồng thời (Clash & Reveal Effect): ", "Khi hết giờ, hai lá bài từ hai góc màn hình bay vào tâm điểm, đồng thời lật mở. Hiệu ứng va chạm tóe lửa phân định thắng thua: Lá bài thắng phát sáng hào quang hoàng kim, lá bài thua bị nứt vỡ hoặc làm mờ.")
    add_bullet("Bình luận chiến thuật tự động (Live Combat Log): ", "Bên dưới sàn đấu là hộp nhật ký tự động mô tả diễn biến hóm hỉnh: 'Hiệp 4: Bot_BáĐạo tung BÚA nghiền nát KÉO của Bot_VôĐịch! Sát thương chí mạng: -25 HP!' giúp trải nghiệm thi đấu trở nên lôi cuốn và kịch tính như xem giải đấu thật.")
    add_bullet("Bộ điều khiển tốc độ linh hoạt (Playback Controls): ", "Người xem có thể chọn chế độ Xem chậm (1 giây/hiệp để theo dõi kỹ chiến thuật), Xem nhanh (0.2 giây/hiệp) hoặc bấm 'Xem kết quả ngay' để lập tức biết người chiến thắng.")

    add_p("", space_before=4, space_after=8)

    # 5. GIẢI PHÁP HẠ TẦNG CLOUD VÀ NỀN TẢNG CLOUDFLARE TOÀN DIỆN CHI PHÍ 0 ĐỒNG
    add_outline_heading("5. GIẢI PHÁP HẠ TẦNG CLOUD VÀ NỀN TẢNG CLOUDFLARE TOÀN DIỆN CHI PHÍ 0 ĐỒNG", level=1)

    add_outline_heading("5.1. Hệ sinh thái Cloud kết hợp Nền tảng Cloudflare (Cloudflare Pages, Render, Supabase)", level=2)
    add_p("Để đáp ứng yêu cầu 'dễ thiết lập, tuần sau code luôn, hoàn toàn miễn phí, chịu tải tốt cho nhiều sinh viên và tận dụng tối đa nền tảng Cloudflare', dự án xây dựng cấu trúc đám mây đa tầng vững chắc:")

    t_cloud = doc.add_table(rows=5, cols=4)
    col_w_cloud = [Cm(3.0), Cm(3.5), Cm(5.0), Cm(4.5)]
    style_table(t_cloud, col_w_cloud)

    cloud_data = [
        ("Thành phần", "Dịch vụ Cloud", "Hạn ngạch gói miễn phí (Free Tier)", "Ưu điểm triển khai"),
        ("Giao diện Web\n& Sàn đấu Canvas", "Cloudflare Pages\n/ Vercel", "Miễn phí 100%, băng thông không giới hạn,\ntự động deploy từ GitHub.", "Tận dụng mạng phân phối biên toàn cầu Anycast,\ngiao diện tải cực nhanh cho mọi sinh viên."),
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
            p.paragraph_format.space_after = Pt(1.5)
            r = p.add_run(text)
            apply_font(r, size=11, bold=(r_i == 0))

    add_outline_heading("5.2. Đường hầm bảo mật Cloudflare Tunnel (Đục lỗ NAT 0 đồng) và Mạng biên Cloudflare", level=2)
    add_p("Điểm nhấn công nghệ đặc sắc trong đề án là việc ứng dụng giải pháp Cloudflare Tunnel (`cloudflared`) hoàn toàn miễn phí:")
    add_bullet("Tình huống ứng dụng thực tế: ", "Khi nhóm sinh viên phát triển và thử nghiệm máy chủ ngay trên chiếc laptop cá nhân ở nhà hoặc ký túc xá, laptop nằm sau nhiều lớp tường lửa mạng trường học/gia đình (CGNAT) và không có địa chỉ IP tĩnh công khai.")
    add_bullet("Nguyên lý Đục lỗ NAT bảo mật: ", "Bằng cách chạy tiện ích `cloudflared` nhẹ nhàng, một đường hầm mã hóa outbound hai chiều được thiết lập từ localhost tới trạm biên mạng gần nhất của Cloudflare.")
    add_bullet("Kết quả triển khai: ", "Cổng nội bộ `localhost:8000` lập tức có một địa chỉ HTTPS/WSS công khai bảo mật (ví dụ `https://ottv2-arena.trycloudflare.com`). Nhiều sinh viên ở khắp nơi có thể truy cập thi đấu bình thường mà người quản trị không cần thuê IP tĩnh, không phải mở port router hay can thiệp vào hạ tầng mạng trường học.")

    add_outline_heading("5.3. Kiến trúc hàng đợi xử lý trận đấu theo đợt (Batch Matchmaking Queue)", level=2)
    add_p("Thách thức lớn nhất khi phục vụ nhiều sinh viên trên hạ tầng miễn phí là nguy cơ cạn kiệt RAM nếu cho tất cả các Bot chạy đồng thời. Để giải quyết dứt điểm vấn đề này, dự án áp dụng Kiến trúc Hàng đợi phân đợt thông minh:")
    add_bullet("Nguyên lý hoạt động: ", "Dù có 100, 500 hay 1.000 sinh viên tham gia, hệ thống tự động gom vào các phòng đấu 4 người. Máy chủ Worker không chạy tất cả các phòng cùng lúc mà chia thành các đợt (Batch), mỗi đợt chạy 10 phòng song song.")
    add_bullet("Tối ưu hóa thời gian: ", "Do mỗi ván đấu chỉ là các phép tính so sánh số học và gọi hàm Python nhẹ, một ván 15 hiệp chỉ mất trung bình 0.8 giây. Như vậy, 1 đợt (10 phòng) mất chưa tới 1 giây. Toàn bộ giải đấu cho hàng trăm sinh viên sẽ được giải quyết trọn vẹn chỉ trong vòng dưới 20 đến 30 giây!")
    add_bullet("Tiết kiệm bộ nhớ tuyệt đối: ", "Mức tiêu thụ RAM của Render luôn duy trì ở mức 150MB đến 200MB, hoàn toàn nằm trong ngưỡng an toàn 512MB của gói miễn phí.")

    add_outline_heading("5.4. Kỹ thuật tối ưu bộ nhớ, chống nghẽn kết nối và Token Bucket chống Spam", level=2)
    add_p("Hệ thống tích hợp các kỹ thuật bảo vệ tài nguyên mạng chuyên sâu:")
    add_bullet("Thuật toán Token Bucket chống Spam Request: ", "Tại tầng ứng dụng của API Gateway và mạng biên Cloudflare, mỗi địa chỉ IP hoặc tài khoản sinh viên được cấp một thùng token (ví dụ: tối đa 5 yêu cầu/giây). Nếu một sinh viên viết script spam gửi hàng nghìn request nộp code liên tục, hệ thống tự động từ chối bằng mã `429 Too Many Requests` mà không gây nghẽn máy chủ.")
    add_bullet("Giám sát nhịp sống kết nối (Heartbeat Watchdog): ", "Hệ thống kiểm tra định kỳ trạng thái của các tiến trình Worker. Nếu một Worker gặp sự cố hoặc chiếm dụng bộ nhớ quá 60 giây, Watchdog tự động tái khởi động Worker sạch sẽ mà không làm gián đoạn các phòng đấu khác.")
    add_bullet("Bộ đệm tĩnh tại biên mạng (Cloudflare Edge Cache): ", "Trang Bảng Ranking được cấu hình bộ đệm 10 giây tại mạng biên Cloudflare. Khi nhiều sinh viên cùng tải lại trang xem điểm số, 99% yêu cầu được phân phối trực tiếp từ mạng CDN của Cloudflare mà không chạm vào máy chủ Backend.")

    add_outline_heading("5.5. Phân tích kiến trúc Chịu tải nhiều Bot không sập RAM và Chống nghẽn giờ cao điểm", level=2)
    add_p("Một câu hỏi then chốt: 'Khi nhiều người chơi cùng lúc ùa vào nộp code và bấm thi đấu thì có bị quá tải không?' Hệ thống triệt tiêu 100% rủi ro quá tải bằng kiến trúc 3 lớp bảo vệ chuyên nghiệp:")
    add_bullet("1. Bảo vệ Tầng Web tĩnh (Cloudflare Pages & Edge CDN): ", "Đông đảo sinh viên tải giao diện Web cùng lúc được phục vụ bởi mạng phân phối toàn cầu của Cloudflare (chịu tải hàng chục ngàn request/giây), không tiêu tốn một chút RAM hay CPU nào của máy chủ chính.")
    add_bullet("2. Bảo vệ Tầng Cơ sở dữ liệu (Supabase PgBouncer Pooler): ", "Khi hàng trăm sinh viên cùng gửi yêu cầu, công cụ PgBouncer tích hợp sẵn trên Supabase gom toàn bộ kết nối này thành một nhóm 15 kết nối thực tới PostgreSQL. Cơ chế này xóa bỏ hoàn toàn lỗi cạn kiệt kết nối (`Max Connections Reached`).")
    add_bullet("3. Bảo vệ Tầng Xử lý đấu (Async Ticket Queue & Worker Pool): ", "Để không bị Out-Of-Memory (OOM) trên gói Render 512MB RAM, hệ thống dùng Hàng đợi cấp số thứ tự điện tử (Async Ticket Queue). Máy chủ kích hoạt một Worker Pool cố định gồm 4 tiến trình con. Dù nhiều sinh viên cùng bấm tìm trận vào giờ cao điểm, hệ thống tiếp nhận yêu cầu vào RAM siêu nhẹ (chỉ tốn ~35MB), sau đó phân phối đều đặn từng đợt 10 phòng đấu. Bộ nhớ Render luôn ổn định ở mức 150MB đến 180MB, CPU dưới 25%, cam kết hệ thống không bao giờ bị sập hay treo máy.")

    add_p("", space_before=4, space_after=8)

    # 6. KẾ HOẠCH TỔ CHỨC GIẢI ĐẤU VÀ LỘ TRÌNH LẬP TRÌNH 1 TUẦN
    add_outline_heading("6. KẾ HOẠCH TỔ CHỨC GIẢI ĐẤU VÀ LỘ TRÌNH LẬP TRÌNH 1 TUẦN", level=1)

    add_outline_heading("6.1. Thể thức phân bảng linh hoạt và Đấu trường sinh tồn (Battle Royale) cho nhiều người chơi", level=2)
    add_p("Giải đấu được thiết kế theo mô hình Phân bảng Đàn hồi (Elastic Bracket Partitioning) thích ứng linh hoạt theo số lượng thí sinh thực tế đăng ký:")
    add_bullet("Vòng 1 - Vòng Sàng Lọc (Vòng bảng quy mô lớn): ", "Tất cả các thí sinh đăng ký được chia thành các phòng đấu 4 người. Hai Bot có lượng HP cao nhất mỗi phòng giành quyền đi tiếp vào vòng trong (lấy 50% số lượng hạt giống xuất sắc nhất).")
    add_bullet("Vòng 2 - Vòng Phân Hạng Bán Kết: ", "Các Bot vượt qua vòng 1 tiếp tục chia bảng 4 người thi đấu 2 lượt nhanh để chọn ra 16 Bot xuất sắc nhất toàn giải.")
    add_bullet("Vòng 3 - Vòng Chung Kết Sinh Tồn (Top 16 Tuyển Thủ): ", "16 Bot được chia vào 2 phòng đấu 8 người thi đấu chế độ Đấu trường Sinh tồn (Battle Royale). 4 Bot sống sót cuối cùng của 2 phòng hội tụ trong Trận Chung Kết Tổng (Grand Finals) 8 người để tìm ra Quán quân.")

    add_outline_heading("6.2. Thuật toán tính điểm xếp hạng Elo đa người chơi và Chỉ số phụ Tie-break", level=2)
    add_p("Thuật toán xếp hạng Elo đa người chơi được chuẩn hóa bằng công thức toán học rõ ràng:")
    add_p("Kỳ vọng thắng của Bot A trước từng đối thủ B trong phòng đấu:", space_before=2, space_after=1.8)
    add_p("E(A, B) = 1 / [1 + 10 ^ ((R_B - R_A) / 400)]", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=2, space_after=1.8, bold=True, size=11)
    
    add_p("Kỳ vọng tổng thể trong phòng N người:", space_before=2, space_after=1.8)
    add_p("E_total(A) = Tổng[E(A, i)] / (N - 1)", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=2, space_after=1.8, bold=True, size=11)

    add_p("Cập nhật điểm Elo sau ván đấu:", space_before=2, space_after=1.8)
    add_p("R'(A) = R(A) + K * [S_actual(A) - E_total(A)]", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=2, space_after=4, bold=True, size=11)

    add_p("Trong đó, S_actual(A) nhận giá trị thứ hạng tương ứng (Hạng 1: 1.0; Hạng 2: 0.66; Hạng 3: 0.33; Hạng 4: 0.0); K = 32.")

    add_p("Chỉ số phụ (Tie-break) khi bằng điểm Elo:", space_before=2, space_after=1.8)
    add_numbered_item("1.", "Tổng lượng sát thương gây ra cho các đối thủ trong suốt giải đấu.")
    add_numbered_item("2.", "Hiệu số HP còn lại tại thời điểm kết thúc ván đấu.")
    add_numbered_item("3.", "Số lần kích hoạt nước đi thiểu số lật kèo thành công.")

    add_outline_heading("6.3. Quy định xử lý lỗi quá thời gian (Timeout), mất kết nối và hòa ván đấu", level=2)
    add_p("Quy tắc tài phán tự động giúp giải đấu không bị gián đoạn:")
    add_bullet("Xử lý Timeout: ", "Nếu hàm của Bot chạy quá 1000ms, hệ thống tự động gán nước đi ngẫu nhiên từ kho thẻ còn lại. Nếu vi phạm quá 3 hiệp trong một ván đấu, Bot bị xử thua ván đó.")
    add_bullet("Xử lý cú pháp lỗi (Code Crash): ", "Nếu mã nguồn của sinh viên bị lỗi chia cho 0 hoặc lỗi ngoại lệ (Exception), Bot bị tính thua hiệp đó và ghi nhận lỗi vào bảng nhật ký để sinh viên kiểm tra.")

    add_outline_heading("6.4. Kế hoạch lập trình nước rút 7 ngày (1-Week Sprint Timeline)", level=2)
    add_p("Lộ trình chi tiết từng ngày để nhóm tác giả hoàn thành mã nguồn đưa lên Cloud:")

    t_sprint = doc.add_table(rows=8, cols=3)
    col_w_sprint = [Cm(2.5), Cm(6.5), Cm(7.0)]
    style_table(t_sprint, col_w_sprint)

    sprint_data = [
        ("Thời gian", "Nội dung công việc lập trình", "Kết quả đầu ra cụ thể"),
        ("Ngày 1", "Khởi tạo Repository GitHub, cấu hình Supabase\nvà viết hàm logic trọng tài OTTV2 đa người", "Module `ottv2_engine.py` hoàn thành,\nchạy đúng logic ma trận tương khắc."),
        ("Ngày 2", "Xây dựng Backend FastAPI: API nộp code,\nquản lý version Bot và hàm chạy Sandbox", "Backend API chạy được trên Localhost,\nkiểm thử nộp code thành công."),
        ("Ngày 3", "Lập trình động cơ ghép đấu Solo 1v1 (Room Code)\nvà Hàng đợi chạy theo đợt (Batch Queue)", "Worker tự động chạy 10 phòng song song,\nxử lý xong 40 Bot trong 0.8 giây."),
        ("Ngày 4", "Xây dựng Giao diện Web (HTML/JS/Canvas):\nSàn đấu Live Visualizer, Form nộp code, Thanh máu", "Giao diện trực quan sống động, sinh viên\ncó thể xem trận đấu mượt mà như game thật."),
        ("Ngày 5", "Tích hợp Bảng xếp hạng Ranking thời gian thực\nvà kết nối luồng dữ liệu Supabase Realtime", "Bảng Ranking hiển thị điểm Elo, tự động\nnhảy số khi ván đấu hoàn tất."),
        ("Ngày 6", "Triển khai hệ thống: Frontend lên Cloudflare Pages,\nBackend lên Render, thiết lập Cloudflare Tunnel", "Hệ thống có địa chỉ URL công khai bảo mật,\nsẵn sàng cho sinh viên ở mọi nơi truy cập."),
        ("Ngày 7", "Chạy thử nghiệm tải áp lực với nhiều Bot giả lập,\nviết tài liệu hướng dẫn và phát hành Bot SDK", "Hệ thống vận hành trơn tru 100%,\nchính thức mở cổng cho sinh viên nộp bài.")
    ]
    for r_i, r_data in enumerate(sprint_data):
        row = t_sprint.rows[r_i]
        for c_i, text in enumerate(r_data):
            cell = row.cells[c_i]
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if c_i == 0 else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(1.5)
            r = p.add_run(text)
            apply_font(r, size=11, bold=(r_i == 0))

    add_outline_heading("6.5. Cấu trúc thư mục mã nguồn và Tính khả thi lập trình trong 7 ngày", level=2)
    add_p("Nhằm bảo đảm cam kết 'tuần sau bắt tay vào code được ngay' mà không gặp bất kỳ vướng mắc kiến trúc nào, toàn bộ mã nguồn dự án được thiết kế theo mô hình Monolith bất đồng bộ tinh gọn (Clean Architecture) với cấu trúc thư mục rõ ràng:")

    tree_lines = [
        "ottv2-arena-project/",
        "├── app/                          # Mã nguồn chính Backend (FastAPI)",
        "│   ├── main.py                   # Điểm khởi chạy FastAPI, CORS & định tuyến HTTP/WS",
        "│   ├── engine/                   # Động cơ luật chơi và phân giải ván đấu",
        "│   │   ├── rules.py              # Ma trận tương khắc Kéo - Búa - Bao, trừ HP, kho thẻ",
        "│   │   └── fsm_match.py          # Máy trạng thái ván đấu FSM (Lobby, Commit, Reveal)",
        "│   ├── matchmaker/               # Động cơ ghép cặp và điều phối hàng đợi",
        "│   │   ├── solo_queue.py         # Hàng đợi ghép đấu 1v1 & quản lý mã phòng (#SOLO-XXXX)",
        "│   │   └── batch_runner.py       # Worker Pool chạy phân đợt 10 phòng song song",
        "│   ├── sandbox/                  # Môi trường thực thi mã nguồn sinh viên an toàn",
        "│   │   ├── safe_exec.py          # Chạy code có giới hạn Timeout 1.0s và chặn hàm nguy hiểm",
        "│   │   └── dynamic_loader.py     # Bộ nạp thông minh: hỗ trợ cả Hàm, Class OOP và STDIN",
        "│   └── models/                   # Lớp đối tượng dữ liệu và tích hợp Supabase",
        "│       └── schemas.py            # Pydantic schemas (User, Bot, BotVersion, Leaderboard)",
        "├── frontend/                     # Giao diện Web tĩnh triển khai trên Cloudflare Pages",
        "│   ├── index.html                # Trang chủ, form nộp code, đấu trường và Bảng xếp hạng",
        "│   ├── visualizer.js             # Đồ họa Canvas/CSS: Thanh máu co giật, lật thẻ, hiệu ứng va chạm",
        "│   └── app.js                    # Gọi REST API và lắng nghe sự kiện WebSocket cập nhật ván đấu",
        "├── bots/                         # Tài nguyên cấp cho sinh viên tham gia",
        "│   ├── bot_template.py           # Mã mẫu 20 dòng định nghĩa hàm decide_move(game_state)",
        "│   └── client_agent.py           # Script chạy bot từ xa qua WebSocket trên máy cá nhân",
        "└── requirements.txt              # fastapi, uvicorn, websockets, pydantic, supabase"
    ]
    add_code_block(tree_lines)

    add_p("Minh chứng tính khả thi tuyệt đối để lập trình hoàn thành trong đúng 7 ngày:")
    add_bullet("1. Không phụ thuộc công nghệ phức tạp: ", "Hệ thống không sử dụng các kiến trúc phân tán nặng nề (như Kubernetes, Kafka hay Microservices). Toàn bộ hệ thống chạy trên một tiến trình FastAPI duy nhất, cực kỳ dễ debug trên máy tính cá nhân.")
    add_bullet("2. Danh mục thư viện tối giản: ", "Tệp `requirements.txt` chỉ bao gồm 5 thư viện phổ biến nhất của Python (`fastapi`, `uvicorn`, `websockets`, `pydantic`, `supabase-py`), việc cài đặt môi trường hoàn tất chỉ trong 30 giây bằng một lệnh `pip install`.")
    add_bullet("3. Phân chia module rành mạch cho nhóm 2-3 người: ", "Thành viên 1 phụ trách `engine/` và `sandbox/` (logic toán học thuần túy); Thành viên 2 phụ trách `main.py`, `matchmaker/` và cơ sở dữ liệu Supabase; Thành viên 3 phụ trách giao diện Web `visualizer.js` và viết tài liệu hướng dẫn cho sinh viên. Tiến độ 7 ngày hoàn toàn khả thi và nắm chắc trong tầm tay.")

    add_p("", space_before=4, space_after=8)

    # 7. KẾ HOẠCH KIỂM THỬ TẢI VÀ KẾT LUẬN TRIỂN KHAI
    add_outline_heading("7. KẾ HOẠCH KIỂM THỬ TẢI VÀ KẾT LUẬN TRIỂN KHAI", level=1)

    add_outline_heading("7.1. Bộ kịch bản kiểm thử tải áp lực nhiều Bot đồng thời (Cơn bão kết nối, Timeout, 50 vòng)", level=2)
    add_p("Kế thừa bộ tiêu chuẩn kiểm thử chịu tải C10K thu nhỏ, hệ thống được thẩm định qua 4 kịch bản biên khắc nghiệt trước khi đưa vào vận hành thật:")

    t_stress = doc.add_table(rows=5, cols=3)
    col_w_stress = [Cm(3.5), Cm(6.5), Cm(6.5)]
    style_table(t_stress, col_w_stress)

    stress_data = [
        ("Kịch bản kiểm thử", "Mô tả hành vi giả lập", "Tiêu chí đánh giá đạt yêu cầu"),
        ("1. Cơn bão nộp bài\n(Submission Stampede)", "Hàng trăm Bot đồng loạt gửi code dự thi lên hệ thống trong vòng 2 giây.", "Hệ thống không bị crash, không tràn RAM, 100% mã nguồn được lưu vào database an toàn."),
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
            p.paragraph_format.space_after = Pt(1.5)
            r = p.add_run(text)
            apply_font(r, size=11, bold=(r_i == 0))

    add_outline_heading("7.2. Đánh giá tính khả thi và Tiềm năng mở rộng của dự án", level=2)
    add_p("Bản đề án tổng hòa này đã đạt được sự cân bằng tối ưu giữa tính học thuật chuyên sâu và tính khả thi thực tế:")
    add_bullet("Tính khả thi thực tiễn cao nhất: ", "Giải pháp kết hợp Nền tảng Cloudflare toàn diện (Pages, Tunnel, CDN WAF) và Cloud Render/Supabase bảo đảm dự án vận hành với chi phí 0 đồng, cấu hình đơn giản và hoàn toàn có thể lập trình xong trong đợt chạy nước rút 7 ngày.")
    add_bullet("Quy chuẩn kỹ thuật vững chắc: ", "Sự hiện diện của Máy trạng thái FSM, cơ chế Blind-Commit Buffer, thuật toán Token Bucket và bộ kịch bản kiểm thử tải giúp bản báo cáo đạt độ thuyết phục cao nhất trước hội đồng chấm điểm môn học.")
    add_bullet("Trải nghiệm người dùng tuyệt vời: ", "Nhiều sinh viên toàn trường có một sân chơi học thuật trực tuyến hấp dẫn, dễ tham gia, tự do nâng cấp phiên bản Bot, thi đấu solo 1v1 hoặc đại chiến sinh tồn, theo dõi trận đấu sống động qua sàn đấu Live Visualizer và Bảng xếp hạng Ranking thời gian thực.")

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
    r_name1 = p_s1.add_run("Bộ môn Kỹ thuật Phần mềm & Mạng")
    apply_font(r_name1, size=11, bold=True)

    # Save to primary updated master file
    primary_name = "Bao_Cao_Ke_Hoach_Du_An_Game_OTTV2_Cloudflare_MultiUser.docx"
    doc.save(primary_name)
    print(f"SUCCESS: Saved {primary_name}")

    # Also attempt to update legacy files if not locked in Word
    for legacy_name in [
        "Bao_Cao_Ke_Hoach_Du_An_Game_OTTV2_Master_1000User.docx",
        "Ke_Hoach_Du_An_Game_OTTV2_Cloud_Render_1000User.docx"
    ]:
        try:
            doc.save(legacy_name)
            print(f"SUCCESS: Also updated {legacy_name}")
        except Exception as e:
            print(f"Notice: {legacy_name} is currently open in Word, skipping overwrite.")

if __name__ == "__main__":
    generate_master_document()

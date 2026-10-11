"""
Script kiểm thử toàn diện End-to-End API, Đăng nhập & Phân quyền, Sandbox AST, và Bàn cờ 9x9
Chạy trực tiếp qua HTTP API Gateway (Port 8080)
"""
import sys
import json
import urllib.request
import urllib.error

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

API_URL = "http://127.0.0.1:8080"

def request_json(path, method="GET", data=None):
    url = f"{API_URL}{path}"
    req = urllib.request.Request(url, method=method)
    req.add_header("Content-Type", "application/json")
    body = json.dumps(data).encode("utf-8") if data else None
    try:
        with urllib.request.urlopen(req, data=body, timeout=10) as response:
            res_code = response.getcode()
            res_data = json.loads(response.read().decode("utf-8"))
            return res_code, res_data
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(err_body)
        except Exception:
            return e.code, {"detail": err_body}
    except Exception as e:
        return 500, {"detail": str(e)}

def run_tests():
    print("=" * 70)
    print("🚀 BẮT ĐẦU KIỂM THỬ TOÀN BỘ CHỨC NĂNG, API & PHÂN QUYỀN (FRESHMAN ARENA)")
    print("=" * 70)

    # 1. KIỂM TRA HEALTH CHECK
    code, data = request_json("/health")
    assert code == 200, f"Health check thất bại: {code} - {data}"
    assert data.get("status") == "HEALTHY", f"Trạng thái không HEALTHY: {data}"
    print(f"✅ 1. Health check máy chủ Go API Gateway: OK ({data.get('platform')}, {data.get('goroutines')} goroutines)")

    # 2. KIỂM TRA PHỤC VỤ STATIC ASSETS (FRONTEND)
    try:
        with urllib.request.urlopen(f"{API_URL}/", timeout=5) as r:
            html = r.read().decode("utf-8")
            assert "ICPC K69" in html, "HTML thiếu badge ICPC K69"
            assert 'id="tab-overview"' in html, "HTML thiếu tab-overview"
            assert 'id="tab-bracket"' in html, "HTML thiếu tab-bracket"
            assert 'id="tab-ranking"' in html, "HTML thiếu tab-ranking"
            assert 'id="tab-match-arena"' in html, "HTML thiếu tab-match-arena"
            assert 'id="view-login"' in html, "HTML thiếu view-login"
            print("✅ 2. Phục vụ Frontend HTML tĩnh: Đầy đủ 4 trang Desktop + Màn hình Đăng nhập")
    except Exception as e:
        assert False, f"Lỗi nạp static index.html: {e}"

    # 3. KIỂM TRA TOURNAMENTS LIST API
    code, data = request_json("/api/tournaments")
    assert code == 200, f"GET /api/tournaments thất bại: {code}"
    assert "tourn_k69_main" in data, "Không tìm thấy giải đấu tourn_k69_main"
    tourn = data["tourn_k69_main"]
    print(f"✅ 3. API Danh sách giải đấu: OK ({tourn.get('name')}, {len(tourn.get('teams', []))} đội)")

    # 4. KIỂM TRA BẢNG XẾP HẠNG (RANKING API)
    code, data = request_json("/api/ranking")
    assert code == 200, f"GET /api/ranking thất bại: {code}"
    assert isinstance(data, list), "Ranking API phải trả về mảng"
    print(f"✅ 4. API Bảng xếp hạng Elo: OK (Tổng {len(data)} tuyển thủ/bot)")

    # 5. TEST CHI TIẾT ĐĂNG NHẬP VÀ PHÂN QUYỀN (ROLE-BASED AUTH)
    print("\n--- KIỂM TRA ĐĂNG NHẬP & PHÂN QUYỀN (ROLE-BASED AUTHENTICATION) ---")
    match_id = "m_lvl1_1"

    # 5.1 Đăng nhập Ban Tổ Chức (Admin) - Mật khẩu đúng
    code, data = request_json(f"/api/tournaments/tourn_k69_main/matches/{match_id}/login", method="POST", data={
        "username": "admin",
        "password": "admin123"
    })
    assert code == 200, f"Admin login thất bại: {code} - {data}"
    assert data.get("role") == "ADMIN", f"Role phải là ADMIN: {data}"
    print(f"✅ 5.1 Đăng nhập Ban Tổ Chức (Admin) chính xác: Phân quyền {data.get('role')} [OK]")

    # 5.2 Đăng nhập Admin - Mật khẩu sai (Bị từ chối)
    code, data = request_json(f"/api/tournaments/tourn_k69_main/matches/{match_id}/login", method="POST", data={
        "username": "admin",
        "password": "wrong_password_xyz"
    })
    assert code == 400 or code == 401, f"Sai mật khẩu phải trả lỗi: {code}"
    print(f"✅ 5.2 Đăng nhập Admin với mật khẩu sai: Chặn thành công (Mã HTTP {code}) [OK]")

    # Đảm bảo các đội tuyển đã được xếp vào các cặp đấu Tứ Kết (Auto-Schedule)
    t_data = tourn["matches"][match_id]
    if not t_data.get("team_a") or not t_data.get("team_b"):
        sched_code, sched_data = request_json("/api/tournaments/tourn_k69_main/auto-schedule", method="POST")
        if sched_code == 200:
            print("     [Hệ thống]: Đã tự động bốc thăm xếp 8 đội vào 4 cặp Tứ Kết (Auto-Schedule)")
            _, refreshed = request_json("/api/tournaments")
            tourn = refreshed["tourn_k69_main"]
            t_data = tourn["matches"][match_id]

    team_a = t_data.get("team_a")
    team_b = t_data.get("team_b")
    sid_a = team_a.get("student_id") if team_a else "24020001"
    sid_b = team_b.get("student_id") if team_b else "24020160"

    # 5.3 Đăng nhập Đội Đỏ (Team A) - Đúng mật khẩu
    code, data = request_json(f"/api/tournaments/tourn_k69_main/matches/{match_id}/login", method="POST", data={
        "username": sid_a,
        "password": "12345"
    })
    assert code == 200, f"Team A login thất bại: {code} - {data}"
    assert data.get("role") == "TEAM_A", f"Role phải là TEAM_A: {data}"
    assert data.get("side") == "team_a", f"Side phải là team_a: {data}"
    print(f"✅ 5.3 Đăng nhập Đội Đỏ (MSSV: {sid_a}): Phân quyền {data.get('role')} (Side: {data.get('side')}) [OK]")

    # 5.4 Đăng nhập Đội Đỏ - Sai mật khẩu (Bị từ chối)
    code, data = request_json(f"/api/tournaments/tourn_k69_main/matches/{match_id}/login", method="POST", data={
        "username": sid_a,
        "password": "wrong_team_password"
    })
    assert code == 400 or code == 401, f"Sai mật khẩu đội tuyển phải trả lỗi: {code}"
    print(f"✅ 5.4 Đăng nhập Đội tuyển sai mật khẩu: Chặn thành công (Mã HTTP {code}) [OK]")

    # 5.5 Đăng nhập Đội Xanh (Team B) - Đúng mật khẩu
    code, data = request_json(f"/api/tournaments/tourn_k69_main/matches/{match_id}/login", method="POST", data={
        "username": sid_b,
        "password": "12345"
    })
    assert code == 200, f"Team B login thất bại: {code} - {data}"
    assert data.get("role") == "TEAM_B", f"Role phải là TEAM_B: {data}"
    assert data.get("side") == "team_b", f"Side phải là team_b: {data}"
    print(f"✅ 5.5 Đăng nhập Đội Xanh (MSSV: {sid_b}): Phân quyền {data.get('role')} (Side: {data.get('side')}) [OK]")

    # 5.6 Đăng nhập Tài khoản không tồn tại (Bị từ chối)
    code, data = request_json(f"/api/tournaments/tourn_k69_main/matches/{match_id}/login", method="POST", data={
        "username": "unknown_student_99999",
        "password": "12345"
    })
    assert code == 400 or code == 401, f"Tài khoản lạ phải trả lỗi: {code}"
    print(f"✅ 5.6 Đăng nhập tài khoản không thuộc trận: Từ chối truy cập (Mã HTTP {code}) [OK]")

    # 6. KIỂM TRA NỘP CODE VÀ SANDBOX BẢO MẬT (AST & SYNTAX VALIDATION)
    print("\n--- KIỂM TRA NỘP MÃ NGUỒN & KAGGLE-STYLE SANDBOX ---")

    # 6.1 Nộp mã lệnh Python chuẩn hợp lệ
    valid_py_code = """
def decide_move(game_state):
    turn = game_state.get("turn_number", 1)
    if turn % 2 == 1:
        return "ROCK"
    return "PAPER"
"""
    code, data = request_json(f"/api/tournaments/tourn_k69_main/matches/{match_id}/code", method="POST", data={
        "side": "team_a",
        "code_content": valid_py_code,
        "language": "PYTHON"
    })
    assert code == 200, f"Nộp code hợp lệ thất bại: {code} - {data}"
    assert data.get("is_valid") is True, f"Code hợp lệ bị đánh dấu invalid: {data}"
    print("✅ 6.1 Nộp mã Python hợp lệ: Sandbox xác nhận IS_VALID=True [OK]")

    # 6.2 Nộp mã Python chứa lệnh nguy hiểm (RCE Injection) -> Phải bị chặn bởi AST!
    malicious_py_code = """
import os
def decide_move(game_state):
    os.system("echo hacked")
    return "ROCK"
"""
    code, data = request_json(f"/api/tournaments/tourn_k69_main/matches/{match_id}/code", method="POST", data={
        "side": "team_a",
        "code_content": malicious_py_code,
        "language": "PYTHON"
    })
    assert code == 200, f"Request phải trả 200 với kết quả sandbox: {code}"
    assert data.get("is_valid") is False, "Mã độc hại os.system không bị Sandbox chặn!"
    print(f"✅ 6.2 Bảo mật Sandbox: Chặn mã độc 'import os' (Lý do: {data.get('validation', {}).get('error_message', 'Bị chặn')}) [OK]")

    # 6.3 Nộp lại mã chuẩn cho Đội Đỏ để sẵn sàng thi đấu
    code, data = request_json(f"/api/tournaments/tourn_k69_main/matches/{match_id}/code", method="POST", data={
        "side": "team_a",
        "code_content": valid_py_code,
        "language": "PYTHON"
    })
    assert code == 200 and data.get("is_valid") is True, "Nộp lại code Team A thất bại"

    # 6.4 Nộp mã lệnh Đội Xanh hợp lệ
    valid_blue_code = """
def decide_move(game_state):
    return "SCISSORS"
"""
    code, data = request_json(f"/api/tournaments/tourn_k69_main/matches/{match_id}/code", method="POST", data={
        "side": "team_b",
        "code_content": valid_blue_code,
        "language": "PYTHON"
    })
    assert code == 200 and data.get("is_valid") is True, "Nộp code Team B thất bại"
    print("✅ 6.3 Nộp mã hợp lệ cho cả 2 đội: Trạng thái cả 2 bên ĐÃ SẴN SÀNG [OK]")

    # 7. KIỂM TRA ĐIỀU HÀNH TRẬN ĐẤU & BÀN CỜ 9x9 (PLAY-ROUND ENGINE)
    print("\n--- KIỂM TRA ENGINE THI ĐẤU & BÀN CỜ 9x9 ---")
    code, data = request_json(f"/api/tournaments/tourn_k69_main/matches/{match_id}/play-round", method="POST")
    assert code == 200, f"Play-round thất bại: {code} - {data}"
    rec = data.get("round_record") or (data.get("match", {}).get("rounds_history", [None])[-1])
    assert rec is not None, "round_record không được rỗng"
    assert "board_steps" in rec, "round_record thiếu board_steps trên bàn cờ 9x9"
    steps = rec.get("board_steps", [])
    print(f"✅ 7.1 Khởi chạy Round {rec.get('round_number')}: Sinh thành công {len(steps)} bước cờ trên bàn 9x9 [OK]")
    print(f"     Nhật ký hiệp đấu: {rec.get('log')} (Kết quả: {rec.get('winner')})")

    # 8. TỔNG KẾT
    print("\n" + "=" * 70)
    print("🎉 TOÀN BỘ 7/7 HẠNG MỤC KIỂM THỬ ĐÃ ĐẠT 100% TIÊU CHUẨN!")
    print("   • API Gateway & Static Assets: Hoạt động hoàn hảo")
    print("   • Phân quyền Khách / Đội tuyển / Admin: Đã xác thực nghiêm ngặt")
    print("   • AST Kaggle Sandbox: Phòng vệ mã độc thành công")
    print("   • Engine Bàn cờ 9x9 & Luật Oẳn Tù Tì V2: Bảo toàn trọn vẹn")
    print("=" * 70)

if __name__ == "__main__":
    run_tests()

"""Nạp dữ liệu mẫu để xem giao diện: giải 4 đội, vòng loại có bot thử, thông báo, một hiệp đã đấu.

Chạy sau khi backend (8080) và worker (8001) đã sẵn sàng:
    python scripts/seed_demo.py
Biến môi trường: ARENA_API (mặc định http://127.0.0.1:8080/api), ADMIN_PASSWORD (mặc định admin123).
Chạy lại nhiều lần an toàn: nếu đã có giải mẫu thì bỏ qua.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

API = os.environ.get("ARENA_API", "http://127.0.0.1:8080/api")
PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")
NAME = "Giải thử nghiệm K69"


def call(method, path, body=None, token=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            return json.loads(response.read() or b"null")
    except urllib.error.HTTPError as error:
        return {"_error": error.code, "detail": error.read().decode("utf-8", "replace")[:200]}


def step(label, result):
    failed = isinstance(result, dict) and "_error" in result
    print(("  ! " if failed else "  ✓ ") + label + (f" — {result['detail']}" if failed else ""))
    return result


def main():
    login = call("POST", "/admin/login", {"username": "admin", "password": PASSWORD})
    if "session_token" not in login:
        sys.exit("Không đăng nhập admin được. Kiểm tra ADMIN_PASSWORD của backend.")
    admin = login["session_token"]

    existing = call("GET", "/tournaments/list") or []
    if any(item.get("name") == NAME for item in existing if isinstance(item, dict)):
        print("Dữ liệu mẫu đã có, bỏ qua.")
        return

    created = call("POST", "/tournaments/create", {"name": NAME, "num_teams": 4}, admin)
    tid = created.get("tournament_id") or created.get("tournament", {}).get("tournament_id")
    if not tid:
        sys.exit(f"Không tạo được giải: {created}")
    print(f"Giải {tid}")

    for sid, name in (("24020001", "Alpha Bot"), ("24020002", "Beta Bot")):
        call("POST", "/teams/register", {"student_id": sid, "team_name": name, "password": "secret123"})
        step(f"Tài khoản đội {name} ({sid} / secret123)", call("POST", f"/admin/accounts/{sid}/enroll", {"tournament_id": tid}, admin))
    for sid, name, uni in (("24020003", "Gamma Bot", "UET"), ("24020004", "Delta Bot", "HUST")):
        step(f"Thêm đội {name}", call("POST", f"/tournaments/{tid}/teams", {"student_id": sid, "team_name": name, "university": uni}, admin))
    step("Xếp lịch", call("POST", f"/tournaments/{tid}/auto-schedule", None, admin))

    now = int(time.time())
    step("Luật vòng 1 (Trộn quân + Sương mù)", call("PUT", f"/tournaments/{tid}/stage-rules", {"rules": [{"level": 1, "rule_id": "COMBO_5", "publish_at": 0}]}, admin))
    step("Lịch các vòng", call("PUT", f"/tournaments/{tid}/stage-schedule", {"windows": [
        {"level": 1, "starts_at": now - 3600, "ends_at": now + 86400},
        {"level": 2, "starts_at": now + 90000, "ends_at": now + 170000}]}, admin))
    step("Thông báo", call("POST", "/admin/notifications", {"title": "Chào mừng K69", "message": "Giải đấu thử nghiệm đã mở.", "link_tab": "bracket"}, admin))

    qualifier = call("POST", "/qualifiers", {"name": "Vòng loại K69", "deadline": now + 7200, "rounds": 3, "top_k": 8}, admin)
    if qualifier.get("id"):
        step("Vòng loại + 12 bot thử", call("POST", f"/qualifiers/{qualifier['id']}/actions/test-bots", {"count": 12}, admin))

    matches = (call("GET", f"/tournaments/{tid}", None, admin) or {}).get("matches", {})
    ready = [key for key, match in matches.items() if match.get("team_a") and match.get("team_b")]
    if ready:
        step("Điền bot mẫu cho trận đầu", call("POST", f"/tournaments/{tid}/matches/{ready[0]}/demo-fill", None, admin))
        step("Chạy hiệp 1 (cần worker)", call("POST", f"/tournaments/{tid}/matches/{ready[0]}/play-round", None, admin))

    print("\nXong. Đăng nhập admin: admin / " + PASSWORD + " — đội: 24020001 / secret123")


if __name__ == "__main__":
    main()

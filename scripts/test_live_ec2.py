"""Comprehensive verification script for AWS EC2 live deployment."""
import json
import ssl
import sys
import urllib.error
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE = "https://arena.13.250.49.111.sslip.io"


def req(path, data=None, token=None):
    url = BASE + path
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    encoded = json.dumps(data).encode("utf-8") if data is not None else None
    r = urllib.request.Request(url, data=encoded, headers=headers)
    try:
        with urllib.request.urlopen(r, context=ctx, timeout=15) as resp:
            body = resp.read().decode("utf-8")
            try:
                return resp.status, json.loads(body)
            except:
                return resp.status, body
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body)
        except:
            return e.code, body
    except Exception as e:
        return 0, str(e)


def main():
    print("=" * 65)
    print("  KIEM TRA TOAN DIEN LIVE CHUC NANG TREN AWS EC2")
    print(f"  URL: {BASE}")
    print("=" * 65)

    passed = 0
    failed = 0

    # 1. Health check
    s, r = req("/health")
    if s == 200 and isinstance(r, dict) and r.get("status") == "HEALTHY":
        print(f"[PASS] GET /health -> {s} (status: HEALTHY, uptime: {r.get('uptime')})")
        passed += 1
    else:
        print(f"[FAIL] GET /health -> {s} : {r}")
        failed += 1

    # 2. Readiness check
    s, r = req("/ready")
    if s == 200 and isinstance(r, dict) and r.get("status") == "READY":
        print(f"[PASS] GET /ready -> {s} (status: READY, checks: {r.get('checks')})")
        passed += 1
    else:
        print(f"[FAIL] GET /ready -> {s} : {r}")
        failed += 1

    # 3. Capabilities
    s, r = req("/api/capabilities")
    if s == 200 and isinstance(r, dict) and "languages" in r:
        print(f"[PASS] GET /api/capabilities -> {s} (languages: {r.get('languages')})")
        passed += 1
    else:
        print(f"[FAIL] GET /api/capabilities -> {s} : {r}")
        failed += 1

    # 4. Admin Login
    s, r = req("/api/admin/login", {"password": "admin1234"})
    token = None
    if s == 200 and isinstance(r, dict) and r.get("role") == "ADMIN":
        token = r.get("session_token")
        print(f"[PASS] POST /api/admin/login -> {s} (authenticated as ADMIN)")
        passed += 1
    else:
        print(f"[FAIL] POST /api/admin/login -> {s} : {r}")
        failed += 1

    # 5. Admin Accounts List (Kiểm tra sửa lỗi 503)
    s, r = req("/api/admin/accounts", token=token)
    if s == 200 and isinstance(r, list):
        print(f"[PASS] GET /api/admin/accounts -> {s} (Loaded {len(r)} accounts successfully, no 503!)")
        available = sum(1 for a in r if a.get("password_available"))
        print(f"       Chi tiet: {available}/{len(r)} tai khoan doc duoc password truc tiep.")
        passed += 1
    else:
        print(f"[FAIL] GET /api/admin/accounts -> {s} : {r}")
        failed += 1

    # 6. Tournaments List
    s, r = req("/api/tournaments/list")
    tournament_id = None
    if s == 200 and isinstance(r, list):
        print(f"[PASS] GET /api/tournaments/list -> {s} ({len(r)} tournaments found)")
        if len(r) > 0 and isinstance(r[0], dict):
            tournament_id = r[0].get("id") or r[0].get("tournament_id")
        passed += 1
    else:
        print(f"[FAIL] GET /api/tournaments/list -> {s} : {r}")
        failed += 1

    # 7. Ranking
    s, r = req("/api/ranking")
    if s == 200 and isinstance(r, list):
        print(f"[PASS] GET /api/ranking -> {s} ({len(r)} bots in ranking)")
        passed += 1
    else:
        print(f"[FAIL] GET /api/ranking -> {s} : {r}")
        failed += 1

    # 8. Practice Match Sandbox
    bot_code = (
        "def decide_move(state):\n"
        "    return 'ROCK'\n"
    )
    s, r = req("/api/bots/practice", {"code_content": bot_code, "language": "PYTHON", "side": "team_a"}, token=token)
    if s == 200 and isinstance(r, dict) and r.get("status") == "SUCCESS":
        result = r.get("result", {})
        print(f"[PASS] POST /api/bots/practice -> {s} (status: SUCCESS, winner: {result.get('winner_side')}, moves: {len(result.get('board_steps', []))})")
        passed += 1
    else:
        print(f"[FAIL] POST /api/bots/practice -> {s} : {r}")
        failed += 1

    # 9. Bot Validation Endpoint
    s, r = req("/api/bots/validate", {"code_content": bot_code, "language": "PYTHON"}, token=token)
    if s == 200 and isinstance(r, dict) and r.get("is_valid") is True:
        print(f"[PASS] POST /api/bots/validate -> 200 (bot code is valid)")
        passed += 1
    else:
        print(f"[FAIL] POST /api/bots/validate -> {s} : {r}")
        failed += 1

    # 10. Tournament Rules
    if tournament_id:
        s, r = req(f"/api/tournament/rule?tournament_id={tournament_id}")
        if s == 200 and isinstance(r, dict) and "stage" in r:
            print(f"[PASS] GET /api/tournament/rule?tournament_id={tournament_id} -> {s} (stage: {r.get('stage')})")
            passed += 1
        else:
            print(f"[FAIL] GET /api/tournament/rule?tournament_id={tournament_id} -> {s} : {r}")
            failed += 1
    else:
        print("[SKIP] GET /api/tournament/rule (no tournament ID found)")


    print("=" * 65)
    print(f"  TONG KET: {passed} PASSED / {failed} FAILED ({passed + failed} APIs)")
    print("=" * 65)
    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()

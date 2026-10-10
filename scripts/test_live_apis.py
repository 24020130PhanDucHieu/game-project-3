import urllib.request
import urllib.parse
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = "https://game-project-3.onrender.com"
passed = 0
failed = 0

def request(method, path, data=None):
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
        encoded_data = json.dumps(data).encode("utf-8")
    else:
        encoded_data = None
    try:
        with urllib.request.urlopen(req, data=encoded_data, timeout=20) as r:
            body = r.read().decode("utf-8")
            try:
                return r.status, json.loads(body)
            except:
                return r.status, body
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body)
        except:
            return e.code, body
    except Exception as e:
        return 0, str(e)

def test(name, method, path, data=None, expected_status=200):
    global passed, failed
    status, res = request(method, path, data)
    if status == expected_status or (isinstance(expected_status, list) and status in expected_status):
        print(f" [PASS] {method} {path} -> {status}")
        passed += 1
        return res
    else:
        print(f" [FAIL] {method} {path} -> {status} (Expected {expected_status}) | Body: {str(res)[:120]}")
        failed += 1
        return None

print(f"=== KIEM TRA TOAN DIEN LIVE API TREN RENDER ({BASE_URL}) ===")

# 1. Base & Observability
test("Root Gateway", "GET", "/")
test("Health Check", "GET", "/health")
test("Prometheus Metrics", "GET", "/metrics")

# 2. Tournaments Overview
test("Get All Tournaments", "GET", "/api/tournaments")
test("Get Tournament List Summaries", "GET", "/api/tournaments/list")

# 3. Global History, Ranking, Rules
test("Global Match History", "GET", "/api/matches/history")
test("Global ELO Ranking", "GET", "/api/ranking")
test("Get Tournament Rules", "GET", "/api/tournament/rule")
test("Set Tournament Rules", "POST", "/api/tournament/rule/set?stage_name=STAGE_1_STANDARD")

# 4. Create New Tournament
create_res = test("Create Tournament", "POST", "/api/tournaments/create", {"name": "Giai Dau Test API Live", "num_teams": 8})
t_id = None
if create_res and "tournament" in create_res:
    t_id = create_res["tournament"]["tournament_id"]

if t_id:
    print(f" -> Tournament ID vua tao: {t_id}")
    test("Get Tournament by ID", "GET", f"/api/tournaments/{t_id}")
    
    # 5. Teams CRUD
    test("Add Team 1", "POST", f"/api/tournaments/{t_id}/teams", {"team_name": "TestTeam_1", "student_id": "24029991", "university": "VNU"})
    test("Add Team 2", "POST", f"/api/tournaments/{t_id}/teams", {"team_name": "TestTeam_2", "student_id": "24029992", "university": "VNU"})
    test("Get Teams List", "GET", f"/api/tournaments/{t_id}/teams")
    test("Delete Team by MSSV", "DELETE", f"/api/tournaments/{t_id}/teams/24029992")
    
    # 6. Quick Fill & Auto Schedule
    test("Quick Fill 8 Teams", "POST", f"/api/tournaments/{t_id}/teams/quick-fill", {})
    test("Auto Schedule Bracket", "POST", f"/api/tournaments/{t_id}/auto-schedule", {})
    
    # 7. Match Operations
    test("Match Login (Admin)", "POST", f"/api/tournaments/{t_id}/matches/m_lvl1_1/login", {"username": "admin", "password": "admin123"})
    test("Match Login (Student Team A)", "POST", f"/api/tournaments/{t_id}/matches/m_lvl1_1/login", {"username": "24020001", "password": "12345"})
    test("Submit Draft Code", "POST", f"/api/tournaments/{t_id}/matches/m_lvl1_1/draft-code", {"side": "team_a", "code_content": "def decide_move(s):\n return 'ROCK'", "language": "PYTHON"})
    test("Submit Final Code Team A", "POST", f"/api/tournaments/{t_id}/matches/m_lvl1_1/code", {"side": "team_a", "code_content": "def decide_move(s):\n return 'ROCK'", "language": "PYTHON"})
    test("Submit Final Code Team B", "POST", f"/api/tournaments/{t_id}/matches/m_lvl1_1/code", {"side": "team_b", "code_content": "def decide_move(s):\n return 'PAPER'", "language": "PYTHON"})
    test("Practice Match Sandbox", "POST", f"/api/tournaments/{t_id}/practice-match", {"code_content": "def decide_move(s):\n return 'ROCK'", "language": "PYTHON", "side": "team_a"})
    test("Play Round 1", "POST", f"/api/tournaments/{t_id}/matches/m_lvl1_1/play-round", {})
    test("Advance Next Round", "POST", f"/api/tournaments/{t_id}/matches/m_lvl1_1/next-round", {})
    test("Get Match Submissions", "GET", f"/api/tournaments/{t_id}/matches/m_lvl1_1/submissions")
    test("Reset Match", "POST", f"/api/tournaments/{t_id}/matches/m_lvl1_1/reset", {})

print(f"\n==============================================")
print(f"KET QUA: {passed} PASSED / {failed} FAILED (Tong cong: {passed + failed} APIs)")
print(f"==============================================")

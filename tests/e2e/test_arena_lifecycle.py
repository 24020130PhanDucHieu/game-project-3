import urllib.request
import urllib.parse
import json
import time
import sys
import os

try:
    sys.stdout.reconfigure(encoding='utf-8')
except:
    pass

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:8080")
ADMIN_TOKEN = None

def get_admin_token():
    token = os.environ.get("ADMIN_TOKEN", "")
    if not token:
        login_url = f"{BASE_URL}/api/admin/login"
        password = os.environ.get("ADMIN_PASSWORD", "admin123")
        try:
            req = urllib.request.Request(
                login_url,
                data=json.dumps({"password": password}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                token = data.get("token", "")
        except Exception:
            pass
    return token

def request(method, path, data=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if ADMIN_TOKEN:
        headers["Authorization"] = f"Bearer {ADMIN_TOKEN}"
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(err_body)
        except:
            return e.code, {"detail": err_body}

def main():
    global ADMIN_TOKEN
    ADMIN_TOKEN = get_admin_token()
    print("=== STARTING FULL END-TO-END ARENA LIFECYCLE TEST ===")
    
    # 1. Fetch tournaments
    status, tournaments = request("GET", "/api/tournaments")
    assert status == 200, f"Failed GET /api/tournaments: {status}"
    tourn_list = list(tournaments.values()) if isinstance(tournaments, dict) else tournaments
    if len(tourn_list) == 0:
        print("[INFO] No tournament in store, creating a new test tournament...")
        status, new_t = request("POST", "/api/tournaments/create", {"name": "Lifecycle Test Tournament", "num_teams": 8})
        assert status == 200, f"Failed to create tournament: {new_t}"
        created = new_t.get("tournament", {})
        tourn_list = [created]
    assert len(tourn_list) > 0, "No tournaments found"
    
    t = None
    t_detail = None
    for item in tourn_list:
        item_id = item.get("tournament_id") or item.get("id")
        status, detail = request("GET", f"/api/tournaments/{item_id}")
        if status == 200 and len(detail.get("teams", [])) > 0:
            t = item
            t_detail = detail
            break
            
    if not t:
        t = tourn_list[0]
        item_id = t.get("tournament_id") or t.get("id")
        request("POST", f"/api/tournaments/{item_id}/teams/quick-fill")
        status, t_detail = request("GET", f"/api/tournaments/{item_id}")

    t_id = t.get("tournament_id") or t.get("id")
    print(f"[OK] Tournament selected: {t_id} ({t_detail.get('name')})")

    # 2. Get matches
    matches_dict = t_detail.get("matches", {})
    if isinstance(matches_dict, dict):
        scheduled = [m for m in matches_dict.values() if m.get("team_a") and m.get("team_b")]
    else:
        scheduled = [m for m in matches_dict if m.get("team_a") and m.get("team_b")]

    if not scheduled:
        print("[INFO] Auto-scheduling tournament...")
        status, sched_res = request("POST", f"/api/tournaments/{t_id}/auto-schedule")
        assert status == 200, f"Auto schedule failed: {sched_res}"
        matches_dict = sched_res.get("tournament", {}).get("matches", {})
        scheduled = [m for m in matches_dict.values() if m.get("team_a") and m.get("team_b")]

    assert len(scheduled) > 0, "No scheduled matches found"
    match = scheduled[0]
    m_id = match["match_id"]
    print(f"[OK] Testing Match: {m_id} ({match.get('title')}, Round {match.get('current_round_idx', 1)})")
    
    team_a = match["team_a"]
    team_b = match["team_b"]
    print(f"     Team A: {team_a['team_name']} ({team_a['student_id']})")
    print(f"     Team B: {team_b['team_name']} ({team_b['student_id']})")

    # Reset match to ensure pristine un-submitted state for testing
    print("[INFO] Resetting match to pristine initial state...")
    status, reset_res = request("POST", f"/api/tournaments/{t_id}/matches/{m_id}/reset")
    assert status == 200
    
    # 3. Test Invalid Code Submission
    invalid_code = "def get_move(game_state):\n    syntax error here ???"
    print("\n--- TEST 1: Submit Invalid Code (Team A) ---")
    status, res = request("POST", f"/api/tournaments/{t_id}/matches/{m_id}/code", {
        "side": "team_a",
        "code_content": invalid_code,
        "language": "PYTHON"
    })
    print(f"Status: {status}, Response: {res}")
    assert status == 200
    assert res.get("code_valid") is False, "Invalid code should have code_valid=False"
    assert "validation_error" in res and res["validation_error"], "Should have validation_error"
    print(f"[PASSED] Invalid code correctly flagged: {res['validation_error']}")
    
    # Verify match status: Admin cannot start
    print("\n--- TEST 2: Admin Try Start Battle Before Both Ready ---")
    status, err = request("POST", f"/api/tournaments/{t_id}/matches/{m_id}/play-round")
    print(f"Status: {status}, Detail: {err}")
    assert status == 400, "Admin start should fail when both teams are not ready"
    print("[PASSED] Backend correctly rejected Admin start!")

    # 4. Submit Valid Code for Team A
    valid_code_a = """
import random
def decide_move(game_state):
    cards = game_state.get('remaining_cards', {})
    avail = [c for c, count in cards.items() if count > 0]
    return 'ROCK' if 'ROCK' in avail else (avail[0] if avail else 'ROCK')
"""
    print("\n--- TEST 3: Submit Valid Code for Team A ---")
    status, res_a = request("POST", f"/api/tournaments/{t_id}/matches/{m_id}/code", {
        "side": "team_a",
        "code_content": valid_code_a,
        "language": "PYTHON"
    })
    assert status == 200
    assert res_a.get("code_valid") is True, f"Code A should be valid: {res_a}"
    print(f"[PASSED] Team A code validated: sub_id={res_a.get('submission_id')}")

    # Still cannot start because Team B hasn't submitted
    status, err = request("POST", f"/api/tournaments/{t_id}/matches/{m_id}/play-round")
    assert status == 400, "Admin start should still fail because Team B is not ready"
    print("[PASSED] Backend correctly blocked start when only Team A is ready!")

    # 5. Submit Valid Code for Team B
    valid_code_b = """
import random
def decide_move(game_state):
    cards = game_state.get('remaining_cards', {})
    avail = [c for c, count in cards.items() if count > 0]
    return 'PAPER' if 'PAPER' in avail else (avail[0] if avail else 'ROCK')
"""
    print("\n--- TEST 4: Submit Valid Code for Team B ---")
    status, res_b = request("POST", f"/api/tournaments/{t_id}/matches/{m_id}/code", {
        "side": "team_b",
        "code_content": valid_code_b,
        "language": "PYTHON"
    })
    assert status == 200
    assert res_b.get("code_valid") is True, f"Code B should be valid: {res_b}"
    print(f"[PASSED] Team B code validated: sub_id={res_b.get('submission_id')}")

    # Verify match details show all_teams_ready == True
    status, m_updated = request("GET", f"/api/tournaments/{t_id}")
    matches_list = list(m_updated["matches"].values()) if isinstance(m_updated["matches"], dict) else m_updated["matches"]
    match_now = next(m for m in matches_list if m["match_id"] == m_id)
    assert match_now.get("all_teams_ready") is True, "all_teams_ready must be True"
    print(f"[PASSED] match_now.all_teams_ready = {match_now.get('all_teams_ready')}")

    # 6. Admin Starts Round 1
    print("\n--- TEST 5: Admin Starts Round (Official Battle Execution) ---")
    status, battle_res = request("POST", f"/api/tournaments/{t_id}/matches/{m_id}/play-round")
    assert status == 200, f"Battle execution failed: {battle_res}"
    print(f"[PASSED] Battle finished! Result: Winner={battle_res.get('winner')}, Reason={battle_res.get('reason')}")
    print(f"         Total board steps: {len(battle_res.get('board_steps', []))}")
    print(f"         Move Logs count: {len(battle_res.get('move_logs', []))}")
    print(f"         Bot Logs count: {len(battle_res.get('bot_logs', []))}")
    print(f"         System Logs count: {len(battle_res.get('system_logs', []))}")
    assert len(battle_res.get("move_logs", [])) > 0, "Should have move logs"
    assert len(battle_res.get("system_logs", [])) > 0, "Should have system logs"

    # 7. Check Submissions History (Kaggle Style)
    print("\n--- TEST 6: Verify Kaggle Submissions History ---")
    status, subs = request("GET", f"/api/tournaments/{t_id}/matches/{m_id}/submissions?role=ADMIN")
    assert status == 200
    print(f"[PASSED] Found {len(subs)} Kaggle submissions recorded:")
    for s in subs[:3]:
        print(f"         - [{s.get('submission_id')}] Team: {s.get('team_name')} | Round: {s.get('round_number')} | Valid: {s.get('is_valid')} | Locked: {s.get('is_locked')}")
    active_locked = [s for s in subs if s.get("is_locked")]
    assert len(active_locked) >= 2, "Both active submissions must be marked locked!"

    # 8. Check Match Replay Endpoint
    curr_round = match_now.get("current_round_idx", 1)
    print(f"\n--- TEST 7: Verify Round Replay Endpoint (Round {curr_round}) ---")
    status, replay = request("GET", f"/api/tournaments/{t_id}/matches/{m_id}/replay/{curr_round}")
    assert status == 200
    assert "board_steps" in replay
    print(f"[PASSED] Replay retrieved with {len(replay['board_steps'])} steps, winner: {replay.get('winner')}")

    # 9. Test Next Round Transition (5-second transition trigger)
    print(f"\n--- TEST 8: Advance to Next Round (Round {curr_round + 1}) ---")
    status, nxt = request("POST", f"/api/tournaments/{t_id}/matches/{m_id}/next-round")
    assert status == 200
    print(f"[PASSED] Advanced to next round: {nxt.get('current_round_idx')}")
    assert nxt.get("current_round_idx") == curr_round + 1
    assert nxt.get("all_teams_ready") is False, "Next round must reset all_teams_ready"
    assert nxt.get("team_a", {}).get("code_submitted") is False, "Team A must reset code_submitted"
    assert nxt.get("team_b", {}).get("code_submitted") is False, "Team B must reset code_submitted"

    # Verify Admin start is LOCKED AGAIN for the new round
    status, err = request("POST", f"/api/tournaments/{t_id}/matches/{m_id}/play-round")
    assert status == 400, "Admin start MUST be locked again for new round!"
    print("[PASSED] Admin start is locked again for Round 2 until both teams submit fresh code!")

    print("\n=======================================================")
    print("ALL 8 VERIFICATION TESTS PASSED SUCCESSFULLY! 100% OK!")
    print("=======================================================")

if __name__ == "__main__":
    main()

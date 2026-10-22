import requests
import json
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:8080")

def test_full_system():
    print("=== STARTING FULL END-TO-END TEST ===")

    admin_pass = os.environ.get("ADMIN_PASSWORD", "verification-organizer")
    login_res = requests.post(f"{BASE_URL}/api/admin/login", json={"username": "admin", "password": admin_pass})
    if login_res.status_code != 200:
        login_res = requests.post(f"{BASE_URL}/api/admin/login", json={"username": "admin", "password": "admin123"})
    admin_token = login_res.json().get("session_token", "") if login_res.status_code == 200 else ""
    admin_headers = {"Authorization": f"Bearer {admin_token}"} if admin_token else {}

    # 1. Test Create Tournament with custom team count
    print("\n--- 1. Testing Tournament Creation ---")
    create_payload = {
        "name": "Giải Đấu Kiểm Thử Tự Động 2026",
        "num_teams": 8
    }
    res = requests.post(f"{BASE_URL}/api/tournaments/create", json=create_payload, headers=admin_headers)
    assert res.status_code == 200, f"Create tourn failed: {res.text}"
    data = res.json()
    t_id = data["tournament"]["tournament_id"]
    print(f"Created tournament successfully! ID: {t_id}, Teams: {data['tournament']['num_teams']}")

    # Verify invalid count is rejected
    res_invalid = requests.post(f"{BASE_URL}/api/tournaments/create", json={"name": "Test Fail", "num_teams": 6}, headers=admin_headers)
    assert res_invalid.status_code == 400, f"Expected 400 for 6 teams, got {res_invalid.status_code}"
    print("Invalid team count (6 teams) properly rejected by backend: OK")

    # 2. Test Adding Teams & Duplicate MSSV
    print("\n--- 2. Testing Team Management ---")
    team1 = {"team_name": "BK_Phoenix", "student_id": "24029901", "university": "ĐHBK Hà Nội"}
    res_t1 = requests.post(f"{BASE_URL}/api/tournaments/{t_id}/teams", json=team1, headers=admin_headers)
    assert res_t1.status_code == 200, f"Add team1 failed: {res_t1.text}"
    print("Added team BK_Phoenix: OK")

    # Try duplicate MSSV
    res_dup = requests.post(f"{BASE_URL}/api/tournaments/{t_id}/teams", json=team1, headers=admin_headers)
    assert res_dup.status_code == 400, f"Duplicate MSSV should fail, got {res_dup.status_code}"
    print(f"Duplicate MSSV properly rejected: {res_dup.json().get('detail')}")

    # Quick fill rest of teams to capacity
    res_qf = requests.post(f"{BASE_URL}/api/tournaments/{t_id}/teams/quick-fill", headers=admin_headers)
    assert res_qf.status_code == 200, f"Quick fill failed: {res_qf.text}"
    print("Quick filled remaining teams to 8/8 capacity: OK")

    # Verify cannot exceed capacity
    res_overflow = requests.post(f"{BASE_URL}/api/tournaments/{t_id}/teams", json={"team_name": "Overflow", "student_id": "24099999"}, headers=admin_headers)
    assert res_overflow.status_code == 400, f"Capacity overflow should fail, got {res_overflow.status_code}"
    print(f"Capacity limit enforced: {res_overflow.json().get('detail')}")

    # 3. Test Auto Schedule Bracket
    print("\n--- 3. Testing Auto Schedule ---")
    res_sched = requests.post(f"{BASE_URL}/api/tournaments/{t_id}/auto-schedule", headers=admin_headers)
    assert res_sched.status_code == 200, f"Schedule failed: {res_sched.text}"
    tourn_data = res_sched.json()["tournament"]
    first_match_id = next(m_id for m_id, m in tourn_data["matches"].items() if m.get("team_a") and m.get("team_b"))
    first_match = tourn_data["matches"][first_match_id]
    print(f"Scheduled bracket! Match 1 ({first_match['title']}): {first_match['team_a']['team_name']} vs {first_match['team_b']['team_name']}")

    # 4. Test Unified Login
    print("\n--- 4. Testing Unified Login Authentication ---")
    # Test wrong admin password
    res_fail_admin = requests.post(f"{BASE_URL}/api/tournaments/{t_id}/matches/{first_match_id}/login", json={
        "username": "admin",
        "password": "wrongpassword"
    })
    assert res_fail_admin.status_code == 400, "Wrong password should fail"
    print(f"Admin wrong password rejected: {res_fail_admin.json().get('detail')}")

    # Test correct admin login
    res_ok_admin = requests.post(f"{BASE_URL}/api/tournaments/{t_id}/matches/{first_match_id}/login", json={
        "username": "admin",
        "password": "admin123"
    })
    assert res_ok_admin.status_code == 200, f"Admin login failed: {res_ok_admin.text}"
    admin_auth = res_ok_admin.json()
    assert admin_auth["role"] == "ADMIN", f"Expected role ADMIN, got {admin_auth['role']}"
    print("Admin login with 'admin' & 'admin123': SUCCESS (Role: ADMIN)")

    # Test team login using MSSV
    team_a_sid = first_match["team_a"]["student_id"]
    res_ok_team = requests.post(f"{BASE_URL}/api/tournaments/{t_id}/matches/{first_match_id}/login", json={
        "username": team_a_sid,
        "password": "12345"
    })
    assert res_ok_team.status_code == 200, f"Team login failed: {res_ok_team.text}"
    team_auth = res_ok_team.json()
    assert team_auth["role"] == "TEAM_A" and team_auth["side"] == "team_a", f"Expected TEAM_A side team_a, got {team_auth}"
    print(f"Team login with MSSV '{team_a_sid}' & '12345': SUCCESS (Role: {team_auth['role']}, Side: {team_auth['side']})")

    # 5. Test Live Draft Code Sync (Realtime Typing)
    print("\n--- 5. Testing Draft Code Synchronization ---")
    draft_sample = "# Draft live code typing test\ndef decide_move(s):\n    return 'SCISSORS'"
    res_draft = requests.post(f"{BASE_URL}/api/tournaments/{t_id}/matches/{first_match_id}/draft-code", json={
        "side": "team_a",
        "code_content": draft_sample,
        "language": "PYTHON"
    })
    assert res_draft.status_code == 200, f"Draft code post failed: {res_draft.text}"
    # Verify match query returns draft code
    res_m = requests.get(f"{BASE_URL}/api/tournaments/{t_id}")
    match_now = res_m.json()["matches"][first_match_id]
    assert match_now["team_a"]["draft_code"] == draft_sample, "Draft code was not saved in match state"
    print("Draft code successfully updated and persisted for Admin Live Monitor!")

    # 6. Test Bot Submission & Round Battle & Score Persistence
    print("\n--- 6. Testing Battle Simulation & Score Persistence ---")
    # Quick fill demo bots so both are ready
    res_demo = requests.post(f"{BASE_URL}/api/tournaments/{t_id}/matches/{first_match_id}/demo-fill")
    assert res_demo.status_code == 200, f"Demo fill failed: {res_demo.text}"

    # Play Round 1
    res_play = requests.post(f"{BASE_URL}/api/tournaments/{t_id}/matches/{first_match_id}/play-round")
    assert res_play.status_code == 200, f"Play round failed: {res_play.text}"
    battle_res = res_play.json()
    m_after_round = battle_res["match"]
    score_a = m_after_round["team_a"]["rounds_won"]
    score_b = m_after_round["team_b"]["rounds_won"]
    print(f"Played Round 1! Score now: {score_a} - {score_b}. Log: {battle_res['round_record']['log']}")

    # Reload tournament from backend to verify score was truly saved
    res_verify = requests.get(f"{BASE_URL}/api/tournaments/{t_id}")
    persisted_match = res_verify.json()["matches"][first_match_id]
    assert persisted_match["team_a"]["rounds_won"] == score_a, "Team A rounds won not persisted"
    assert persisted_match["team_b"]["rounds_won"] == score_b, "Team B rounds won not persisted"
    print(f"Score verified in backend store: {persisted_match['team_a']['rounds_won']} - {persisted_match['team_b']['rounds_won']} : OK")

    # 7. Test Practice Simulation Endpoint
    print("\n--- 7. Testing Practice Simulation Mode ---")
    res_practice = requests.post(f"{BASE_URL}/api/tournaments/{t_id}/practice-match", json={
        "code_content": "def decide_move(state): return 'ROCK'",
        "language": "PYTHON",
        "side": "team_a"
    })
    assert res_practice.status_code == 200, f"Practice simulation failed: {res_practice.text}"
    sim_data = res_practice.json()
    assert "board_steps" in sim_data and len(sim_data["board_steps"]) > 0, "No board steps returned"
    print(f"Practice simulation successful! Steps: {len(sim_data['board_steps'])}, Winner: {sim_data['winner']}")

    print("\n=== ALL 7 SYSTEM TESTS PASSED PERFECTLY! ===")

if __name__ == "__main__":
    test_full_system()

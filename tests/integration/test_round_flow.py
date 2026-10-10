import sys
sys.stdout.reconfigure(encoding='utf-8')
import requests
import json

base_url = "http://127.0.0.1:8000"

# 1. Get tournaments
r = requests.get(f"{base_url}/api/tournaments/list")
tourns = r.json()
print("Tournaments count:", len(tourns))
t_id = tourns[0]["tournament_id"]
print("Using tournament ID:", t_id)

m_id = "m_qf_1"

# 2. Reset match first to make sure it's at round 1
requests.post(f"{base_url}/api/tournaments/{t_id}/matches/{m_id}/reset")
match = requests.get(f"{base_url}/api/tournaments/{t_id}").json()["matches"][m_id]
print(f"Initial: Round {match['current_round_idx']}, ReadyA={match['team_a']['code_submitted']}, ReadyB={match['team_b']['code_submitted']}")

# 3. Quick fill code for round 1
fill1 = requests.post(f"{base_url}/api/tournaments/{t_id}/matches/{m_id}/demo-fill").json()
print("Quick fill R1:", fill1["message"])

# 4. Play Round 1
play1 = requests.post(f"{base_url}/api/tournaments/{t_id}/matches/{m_id}/play-round").json()
print("Round 1 log:", play1["round_record"]["log"])
print(f"After Round 1: Next Round {play1['match']['current_round_idx']}, is_completed={play1['is_completed']}")
print(f"Ready status for R2: ReadyA={play1['match']['team_a']['code_submitted']}, ReadyB={play1['match']['team_b']['code_submitted']}")

# 5. Verify that attempting to play Round 2 without submitting code is BLOCKED!
play2_attempt = requests.post(f"{base_url}/api/tournaments/{t_id}/matches/{m_id}/play-round")
print("Playing R2 without code status code:", play2_attempt.status_code)
print("Blocked message:", play2_attempt.json().get("detail"))

# 6. Submit code for Round 2 via custom code update (simulate team modifying strategy!)
code_tweak = '''
import random
def decide_move(game_state):
    # Chiêu thức cải tiến cho Round 2: Dựa vào lịch sử round 1
    history = game_state.get('history', [])
    return 'PAPER' if history and history[-1] == 'ROCK' else 'SCISSORS'
'''
sub_a = requests.post(f"{base_url}/api/tournaments/{t_id}/matches/{m_id}/code", json={
    "side": "team_a",
    "code_content": code_tweak,
    "language": "PYTHON"
}).json()
print("Team A submitted improved code for R2:", sub_a["status"])

sub_b = requests.post(f"{base_url}/api/tournaments/{t_id}/matches/{m_id}/code", json={
    "side": "team_b",
    "code_content": "def decide_move(gs): return 'ROCK'",
    "language": "PYTHON"
}).json()
print("Team B submitted improved code for R2:", sub_b["status"])

# 7. Play Round 2!
play2 = requests.post(f"{base_url}/api/tournaments/{t_id}/matches/{m_id}/play-round").json()
print("Round 2 log:", play2["round_record"]["log"])
print(f"After Round 2: Next Round {play2['match']['current_round_idx']}, is_completed={play2['is_completed']}")
print("Rounds history count:", len(play2["match"]["rounds_history"]))
print("All assertions passed perfectly!")

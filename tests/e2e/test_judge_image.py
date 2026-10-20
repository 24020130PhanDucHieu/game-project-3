"""Smoke probe for the local hardened judge image, with fixture credentials only."""
import time
import requests

BASE = "http://127.0.0.1:55440"
headers = {"X-Worker-Token": "local-test-token"}
deadline = time.monotonic()+30
while True:
    try:
        health = requests.get(BASE+"/health", timeout=2)
        health.raise_for_status()
        break
    except requests.RequestException:
        if time.monotonic() >= deadline:
            raise
        time.sleep(.2)
assert health.headers["X-Arena-Release"] == "verification"
assert requests.post(BASE+"/mutate-tournament", json={}, timeout=5).status_code == 401
for code, expected in [("def decide_move(s): return 'ROCK'", True), ("def decide_move(:", False)]:
    response = requests.post(BASE+"/mutate-tournament", headers=headers, json={
        "action": "validate-code", "params": {"code_content": code, "language": "PYTHON"}
    }, timeout=30)
    assert response.status_code == 200, response.text
    assert response.json()["is_valid"] == expected, response.text
print("PASS read-only production judge image: health, release, authentication, valid and invalid bot")

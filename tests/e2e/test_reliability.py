"""Real gateway + Python worker + three isolated Chrome sessions.

Run after: cd backend && go build -o bin/arena-verification.exe ./cmd/server/main.go
Then: python tests/e2e/test_reliability.py
Only temporary local tournament data is mutated; hosted data is never changed.
"""
import json
import os
from pathlib import Path
import subprocess
import socket
import sys
import tempfile
import time

import requests
import random
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
BASE = "http://127.0.0.1:18081"
PASSWORD = "verification-organizer"
CODE = "def decide_move(game_state):\n    cards = game_state.get('remaining_cards', {})\n    return next((c for c, n in cards.items() if n > 0), 'ROCK')\n"
SERVER_BINARY = Path(os.environ.get("ARENA_TEST_SERVER", str(ROOT / "backend/bin/arena-verification.exe")))


def check(label):
    print("PASS " + label, flush=True)


class LocalArena:
    def __init__(self, directory):
        global BASE
        def available_port():
            for _ in range(100):
                with socket.socket() as listener:
                    try:
                        listener.bind(("127.0.0.1", random.randrange(30000, 60000)))
                        return listener.getsockname()[1]
                    except OSError:
                        continue
            raise RuntimeError("No browser-safe local port is available")
        self.worker_port = available_port()
        self.gateway_port = available_port()
        BASE = f"http://127.0.0.1:{self.gateway_port}"
        self.directory = Path(directory)
        self.processes = []
        self.env = dict(os.environ, ADMIN_PASSWORD=PASSWORD, SESSION_SECRET="verification-stable-key",
                        ENVIRONMENT="development", ENV="development", DATABASE_URL="", POSTGRES_URL="",
                        NEON_DATABASE_URL="", DB_PATH=str(self.directory / "tournaments.json"), PORT=str(self.gateway_port),
                        WORKER_URL=f"http://127.0.0.1:{self.worker_port}/mutate-tournament", CORS_ORIGIN=BASE,
                        PYTHONIOENCODING="utf-8")

    def start(self, command, cwd, name):
        output = open(self.directory / (name + ".log"), "ab")
        process = subprocess.Popen(command, cwd=cwd, env=self.env, stdout=output, stderr=output,
                                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        self.processes.append((process, output))
        return process

    def wait(self, url):
        deadline = time.monotonic() + 35
        while time.monotonic() < deadline:
            try:
                if requests.get(url, timeout=1).status_code == 200:
                    return
            except requests.RequestException:
                pass
            time.sleep(0.1)
        raise AssertionError("Local service failed to start: " + url)

    def start_gateway(self):
        self.gateway = self.start([str(SERVER_BINARY)], ROOT, "gateway")
        self.wait(BASE + "/health")

    def __enter__(self):
        try:
            self.start([sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(self.worker_port)], ROOT / "bot-runner", "worker")
            self.wait(f"http://127.0.0.1:{self.worker_port}/health")
            self.start_gateway()
            return self
        except Exception:
            self.__exit__()
            raise

    def restart_gateway(self):
        self.gateway.terminate()
        self.gateway.wait(timeout=10)
        self.start_gateway()

    def __exit__(self, *args):
        for process, output in reversed(self.processes):
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
            output.close()


def api(method, path, body=None, token=None, expected=200):
    headers = {"Authorization": "Bearer " + token} if token else {}
    response = requests.request(method, BASE + path, json=body, headers=headers, timeout=180)
    assert response.status_code == expected, (method, path, response.status_code, response.text[:500])
    return response.json()


def open_page(browser, errors, events):
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    page.on("pageerror", lambda error: errors.append(str(error)))
    def capture_frame(frame):
        try:
            event = json.loads(frame)
            if isinstance(event, dict):
                events.append(event)
        except (ValueError, TypeError):
            pass  # WebSocket control frames are not application events.
    page.on("websocket", lambda ws: ws.on("framereceived", capture_frame))
    page.goto(BASE)
    page.wait_for_function("window.arenaReady !== undefined")
    page.evaluate("() => window.arenaReady")
    return page


def login_page(page, username, password):
    page.locator("#btn-user-auth-action").click()
    page.locator("#inp-login-user").fill(username)
    page.locator("#inp-login-pass").fill(password)
    page.locator("#btn-login-submit").click()
    page.wait_for_function("currentAppRole !== 'GUEST'")
    page.wait_for_function("currentTournamentData !== null && currentTournamentData.tournament_id === currentTournamentId && document.getElementById('view-login').style.display === 'none'")


def tab(page, name):
    page.locator(f'.nav-tab-btn[data-tab="{name}"]').click()


def choose_tournament(page, name):
    tab(page, "tab-bracket")
    page.locator("#btn-open-tournament-list").click()
    row = page.locator("#tbody-bracket-tournament-list tr").filter(has_text=name)
    row.get_by_role("button", name="Chọn giải", exact=True).click()
    page.wait_for_function("document.getElementById('modal-tournament-list').style.display === 'none'")


def choose_match(page, mid):
    tab(page, "tab-bracket")
    page.locator(f'.bracket-match-node[data-match-id="{mid}"]').click()
    page.wait_for_function("document.getElementById('tab-match-arena').classList.contains('active')")
    page.wait_for_function("matchSocket && matchSocket.readyState === WebSocket.OPEN")


def submit_ui(page, code):
    page.locator("#studio-code-editor").fill(code)
    page.locator("#btn-studio-submit-bot").click()
    expect(page.locator("#studio-submission-status")).to_have_class("ide-status-tag submitted", timeout=15000)


def run(arena):
    api("POST", "/api/tournaments/create", {"name": "Unauthorized", "num_teams": 4}, expected=401)
    admin = api("POST", "/api/admin/login", {"username": "admin", "password": PASSWORD})["session_token"]
    assert api("GET", "/api/session", token=admin)["role"] == "ADMIN"
    cup = api("POST", "/api/tournaments/create", {"name": "Verification Cup", "num_teams": 4}, admin)["tournament"]
    tid = cup["tournament_id"]
    api("POST", "/api/tournaments/create", {"name": "Invalid Count", "num_teams": 6}, admin, expected=400)
    for n in range(4):
        sid = str(24099001 + n)
        result = api("POST", f"/api/tournaments/{tid}/teams", {"student_id": sid, "team_name": "Verify Team " + str(n + 1), "university": "Test"}, admin)
        assert result["team_access_code"] == "k69" + sid
        if n == 0:
            waiting = api("POST", "/api/teams/login", {"username":sid,"password":"k69" + sid})
            assert waiting["role"] == "TEAM" and waiting["match_id"] == "" and waiting["tournament_id"] == tid
    api("POST", f"/api/tournaments/{tid}/teams", {"student_id": "24099001", "team_name": "Duplicate", "university": "Test"}, admin, expected=400)
    cup = api("POST", f"/api/tournaments/{tid}/auto-schedule", token=admin)["tournament"]
    mid, match = next((k, m) for k, m in cup["matches"].items() if m.get("team_a") and m.get("team_b"))
    other_mid = next(k for k, m in cup["matches"].items() if k != mid and m.get("team_a"))
    sid_a, sid_b = match["team_a"]["student_id"], match["team_b"]["student_id"]
    second = api("POST", "/api/tournaments/create", {"name": "Unrelated Cup", "num_teams": 4}, admin)["tournament"]["tournament_id"]
    check("create, capacity/duplicate validation, fixed passwords, and bracket scheduling")

    api("POST", "/api/teams/login", {"username": sid_a, "password": "incorrect"}, expected=401)
    auth_a = api("POST", "/api/teams/login", {"username": sid_a, "password": "k69" + sid_a})["session_token"]
    api("POST", f"/api/tournaments/{tid}/matches/{other_mid}/select", token=auth_a, expected=403)
    api("DELETE", f"/api/tournaments/{second}", token=auth_a, expected=403)
    assert api("GET", "/api/session", token=auth_a)["role"] == "TEAM"
    api("POST", f"/api/tournaments/{tid}/matches/{mid}/play-round", token=admin, expected=400)
    check("global team login, forbidden other match/delete, and start readiness guard")

    errors, events = [], []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        admin_page = open_page(browser, errors, events)
        login_page(admin_page, "admin", PASSWORD)
        tab(admin_page, "tab-match-arena")
        assert admin_page.locator("#tab-bracket").evaluate("e => e.classList.contains('active')"), (admin_page.evaluate("({active:document.querySelector('.tab-pane.active')?.id, role:currentAppRole, match:currentActiveMatchId, selected:sessionStorage.getItem('matchExplicitlySelected')})"), errors)
        choose_tournament(admin_page, "Verification Cup")
        choose_match(admin_page, mid)
        assert admin_page.evaluate("currentActiveMatchId") == mid
        assert admin_page.evaluate("currentTournamentId") == tid
        expect(admin_page.locator("#arena-name-red")).to_have_text(match["team_a"]["team_name"])
        assert "RedBot" not in admin_page.locator("#bracket-tree-canvas").inner_text()
        check("real bracket click opens the exact match for Admin; future slots contain no demo teams")

        team_a = open_page(browser, errors, events)
        login_page(team_a, sid_a, "k69" + sid_a)
        assert team_a.evaluate("currentTournamentId") == tid
        tab(team_a, "tab-match-arena")
        assert team_a.locator("#tab-bracket").evaluate("e => e.classList.contains('active')")
        choose_match(team_a, mid)
        team_a.locator("#studio-code-editor").fill(CODE)
        expect(admin_page.locator("#monitor-code-a")).to_have_text(CODE, timeout=1800)
        assert any(event.get("action") == "draft-code" and event.get("tournament_id") == tid for event in events)
        check("Team enters without choosing a tournament; draft reaches Admin by websocket")

        tab(team_a, "tab-ranking")
        tab(team_a, "tab-match-arena")
        expect(team_a.locator("#studio-code-editor")).to_have_value(CODE)
        team_a.reload()
        team_a.evaluate("() => window.arenaReady")
        assert team_a.evaluate("currentAppRole") == "TEAM"
        assert team_a.evaluate("currentActiveMatchId") == mid
        expect(team_a.locator("#studio-code-editor")).to_have_value(CODE)
        check("draft, selected match, selected tab and Team login survive tab changes and F5")

        team_a.locator("#studio-code-editor").fill("def decide_move(game_state):\n    syntax error ???")
        team_a.locator("#btn-studio-dryrun").click()
        expect(team_a.locator(".toast-title").filter(has_text="Mã không hợp lệ")).to_be_visible(timeout=10000)
        check("dry-run uses the real sandbox and rejects a syntax error")
        submit_ui(team_a, CODE)
        expect(admin_page.locator("#sub-state-red")).to_have_text("Đã nộp code", timeout=1800)
        expect(admin_page.locator("#btn-arena-start-match")).to_be_disabled()
        assert any(event.get("action") == "code" for event in events)
        check("submission reaches Admin immediately, and one submission does not unlock start")

        team_b = open_page(browser, errors, events)
        login_page(team_b, sid_b, "k69" + sid_b)
        choose_match(team_b, mid)
        submit_ui(team_b, CODE)
        expect(admin_page.locator("#btn-arena-start-match")).to_be_enabled(timeout=1800)
        expect(admin_page.locator("#sub-state-blue")).to_have_text("Đã nộp code")
        check("two valid submissions unlock Admin start in realtime")

        # Server restart, with no password resubmission in any browser.
        arena.restart_gateway()
        for page, role in [(admin_page, "ADMIN"), (team_a, "TEAM"), (team_b, "TEAM")]:
            page.reload()
            page.evaluate("() => window.arenaReady")
            assert page.evaluate("currentAppRole") == role
            assert page.evaluate("currentActiveMatchId") == mid
        expect(team_a.locator("#studio-code-editor")).to_have_value(CODE)
        assert len(api("GET", f"/api/tournaments/{tid}", token=admin)["matches"][mid]["submissions_history"]) == 2
        check("signed sessions and persisted submissions survive a gateway restart")

        # Leave Admin on another tab while the round is run from its session.
        tab(admin_page, "tab-admin-console")
        result = api("POST", f"/api/tournaments/{tid}/matches/{mid}/play-round", token=admin)
        assert result["round_record"]["board_steps"]
        team_a.wait_for_function("currentMatchData && currentMatchData.rounds_history.length === 1", timeout=1800)
        team_b.wait_for_function("currentMatchData && currentMatchData.rounds_history.length === 1", timeout=1800)
        team_a.wait_for_function("currentMatchData.current_round_idx === 2", timeout=9000)
        team_b.wait_for_function("currentMatchData.current_round_idx === 2", timeout=1800)
        admin_page.wait_for_function("currentTournamentData.matches[currentActiveMatchId].current_round_idx === 2", timeout=1800)
        check("round result and automatic next round synchronize even when Admin is on another tab")
        current = api("GET", f"/api/tournaments/{tid}", token=admin)["matches"][mid]
        node = team_a.locator(f'.bracket-match-node[data-match-id="{mid}"]')
        expect(node.locator(".node-score").nth(0)).to_have_text(str(current["team_a"]["rounds_won"]))
        expect(node.locator(".node-score").nth(1)).to_have_text(str(current["team_b"]["rounds_won"]))
        api("POST", f"/api/tournaments/{tid}/auto-schedule", token=admin, expected=400)
        api("DELETE", f"/api/tournaments/{tid}/teams/{sid_a}", token=admin, expected=400)
        assert api("GET", f"/api/tournaments/{tid}", token=admin)["matches"][mid]["current_round_idx"] == 2
        check("an active tournament cannot be accidentally reseeded or lose teams/results")
        tab(admin_page, "tab-match-arena")
        expect(admin_page.locator("#btn-arena-start-match")).to_be_disabled()
        expect(team_a.locator("#studio-code-editor")).to_have_value(CODE)
        submit_ui(team_a, CODE)
        check("the next round requires fresh code, without requiring a new login")

        team_a.locator("#btn-playback-step-prev").click()
        playback = team_a.locator("#playback-step-indicator").inner_text()
        log_button = team_a.locator(".log-tab-btn").last
        log_button.click()
        log_id = log_button.get_attribute("data-log-tab")
        tab(team_a, "tab-guide")
        tab(team_a, "tab-match-arena")
        expect(team_a.locator("#playback-step-indicator")).to_have_text(playback)
        assert team_a.locator(".log-tab-btn.active").get_attribute("data-log-tab") == log_id
        team_a.reload()
        team_a.evaluate("() => window.arenaReady")
        expect(team_a.locator("#playback-step-indicator")).to_have_text(playback)
        assert team_a.locator(".log-tab-btn.active").get_attribute("data-log-tab") == log_id
        check("replay position and log tab survive background updates, tab changes and F5")

        history_panel = team_a.locator("details").filter(has=team_a.locator("#tbody-round-history"))
        history_panel.locator("summary").click()
        team_a.locator("#tbody-round-history .btn-view-round-code").first.click()
        expect(team_a.locator("#code-viewer-box")).to_contain_text(CODE)
        team_a.locator("#btn-close-view-code-x").click()
        team_a.locator("#tbody-round-history .btn-replay-round").first.click()
        team_a.locator("#replay-step-slider").press("ArrowRight")
        saved_step = team_a.locator("#replay-step-indicator").inner_text()
        team_a.locator("#btn-close-replay-x").click()
        team_a.locator("#tbody-round-history .btn-replay-round").first.click()
        expect(team_a.locator("#replay-step-indicator")).to_have_text(saved_step)
        team_a.locator("#btn-close-replay-x").click()
        check("round source viewer and replay modal work and preserve the selected step")

        cpp = '#include <iostream>\nint main() { std::cout << "ROCK" << std::endl; }'
        assert api("POST", "/api/bots/validate", {"code_content":cpp,"language":"CPP"}, admin)["is_valid"]
        practice = api("POST", f"/api/tournaments/{tid}/practice-match", {"code_content":CODE,"language":"PYTHON","side":"team_a","boss":"RANDOM"})
        assert practice["board_steps"]
        check("real local C++ validation and Python practice battle")

        # Delete through the actual list modal, while another tournament stays open.
        tab(admin_page, "tab-bracket")
        admin_page.locator("#btn-open-tournament-list").click()
        row = admin_page.locator("#tbody-bracket-tournament-list tr").filter(has_text="Unrelated Cup")
        row.get_by_role("button", name="Xóa giải", exact=True).click()
        admin_page.locator('#app-action-dialog .app-action-submit').click()
        expect(admin_page.locator("#tbody-bracket-tournament-list tr").filter(has_text="Unrelated Cup")).to_have_count(0)
        api("GET", f"/api/tournaments/{second}", expected=404)
        assert admin_page.evaluate("currentTournamentId") == tid
        admin_page.locator("#modal-tournament-list").get_by_role("button", name="Đóng hộp thoại", exact=True).click()
        check("real Delete button deletes the selected list row and preserves another open bracket")

        # Complete all three matches, including winner propagation and final champion.
        pending = True
        while pending:
            tournament = api("GET", f"/api/tournaments/{tid}", token=admin)
            pending = not bool(tournament.get("champion"))
            if not pending:
                break
            next_id, next_match = next((k, m) for k, m in tournament["matches"].items()
                                      if m.get("team_a") and m.get("team_b") and m["status"] != "COMPLETED")
            if next_match["round_status"] == "ROUND_FINISHED":
                api("POST", f"/api/tournaments/{tid}/matches/{next_id}/next-round", token=admin)
                continue
            if next_id == "m_gf" and next_match["current_round_idx"] == 1:
                assert not next_match["team_a"]["code_valid"] and not next_match["team_b"]["code_valid"]
            for side in ("team_a", "team_b"):
                api("POST", f"/api/tournaments/{tid}/matches/{next_id}/code",
                    {"side": side, "code_content": CODE, "language": "PYTHON", "round_number": next_match["current_round_idx"]}, admin)
            api("POST", f"/api/tournaments/{tid}/matches/{next_id}/play-round", token=admin)
        assert len([m for m in tournament["matches"].values() if m["status"] == "COMPLETED"]) == 3
        assert tournament["status"] == "FINISHED"
        check("complete four-team tournament, winner propagation and final champion")

        # Completed matches reject new submissions, and restricted reads hide sources.
        api("POST", f"/api/tournaments/{tid}/matches/{mid}/code", {"side":"team_a", "code_content":CODE}, admin, expected=400)
        public = api("GET", f"/api/tournaments/{tid}")
        assert "current_code" not in public["matches"][mid]["team_a"]
        assert "credential_hash" not in public["teams"][0]
        assert api("GET", f"/api/tournaments/{tid}/matches/{mid}/replay/1")["board_steps"]
        assert api("GET", f"/api/tournaments/{tid}/matches/{mid}/submissions", token=admin)
        assert api("GET", "/api/ranking")
        check("completed-match guard, replay, submissions, ranking and source privacy")

        # Current tournament deletion invalidates all clients, including the team's selection.
        api("DELETE", f"/api/tournaments/{tid}", token=admin)
        team_a.wait_for_function("currentTournamentId === null && currentActiveMatchId === null", timeout=4000)
        assert api("GET", "/api/tournaments/list") == []
        api("POST", "/api/logout", token=admin)
        api("GET", "/api/session", token=admin, expected=401)
        assert not errors, errors
        check("active tournament deletion, empty-state recovery, logout and zero browser exceptions")
        browser.close()


def main():
    (ROOT / "data").mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="arena-verification-", dir=ROOT / "data") as directory:
        with LocalArena(directory) as arena:
            run(arena)
    print("ALL RELIABILITY SCENARIOS PASSED", flush=True)


if __name__ == "__main__":
    main()

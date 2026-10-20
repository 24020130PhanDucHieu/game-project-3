"""Real gateway + two Python judges; isolated temporary data, never hosted data."""
import concurrent.futures
import socket
import sys
import tempfile
import time

import requests
import test_reliability as arena


def run(server):
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        second_port = listener.getsockname()[1]
    server.start([sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1",
                  "--port", str(second_port)], arena.ROOT/"bot-runner", "second-judge")
    server.wait(f"http://127.0.0.1:{second_port}/health")
    server.env.update(WORKER_URLS=f"http://127.0.0.1:{server.worker_port}/mutate-tournament,"
                                 f"http://127.0.0.1:{second_port}/mutate-tournament",
                      WORKER_CONCURRENCY="1", JUDGE_CONCURRENCY="2",
                      VALIDATION_WORKERS="4", QUALIFIER_WORKERS="4")
    server.restart_gateway()
    admin = arena.api("POST", "/api/admin/login", {"password": arena.PASSWORD})["session_token"]
    event = arena.api("POST", "/api/qualifiers", {
        "name": "Two real judges", "deadline": time.time()+600, "rounds": 1, "top_k": 8}, admin)
    qid = event["id"]
    tokens = []
    for i in range(8):
        sid = str(28890000+i)
        arena.api("POST", "/api/teams/register",
                  {"student_id": sid, "team_name": "Pool "+sid, "password": "fixture123"}, expected=201)
        token = arena.api("POST", "/api/teams/login",
                          {"username": sid, "password": "fixture123"})["session_token"]
        arena.api("POST", f"/api/qualifiers/{qid}/register", token=token)
        tokens.append(token)

    def submit(token):
        response = requests.post(arena.BASE+f"/api/qualifiers/{qid}/submissions",
            headers={"Authorization": "Bearer "+token, "X-Submission-Id": "pool-receipt"},
            json={"code": arena.CODE, "language": "PYTHON"}, timeout=20)
        assert response.status_code == 202, response.text
        return response.json()["id"]

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        receipts = list(pool.map(submit, tokens))
    # Lose a judge while work may still be running. Other judge must finish it.
    first = server.processes[0][0]
    first.terminate()
    first.wait(timeout=10)
    deadline = time.monotonic()+90
    while time.monotonic() < deadline:
        details = [arena.api("GET", f"/api/qualifiers/{qid}", token=t) for t in tokens]
        if all(d["participant"].get("valid_id") == receipt for d, receipt in zip(details, receipts)):
            break
        time.sleep(.5)
    assert all(d["participant"].get("valid_id") == receipt for d, receipt in zip(details, receipts)), details
    assert all(len(d["history"]) == 1 for d in details)
    arena.api("POST", f"/api/qualifiers/{qid}/actions/freeze", token=admin)
    arena.api("POST", f"/api/qualifiers/{qid}/actions/start", token=admin)
    deadline = time.monotonic()+120
    while time.monotonic() < deadline:
        detail = arena.api("GET", f"/api/qualifiers/{qid}", token=tokens[0])
        if detail["event"]["status"] == "FINISHED":
            break
        time.sleep(.5)
    assert detail["event"]["status"] == "FINISHED", detail
    assert detail["event"]["completed"] == 4, detail
    before = [arena.api("GET", f"/api/qualifiers/{qid}", token=t)["participant"] for t in tokens]
    assert sum(p["played"] for p in before) == 8
    assert sum(p["wins"] for p in before) == 4
    server.restart_gateway()
    after = [arena.api("GET", f"/api/qualifiers/{qid}", token=t)["participant"] for t in tokens]
    assert [(p["elo"], p["wins"], p["played"]) for p in before] == [
        (p["elo"], p["wins"], p["played"]) for p in after]
    for token, receipt in zip(tokens, receipts):
        assert submit(token) == receipt
    arena.check("two real judges; concurrent durable receipts; one judge lost; games finish; restart preserves ratings and receipts")


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="arena-multi-worker-") as directory:
        server = arena.LocalArena(directory)
        server.env.update(WORKER_TOKEN="local-fixture-token", WORKER_CAPACITY="1")
        with server:
            run(server)

"""Real durable acceptance while worker is down, gateway restart and recovery."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time

import requests
import test_reliability as arena


def run(server):
    admin = arena.api('POST', '/api/admin/login', {'password': arena.PASSWORD})['session_token']
    event = arena.api('POST', '/api/qualifiers', {'name': 'Recovery drill', 'deadline': time.time()+600,
                                               'rounds': 1, 'top_k': 8}, admin)
    qid = event['id']
    tokens = []
    for index in range(3):
        sid = str(28880000+index)
        arena.api('POST', '/api/teams/register', {'student_id': sid, 'team_name': 'Recovery '+sid,
                                                'password': 'queue123'}, expected=201)
        token = arena.api('POST', '/api/teams/login', {'username': sid, 'password': 'queue123'})['session_token']
        arena.api('POST', f'/api/qualifiers/{qid}/register', token=token)
        tokens.append(token)
    worker = server.processes[0][0]
    worker.terminate()
    worker.wait(timeout=10)
    payload = {'code': arena.CODE, 'language': 'PYTHON'}
    headers = {'Authorization': 'Bearer '+tokens[0], 'X-Submission-Id': 'durable-drill'}
    endpoint = arena.BASE+f'/api/qualifiers/{qid}/submissions'
    response = requests.post(endpoint, headers=headers, json=payload, timeout=15)
    assert response.status_code == 202, response.text
    receipt = response.json()
    assert receipt['status'] == 'QUEUED'
    assert requests.get(arena.BASE+'/ready', timeout=10).status_code == 503
    server.restart_gateway()
    again = requests.post(endpoint, headers=headers, json=payload, timeout=15)
    assert again.status_code == 202 and again.json()['id'] == receipt['id'], again.text
    detail = arena.api('GET', f'/api/qualifiers/{qid}', token=tokens[0])
    assert len(detail['history']) == 1 and not detail['participant'].get('valid_id'), detail
    arena.api('POST', f'/api/qualifiers/{qid}/actions/freeze', token=admin)
    detail = arena.api('GET', f'/api/qualifiers/{qid}', token=tokens[0])
    assert detail['event']['status'] == 'CLOSING', detail
    server.start([sys.executable, '-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', str(server.worker_port)],
                 arena.ROOT/'bot-runner', 'worker-recovered')
    server.wait(f'http://127.0.0.1:{server.worker_port}/health')
    deadline = time.monotonic()+75
    while time.monotonic()<deadline:
        detail = arena.api('GET', f'/api/qualifiers/{qid}', token=tokens[0])
        if detail['event']['status'] == 'LOCKED':
            break
        time.sleep(.5)
    assert detail['event']['status'] == 'LOCKED', detail
    assert detail['participant']['locked_id'] == receipt['id'] and detail['history'][0]['valid'], detail
    assert requests.get(arena.BASE+'/ready',timeout=10).status_code == 200
    arena.api('POST', f'/api/qualifiers/{qid}/actions/reopen',
              {'deadline': event['deadline']+3600, 'reason': 'Staging worker outage drill'}, admin)
    reopened = arena.api('GET', f'/api/qualifiers/{qid}', token=tokens[0])
    assert reopened['event']['status'] == 'OPEN' and not reopened['participant'].get('locked_id'), reopened
    assert reopened['participant']['valid_id'] == receipt['id'], reopened
    arena.check('durable receipt with worker down; gateway restart; deduplication; freeze waits; worker recovers; fair deadline extension')

    sessions = server.directory/'staging.load-sessions.json'
    source = server.directory/'load-bot.py'
    sessions.write_text(json.dumps(tokens), encoding='utf-8')
    source.write_text(arena.CODE, encoding='utf-8')
    result = subprocess.run([sys.executable, str(arena.ROOT/'tests/load/qualifier_submissions.py'), '--base', arena.BASE,
                             '--qualifier', qid, '--sessions-file', str(sessions), '--code-file', str(source),
                             '--concurrency', '3', '--verdict-timeout', '60'], capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, result.stdout+result.stderr
    report = json.loads(result.stdout)
    assert report['results'] == {'VALID': 3}, report
    print('PASS load harness smoke (3 teams, not a capacity benchmark): '+result.stdout, flush=True)


if __name__ == '__main__':
    (arena.ROOT/'data').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='arena-queue-drill-', dir=arena.ROOT/'data') as directory:
        with arena.LocalArena(directory) as server:
            run(server)

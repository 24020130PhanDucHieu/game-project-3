"""Read-only release audit. Run beside runtime_inspect.py as root on the gateway."""
import hashlib
import json
from pathlib import Path
import urllib.request
from runtime_inspect import process_env, query

values = process_env()
base = 'http://127.0.0.1:' + values.get('PORT', '8080')
def api(path, payload=None, token=None):
    headers = {'Content-Type':'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(base+path, data=json.dumps(payload).encode() if payload is not None else None, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.load(response)

report = {}
report['active_main_battles'] = int(query(values,"SELECT count(*) FROM tournaments t CROSS JOIN LATERAL jsonb_each(COALESCE(t.data->'matches','{}'::jsonb)) m WHERE m.value->>'round_status'='BATTLE_RUNNING'"))
report['active_qualifiers'] = int(query(values,"SELECT count(*) FROM arena_qualifier_records WHERE key LIKE 'event:%' AND data->>'status' IN ('RUNNING','CLOSING')"))
report['pending_validations'] = int(query(values,"SELECT count(*) FROM arena_qualifier_records WHERE key LIKE 'validation:%' AND data->>'status' IN ('QUEUED','RUNNING')"))
token = api('/api/admin/login', {'password':values['ADMIN_PASSWORD']})['session_token']
monitor = api('/api/admin/monitoring', token=token)
report['database'] = monitor.get('database')
report['queue'] = monitor.get('queue')
pool = monitor.get('worker_pool', {})
report['workers'] = {k:pool.get(k) for k in ('status','ready','total','inflight','capacity')}
report['nodes'] = [{k:n.get(k) for k in ('name','status','capacity','active','dispatched','finished','qualifier_games','avg_duration_ms','release')} for n in pool.get('nodes',[])]
report['hashes'] = {p:hashlib.sha256((Path('/opt/arena/app')/p).read_bytes()).hexdigest() for p in ('server','bot-runner/main.py','bot-runner/app/repository/database.py')}
print(json.dumps(report,indent=2))

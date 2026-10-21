"""Read-only capacity probe; deliberately print only non-secret settings."""
import json
import subprocess
from pathlib import Path

def settings(unit):
    pid = subprocess.check_output(['systemctl','show',unit,'-p','MainPID','--value'],text=True).strip()
    if pid == '0':
        return {'running':False}
    env = dict(x.decode().split('=',1) for x in Path('/proc/'+pid+'/environ').read_bytes().split(b'\0') if b'=' in x)
    keys = ['JUDGE_CONCURRENCY','WORKER_CONCURRENCY','QUALIFIER_WORKERS','VALIDATION_WORKERS','WORKER_CAPACITY','WORKER_RELEASE']
    report = {key:env.get(key,'unset') for key in keys}
    report['worker_count'] = len([u for u in env.get('WORKER_URLS','').split(',') if u.strip()])
    report['limits'] = subprocess.check_output(['systemctl','show',unit,'-p','MemoryCurrent','-p','MemoryMax','-p','CPUQuotaPerSecUSec','-p','NRestarts'],text=True).splitlines()
    return report

print(json.dumps({'api':settings('arena-api'),'worker':settings('arena-worker'),
                  'memory':Path('/proc/meminfo').read_text().splitlines()[:4],
                  'load':Path('/proc/loadavg').read_text().strip()},indent=2))

"""Read-only deployment preflight. Never emits process secrets."""
import json
import os
from pathlib import Path
import subprocess
import urllib.request
import urllib.error
from urllib.parse import urlparse, unquote, parse_qs

def process_env():
    pid = subprocess.check_output(['systemctl','show','-p','MainPID','--value','arena-api'],text=True).strip()
    raw = Path('/proc/'+pid+'/environ').read_bytes()
    return dict(entry.decode().split('=',1) for entry in raw.split(b'\0') if b'=' in entry)

def pg_env(values):
    u = urlparse(values.get('DATABASE_URL') or values.get('POSTGRES_URL') or values.get('NEON_DATABASE_URL') or '')
    if not u.hostname:
        raise RuntimeError('No PostgreSQL URL configured')
    return dict(PATH=os.environ.get('PATH','/usr/bin:/bin'),PGHOST=u.hostname,PGPORT=str(u.port or 5432),PGUSER=unquote(u.username or ''),PGPASSWORD=unquote(u.password or ''),PGDATABASE=unquote(u.path.lstrip('/')),PGSSLMODE=parse_qs(u.query).get('sslmode',['require'])[0],PGCONNECT_TIMEOUT='10')

def query(values,sql):
    result = subprocess.run(['psql','-X','-A','-t','-v','ON_ERROR_STOP=1','-c',sql],env=pg_env(values),capture_output=True,text=True,timeout=30)
    if result.returncode:
        raise RuntimeError('Read-only SQL preflight failed')
    return result.stdout.strip()

if __name__=='__main__':
    values=process_env()
    report={'postgres_version':query(values,'SHOW server_version')}
    report['active_main_battles']=int(query(values,"SELECT count(*) FROM tournaments t CROSS JOIN LATERAL jsonb_each(COALESCE(t.data->'matches','{}'::jsonb)) m WHERE m.value->>'round_status'='BATTLE_RUNNING'"))
    try:
        request=urllib.request.Request('http://169.254.169.254/latest/api/token',method='PUT',headers={'X-aws-ec2-metadata-token-ttl-seconds':'60'})
        token=urllib.request.urlopen(request,timeout=3).read().decode()
        request=urllib.request.Request('http://169.254.169.254/latest/meta-data/iam/security-credentials/',headers={'X-aws-ec2-metadata-token':token})
        report['iam_role_names']=urllib.request.urlopen(request,timeout=3).read().decode().splitlines()
    except urllib.error.HTTPError as error:
        report['iam_role_names']=[]
        report['metadata_status']=error.code
    except Exception:
        report['iam_role_names']=[]
        report['metadata_status']='unavailable'
    print(json.dumps(report,indent=2))

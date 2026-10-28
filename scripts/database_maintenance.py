"""Bounded cleanup of disposable records. Preview by default; --apply deletes.

Never deletes submissions, jobs, replays, receipts, tournaments or audit logs.
Uses one connection/transaction, a nonblocking advisory lock and short SQL limits.
"""
import argparse
import json
import os
import subprocess
from urllib.parse import urlsplit, unquote, parse_qs


RESET_PREDICATE = "expires_at < now() - interval '1 day'"
# CASE protects casts from malformed legacy JSON, regardless of planner ordering.
RECORD_PREDICATE = """(
 (key LIKE 'aicache:%' AND
  CASE WHEN data->>'at' ~ '^[0-9]{1,12}$' THEN (data->>'at')::bigint END
    < extract(epoch FROM now() - interval '2 days'))
 OR (key LIKE 'adminotp:%' AND
  CASE WHEN data->>'expires_at' ~ '^[0-9]{1,12}$' THEN (data->>'expires_at')::bigint END
    < extract(epoch FROM now() - interval '1 day'))
 OR (key ~ '^(aiq:.+:|aitok:)[0-9]{8}$' AND
  right(key,8) < to_char((now() AT TIME ZONE 'Asia/Ho_Chi_Minh') - interval '30 days','YYYYMMDD'))
)"""


def maintenance_sql(apply=False):
    # One bounded batch per table per run; additional backlog waits for next run.
    # SKIP LOCKED leaves records currently updated by the application alone.
    queries = []
    for table, predicate in [('arena_password_resets', RESET_PREDICATE),
                              ('arena_qualifier_records', RECORD_PREDICATE)]:
        if apply:
            queries.append(f"""WITH removed AS (
 DELETE FROM public.{table} WHERE ctid IN (
  SELECT ctid FROM public.{table} WHERE {predicate}
  LIMIT 500 FOR UPDATE SKIP LOCKED
 ) RETURNING 1)
 SELECT json_build_object('table','{table}','deleted',count(*)) FROM removed;""")
        else:
            queries.append(f"SELECT json_build_object('table','{table}','eligible',count(*)) FROM public.{table} WHERE {predicate};")
    return """BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
SET LOCAL idle_in_transaction_session_timeout = '15s';
DO $$ BEGIN
 IF NOT pg_try_advisory_xact_lock(724615902362) THEN
  RAISE EXCEPTION 'maintenance already running';
 END IF;
END $$;
""" + '\n'.join(queries) + '\nCOMMIT;'


def connection_env():
    u = urlsplit(os.environ.get('DATABASE_URL', ''))
    if u.scheme not in ('postgres', 'postgresql') or not u.hostname or not u.username:
        raise ValueError('Valid DATABASE_URL required')
    return {'PATH': os.environ.get('PATH', '/usr/bin:/bin'),
            'PGHOST': u.hostname, 'PGPORT': str(u.port or 5432),
            'PGUSER': unquote(u.username), 'PGPASSWORD': unquote(u.password or ''),
            'PGDATABASE': unquote(u.path.lstrip('/')), 'PGCONNECT_TIMEOUT': '8',
            'PGSSLMODE': parse_qs(u.query).get('sslmode', ['require'])[0],
            'PGAPPNAME': 'arena-maintenance'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    try:
        result = subprocess.run(['psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'],
                                input=maintenance_sql(args.apply), env=connection_env(),
                                capture_output=True, text=True, timeout=25)
        if result.returncode:
            # Database errors may echo SQL/connection details; return no secrets.
            raise RuntimeError('Database maintenance failed; transaction rolled back')
        report = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
        print(json.dumps({'mode': 'apply' if args.apply else 'preview', 'results': report}))
        return 0
    except (ValueError, RuntimeError, OSError, subprocess.TimeoutExpired) as exc:
        print(json.dumps({'status': 'FAILED', 'error_type': type(exc).__name__}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())

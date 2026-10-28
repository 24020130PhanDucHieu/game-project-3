"""Optional real-PostgreSQL fixture; all tables are TEMP, everything rolls back.

Set ARENA_MAINTENANCE_TEST_DATABASE_URL to run. No production rows are accessed.
"""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('maintenance', ROOT / 'scripts/database_maintenance.py')
maintenance = importlib.util.module_from_spec(spec)
spec.loader.exec_module(maintenance)


def fixture_sql():
    setup = """
CREATE TEMP TABLE arena_password_resets (expires_at timestamptz);
INSERT INTO arena_password_resets VALUES (now()-interval '2 days'),(now()+interval '1 day'),(now()-interval '1 hour');
CREATE TEMP TABLE arena_qualifier_records (key text PRIMARY KEY, data jsonb);
INSERT INTO arena_qualifier_records VALUES
 ('aicache:expired',jsonb_build_object('at',extract(epoch FROM now()-interval '3 days')::bigint)),
 ('adminotp:expired',jsonb_build_object('expires_at',extract(epoch FROM now()-interval '2 days')::bigint)),
 ('aiq:team:20000101','{"used":30}'),
 ('aitok:20000101','{"used":1000}'),
 ('aicache:bad','{"at":"invalid"}'),
 ('aicache:missing','{}'),
 ('aicache:future',jsonb_build_object('at',extract(epoch FROM now()+interval '1 day')::bigint)),
 ('adminotp:active',jsonb_build_object('expires_at',extract(epoch FROM now()+interval '1 hour')::bigint)),
 ('submission:keep','{"at":1,"created_at":"2000-01-01"}'),
 ('job:keep','{"at":1,"status":"DONE"}'),
 ('audit:keep','{"at":1}'),
 ('adminowner','{"at":1}'),
 ('aiq:team:20990101','{"used":30}');
"""
    checks = """
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_temp.arena_password_resets) <> 2 THEN RAISE EXCEPTION 'active/recent tokens changed'; END IF;
 IF (SELECT count(*) FROM pg_temp.arena_qualifier_records) <> 9 THEN RAISE EXCEPTION 'protected records changed or expired records retained'; END IF;
END $$;
"""
    batch = """
INSERT INTO pg_temp.arena_qualifier_records SELECT 'aicache:old-'||i, jsonb_build_object('at',extract(epoch FROM now()-interval '3 days')::bigint) FROM generate_series(1,1001) i;
"""
    second = maintenance.maintenance_sql(True).replace('public.', 'pg_temp.').replace('BEGIN;', '', 1).replace('COMMIT;', """
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_temp.arena_qualifier_records WHERE key LIKE 'aicache:old-%') <> 501 THEN RAISE EXCEPTION 'batch limit failed'; END IF;
END $$;
ROLLBACK;
""")
    return maintenance.maintenance_sql(True).replace('public.', 'pg_temp.').replace('BEGIN;', 'BEGIN;\n'+setup, 1).replace('COMMIT;', checks+batch+second)


@unittest.skipUnless(os.environ.get('ARENA_MAINTENANCE_TEST_DATABASE_URL'), 'PostgreSQL test URL not set')
class DatabaseMaintenanceTests(unittest.TestCase):
    def test_real_predicates_preserve_active_and_business_records(self):
        with patch.dict(os.environ, {'DATABASE_URL': os.environ['ARENA_MAINTENANCE_TEST_DATABASE_URL']}):
            result = subprocess.run(['psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],
                                    input=fixture_sql(), env=maintenance.connection_env(),
                                    capture_output=True,text=True,timeout=30)
        self.assertEqual(result.returncode,0,'Database fixture failed')
        counts=[json.loads(line)['deleted'] for line in result.stdout.splitlines() if line.strip()]
        self.assertEqual(counts,[1,4,0,500])


if __name__ == '__main__':
    unittest.main()

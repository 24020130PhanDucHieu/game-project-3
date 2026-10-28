import hashlib
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('backup_retention', ROOT / 'scripts/postgres_backup_restore_drill.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class BackupRetentionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def add_backup(self, name, rank):
        path = self.root / name
        path.write_bytes(b'fixture backup')
        path.with_suffix('.sha256').write_text(hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + name)
        os.utime(path, (1700000000 + rank, 1700000000 + rank))
        return path

    def test_both_producers_and_manual_archive_preserved(self):
        old = self.add_backup('20261020T030000123456Z.dump', 1)
        latest = self.add_backup('arena-20261021T030000Z.dump', 2)
        manual = self.add_backup('pre-migration-20261019T000000Z.dump', 0)
        partial = self.root / '20261022T030000Z.partial'
        partial.write_text('in progress')
        self.assertEqual(backup.cleanup_old_backups(str(self.root), 1, dry_run=True), [old.name])
        self.assertTrue(old.exists())
        backup.cleanup_old_backups(str(self.root), 1)
        self.assertFalse(old.exists())
        self.assertFalse(old.with_suffix('.sha256').exists())
        self.assertTrue(latest.exists() and manual.exists() and partial.exists())

    def test_corrupt_latest_stops_all_deletion(self):
        old = self.add_backup('20261020T030000Z.dump', 1)
        latest = self.add_backup('20261021T030000Z.dump', 2)
        latest.write_bytes(b'broken')
        with self.assertRaises(RuntimeError):
            backup.cleanup_old_backups(str(self.root), 1)
        self.assertTrue(old.exists())

    def test_missing_checksum_and_invalid_keep_count(self):
        old = self.add_backup('20261020T030000Z.dump', 1)
        latest = self.add_backup('20261021T030000Z.dump', 2)
        latest.with_suffix('.sha256').unlink()
        with self.assertRaises(RuntimeError): backup.cleanup_old_backups(str(self.root), 1)
        with self.assertRaises(ValueError): backup.cleanup_old_backups(str(self.root), 0)
        self.assertTrue(old.exists())


if __name__ == '__main__':
    unittest.main()

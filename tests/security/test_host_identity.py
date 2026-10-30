import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'bot-runner'))
from app.host_identity import host_provider


class HostIdentityTests(unittest.TestCase):
    def tearDown(self):
        host_provider.cache_clear()

    def test_ec2_detected_and_cached(self):
        with patch('app.host_identity.Path.read_text', return_value='Amazon EC2\n') as read:
            self.assertEqual(host_provider(), 'AWS EC2')
            self.assertEqual(host_provider(), 'AWS EC2')
            read.assert_called_once()

    def test_unknown_vendor_not_labeled_aws(self):
        with patch('app.host_identity.Path.read_text', return_value='Other hypervisor'):
            self.assertIsNone(host_provider())

    def test_missing_metadata_does_not_break_health(self):
        with patch('app.host_identity.Path.read_text', side_effect=PermissionError):
            self.assertIsNone(host_provider())

    def test_oracle_micro_detected_from_local_cloud_init(self):
        with patch('app.host_identity.Path.read_text', side_effect=['QEMU\n', 'oracle\n']):
            self.assertEqual(host_provider(), 'Oracle Cloud')

    def test_generic_qemu_without_oracle_datasource_is_unknown(self):
        with patch('app.host_identity.Path.read_text', side_effect=['QEMU\n', 'nocloud\n']):
            self.assertIsNone(host_provider())


if __name__ == '__main__':
    unittest.main()

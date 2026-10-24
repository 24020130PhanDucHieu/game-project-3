"""Watchdog chống spam: mỗi loại lỗi tối đa một mail mỗi 15 phút, và báo khi đã phục hồi."""
import importlib.util
import sys
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('alert_dispatcher', Path(__file__).resolve().parents[2] / 'scripts' / 'alert_dispatcher.py')
alert = importlib.util.module_from_spec(spec)
sys.modules['alert_dispatcher'] = alert
spec.loader.exec_module(alert)

DOWN = {'severity': 'CRITICAL', 'component': 'worker', 'message': 'Worker 2 is UNREACHABLE'}
DISK = {'severity': 'WARNING', 'component': 'disk', 'message': 'Ổ đĩa 88%'}


class AlertDedupTests(unittest.TestCase):
    def test_first_alert_is_sent_then_suppressed_for_15_minutes(self):
        due, recovered, state = alert.select_alerts([DOWN], {}, 1000)
        self.assertEqual(due, [DOWN])
        due, _, state = alert.select_alerts([DOWN], state, 1000 + 60)
        self.assertEqual(due, [], 'không gửi lại sau 1 phút')
        due, _, state = alert.select_alerts([DOWN], state, 1000 + 15 * 60)
        self.assertEqual(due, [DOWN], 'nhắc lại sau 15 phút')
        self.assertEqual(recovered, [])

    def test_new_kind_sent_immediately_and_recovery_reported_once(self):
        _, _, state = alert.select_alerts([DOWN], {}, 0)
        due, _, state = alert.select_alerts([DOWN, DISK], state, 30)
        self.assertEqual(due, [DISK])
        due, recovered, state = alert.select_alerts([DISK], state, 60)
        self.assertEqual(recovered, ['worker:CRITICAL'])
        _, recovered, _ = alert.select_alerts([DISK], state, 90)
        self.assertEqual(recovered, [], 'chỉ báo phục hồi một lần')


if __name__ == '__main__':
    unittest.main()

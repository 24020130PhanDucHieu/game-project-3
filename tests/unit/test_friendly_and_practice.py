import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'bot-runner'))
from fastapi.testclient import TestClient
import main as worker


def first_card(code, state):
    return next(k for k, v in state['remaining_cards'].items() if v), None


class FriendlyAndPracticeTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(worker.app)

    def test_friendly_match_returns_replay_without_source(self):
        bot = (
            "# {marker}\n"
            "def decide_move(state):\n"
            "    return next(k for k, v in state['remaining_cards'].items() if v)\n"
        )
        res = self.client.post('/mutate-tournament', json={'action': 'friendly-match', 'params': {
            'code_a': bot.format(marker='SECRET_A'), 'code_b': bot.format(marker='SECRET_B'), 'rule_id': 'COMBO_2', 'seed': 'fixed'}})
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertIn(body['winner_side'], ('team_a', 'team_b', None))
        self.assertTrue(body['board_steps'])
        self.assertNotIn('SECRET_A', res.text)
        self.assertNotIn('SECRET_B', res.text)

    def test_practice_uses_requested_rule_and_reports_bot_errors(self):
        with patch('app.engine.board.BotRunner.run_python_code', side_effect=first_card):
            res = self.client.post('/mutate-tournament', json={'action': 'practice-match', 'params': {
                'code_content': 'x', 'boss': 'ADAPTIVE', 'rule_id': 'COMBO_4', 'seed': 's1'}})
        body = res.json()
        self.assertEqual(body['rule_id'], 'COMBO_4')
        self.assertIn('bot_errors', body)
        self.assertEqual(body['simulation']['rules'].get('fog') if 'rules' in body['simulation'] else True, True)


if __name__ == '__main__':
    unittest.main()

"""Rà luật bàn cờ trên nhiều trận ngẫu nhiên: mọi va chạm đúng tương khắc, cùng loại không ăn nhau, trận luôn kết thúc."""
import random
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'bot-runner'))
from app.engine.board import simulate_board
from app.engine.board_rules import board_rules
from app.engine.rules import GameRulesEngine

RULES = [f'COMBO_{m}' for m in range(32)] + ['STAGE_1_STANDARD', 'STAGE_2_MUTATED', 'RULE_REVERSE', 'RULE_FOG',
                                             'STAGE_3_REVERSE_FOG', 'STAGE_4_FINALS', 'RULE_OBSTACLES', 'RULE_SPECIAL_TILES']


def alive(step):
    return [(p, 'red') for p in step['red_pieces'] if p['alive']] + [(p, 'blue') for p in step['blue_pieces'] if p['alive']]


class BoardRuleAudit(unittest.TestCase):
    def run_games(self, games_per_rule=6):
        for rule in RULES:
            for g in range(games_per_rule):
                rng = random.Random(f'{rule}:{g}')

                def decide(code, state):
                    return rng.choice([k for k, v in state['remaining_cards'].items() if v] or ['ROCK']), None
                with patch('app.engine.board.BotRunner.run_python_code', side_effect=decide):
                    yield rule, g, simulate_board('a', 'b', stage_rule=rule, round_num=g + 1, tie_seed=f'audit-{rule}-{g}')

    def test_every_step_obeys_the_rules(self):
        for rule, g, result in self.run_games():
            with self.subTest(rule=rule, game=g):
                steps = result['board_steps']
                self.assertIn(result['winner_side'], ('team_a', 'team_b'), 'trận phải có người thắng')
                self.assertTrue(result['win_reason'])
                walls = {tuple(c) for c in result['obstacles']}
                first = steps[0]
                # Đối xứng tâm: quân Đỏ cột i cùng loại với quân Xanh cột 8-i.
                red = {p['col']: p['type'] for p in first['red_pieces']}
                blue = {p['col']: p['type'] for p in first['blue_pieces']}
                self.assertEqual([red[i] for i in range(9)], [blue[8 - i] for i in range(9)])
                for prev, step in zip(steps, steps[1:]):
                    cells = [(p['col'], p['row']) for p, _ in alive(step)]
                    self.assertEqual(len(cells), len(set(cells)), f'hai quân sống chung một ô ở bước {step["step_idx"]}')
                    self.assertFalse(walls & set(cells), 'quân đứng trên chướng ngại')
                    before = {p['id']: p for p, _ in alive(prev)}
                    died = [p for p in step['red_pieces'] + step['blue_pieces'] if not p['alive'] and p['id'] in before]
                    clash = step.get('clash_event') or {}
                    if clash.get('type') == 'CLASH':
                        if clash.get('draw'):
                            self.assertEqual(clash['winner_type'], clash['loser_type'])
                            self.assertFalse(died, 'hòa cùng loại nhưng vẫn có quân bị loại')
                        else:
                            self.assertNotEqual(clash['winner_type'], clash['loser_type'], 'cùng loại mà ăn được nhau')
                            reverse = board_rules(rule, step['cycle'], seed=result['tie_break_seed'])['reverse']
                            self.assertEqual(GameRulesEngine.check_clash(clash['winner_type'], clash['loser_type'], reverse), 1,
                                             f'{clash["winner_type"]} không khắc {clash["loser_type"]} (đảo={reverse})')
                            self.assertEqual(len(died), 1)
                    elif clash.get('type') != 'TRAP':
                        self.assertFalse(died, f'quân bị loại mà không có va chạm ở bước {step["step_idx"]}: {step["log"]}')

    def test_same_type_never_captures(self):
        for a in ('ROCK', 'PAPER', 'SCISSORS', 'JOKER'):
            for reverse in (False, True):
                self.assertEqual(GameRulesEngine.check_clash(a, a, reverse), 0)


if __name__ == '__main__':
    unittest.main()

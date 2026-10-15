import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'bot-runner'))
from app.sandbox.game_process import GameProcess
from app.engine.board import simulate_board


class GameProcessTests(unittest.TestCase):
    def test_real_process_fresh_scope_and_cleanup(self):
        bot=GameProcess("items=[]\ndef decide_move(state):\n    items.append(1)\n    return 'ROCK' if len(items)==1 else 'PAPER'\n")
        self.assertIsNone(bot.error)
        try:
            for _ in range(4):self.assertEqual(bot.decide({}),("ROCK",None))
        finally:bot.close()
        self.assertIsNotNone(bot.process.poll())

    def test_timeout_and_forbidden_import(self):
        bot=GameProcess("def decide_move(state):\n    while True: pass\n")
        try:self.assertIsNotNone(bot.decide({},timeout=0.1)[1])
        finally:bot.close()
        other=GameProcess("import os\ndef decide_move(state): return 'ROCK'")
        try:self.assertIsNotNone(other.decide({})[1])
        finally:other.close()

    def test_actual_qualifier_game(self):
        code="def decide_move(state): return 'ROCK'"
        result=simulate_board(code,code,tie_seed='fixture',reuse_sandbox=True)
        self.assertIn(result['winner_side'],('team_a','team_b'))
        self.assertEqual(result['bot_errors'],{'team_a':None,'team_b':None})

    def test_real_bots_receive_selected_rules_and_fog_on_every_turn(self):
        rules = {
            'STAGE_1_STANDARD': (False, [3,3,3]),
            'STAGE_2_MUTATED': (False, [5,2,2]),
            'RULE_REVERSE': (False, [3,3,3]),
            'RULE_FOG': (True, [3,3,3]),
            'RULE_MUTATED_FOG': (True, [5,2,2]),
            'STAGE_3_REVERSE_FOG': (True, [3,3,3]),
            'STAGE_4_FINALS': (True, [2,4,3]),
        }
        for rule, (fog, counts) in rules.items():
            # Both execution modes used by bracket matches and qualifiers.
            for reuse in (False, True):
                with self.subTest(rule=rule, reuse=reuse):
                    code = f'''def decide_move(state):
    assert state['rules']['id'] == {rule!r}
    assert state['rules']['fog'] == {fog!r}
    turn = state['turn_number']
    reverse = {rule!r} == 'RULE_REVERSE' or ({rule!r} == 'STAGE_3_REVERSE_FOG' and turn % 2 == 1) or ({rule!r} == 'STAGE_4_FINALS' and turn % 3 == 0)
    assert state['reverse_rule'] == reverse == state['rules']['reverse']
    for piece in state['opponent_pieces']:
        assert ('type' not in piece) == {fog!r}
        assert 'col' in piece and 'row' in piece
    for item in state['history']:
        if {fog!r}:
            assert 'opponent_move' not in item and 'their_move' not in item
    if turn == 1:
        assert [state['remaining_cards'][m] for m in ('ROCK','PAPER','SCISSORS')] == {counts!r}
    for move, count in state['remaining_cards'].items():
        if count > 0:
            return move
    return 'ROCK'
'''
                    result = simulate_board(code, code, stage_rule=rule, reuse_sandbox=reuse)
                    self.assertEqual(result['bot_errors'], {'team_a':None,'team_b':None})
                    self.assertGreater(len(result['board_steps']), 3)
                    self.assertEqual(result['rules']['id'], rule)


if __name__=='__main__':unittest.main()

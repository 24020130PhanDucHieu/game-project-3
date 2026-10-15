"""All eight checkbox combinations through real isolated bots and board rules."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'bot-runner'))
from app.engine.board import simulate_board
from app.engine.board_rules import initial_board, board_rules
from app.sandbox.runner import BotRunner


class Combinations(unittest.TestCase):
    def test_shuffle_is_repeatable_fair_and_varies(self):
        patterns=set()
        counts=set()
        for seed in range(100):
            board=initial_board('COMBO_7',str(seed))
            pattern=tuple(p['type'] for p in board['team_a'])
            self.assertEqual(pattern,tuple(reversed([p['type'] for p in board['team_b']])))
            self.assertEqual(board,initial_board('COMBO_7',str(seed)))
            self.assertEqual(len(pattern),9)
            self.assertEqual(set(pattern),{'ROCK','PAPER','SCISSORS'})
            patterns.add(pattern)
            counts.add(tuple(pattern.count(move) for move in ('ROCK','PAPER','SCISSORS')))
        self.assertGreater(len(patterns),50)
        self.assertGreater(len(counts),10)

    def test_all_combinations_validate_execute_and_win(self):
        standard={('ROCK','SCISSORS'),('SCISSORS','PAPER'),('PAPER','ROCK')}
        for bits in range(8):
            rule=f'COMBO_{bits}'
            code=f'''def decide_move(state):
    assert state['rules']['id']=={rule!r}
    assert state['rules']['fog']=={bool(bits&4)!r}
    assert state['rules']['shuffle']=={bool(bits&1)!r}
    assert state['reverse_rule']==state['rules']['reverse']=={bool(bits&2)!r}
    for piece in state['opponent_pieces']:
        assert ('type' not in piece)=={bool(bits&4)!r}
    for item in state['history']:
        if {bool(bits&4)!r}:
            assert 'opponent_move' not in item and 'their_move' not in item
    assert sum(state['rules']['initial_pieces'].values())==9
    for move,count in state['remaining_cards'].items():
        assert count==sum(p['type']==move for p in state['my_pieces'])
    return next(m for m,n in state['remaining_cards'].items() if n>0)
'''
            with self.subTest(rule=rule):
                self.assertTrue(BotRunner.validate_bot_code(code,'PYTHON',rule)['is_valid'])
                for reuse in (False,True):
                    result=simulate_board(code,code,stage_rule=rule,tie_seed='combo-fixture',reuse_sandbox=reuse)
                    self.assertEqual(result['bot_errors'],{'team_a':None,'team_b':None})
                    self.assertEqual(result['rules'],board_rules(rule,seed='combo-fixture'))
                    for step in result['board_steps']:
                        clash=step.get('clash_event') or {}
                        if clash.get('type')=='CLASH' and clash['winner_type']!=clash['loser_type']:
                            self.assertEqual((clash['winner_type'],clash['loser_type']) in standard,not bool(bits&2))
                    final=result['board_steps'][-1]
                    red=result['winner_side']=='team_a'
                    own=final['red_pieces' if red else 'blue_pieces']
                    enemy=final['blue_pieces' if red else 'red_pieces']
                    self.assertTrue(not any(p['alive'] for p in enemy) or any(p['alive'] and (p['col'],p['row'])==((8,0) if red else (0,8)) for p in own))


if __name__=='__main__': unittest.main()

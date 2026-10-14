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


if __name__=='__main__':unittest.main()

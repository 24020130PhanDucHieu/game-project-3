# -*- coding: utf-8 -*-
import sys
import os
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../bot-runner")))

from app.engine.rules import GameRulesEngine

class TestGameRulesEngine(unittest.TestCase):
    def test_rock_beats_scissors(self):
        result = GameRulesEngine.check_clash("ROCK", "SCISSORS")
        self.assertEqual(result, 1)

    def test_paper_beats_rock(self):
        result = GameRulesEngine.check_clash("PAPER", "ROCK")
        self.assertEqual(result, 1)

    def test_scissors_beats_paper(self):
        result = GameRulesEngine.check_clash("SCISSORS", "PAPER")
        self.assertEqual(result, 1)

    def test_draw(self):
        result = GameRulesEngine.check_clash("ROCK", "ROCK")
        self.assertEqual(result, 0)

    def test_reverse_rules(self):
        # In reverse rule: Scissors beats Rock
        result = GameRulesEngine.check_clash("SCISSORS", "ROCK", is_reverse=True)
        self.assertEqual(result, 1)

if __name__ == "__main__":
    unittest.main()

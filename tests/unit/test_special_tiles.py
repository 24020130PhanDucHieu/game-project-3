# -*- coding: utf-8 -*-
"""Unit tests for Special Mystery Tiles (Evolve, Portal, Trap) and Joker piece."""
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'bot-runner'))

from app.engine.board import simulate_board, MOVES, ALL_MOVES
from app.engine.board_rules import board_rules, initial_board
from app.engine.rules import GameRulesEngine


class SpecialTilesTests(unittest.TestCase):
    def test_joker_rules_and_counters(self):
        # Joker beats Rock, Paper, Scissors in both standard and reverse modes
        for std in ("ROCK", "PAPER", "SCISSORS"):
            self.assertEqual(GameRulesEngine.check_clash("JOKER", std, is_reverse=False), 1)
            self.assertEqual(GameRulesEngine.check_clash(std, "JOKER", is_reverse=False), -1)
            self.assertEqual(GameRulesEngine.check_clash("JOKER", std, is_reverse=True), 1)
            self.assertEqual(GameRulesEngine.check_clash(std, "JOKER", is_reverse=True), -1)
        self.assertEqual(GameRulesEngine.check_clash("JOKER", "JOKER"), 0)

    def test_special_tiles_board_rules_and_initial_pieces(self):
        rules = board_rules("RULE_SPECIAL_TILES")
        self.assertTrue(rules["special_tiles"])
        self.assertTrue(rules["has_joker"])
        self.assertEqual(rules["initial_pieces"]["JOKER"], 1)
        self.assertEqual(sum(rules["initial_pieces"].values()), 9)
        self.assertIn("mystery_tiles", rules)
        self.assertEqual(rules["mystery_tiles"]["evolve"], [(4, 4)])
        self.assertIn(((2, 2), (6, 6)), rules["mystery_tiles"]["portals"])

        board = initial_board("RULE_SPECIAL_TILES")
        for side in ("team_a", "team_b"):
            jokers = [p for p in board[side] if p["type"] == "JOKER"]
            self.assertEqual(len(jokers), 1)
            self.assertEqual(jokers[0]["steps_left"], 5)

    def test_simulate_board_with_special_tiles_and_joker(self):
        # Test simulate_board running with special_tiles=True
        code_dummy = "def decide_move(state): return 'ROCK'"
        res = simulate_board(code_dummy, code_dummy, stage_rule="RULE_SPECIAL_TILES")
        self.assertIsNotNone(res["winner_side"])
        self.assertIn("board_steps", res)
        self.assertGreater(len(res["board_steps"]), 1)

        # Check that steps contain piece states with Joker
        first_step = res["board_steps"][0]
        has_joker_red = any(p["type"] == "JOKER" for p in first_step["red_pieces"])
        has_joker_blue = any(p["type"] == "JOKER" for p in first_step["blue_pieces"])
        self.assertTrue(has_joker_red)
        self.assertTrue(has_joker_blue)

    def test_portal_warp_teleportation(self):
        # Verify portal teleportation logic: stepping on (2, 2) warps to (6, 6)
        from app.engine.board import PORTAL_WARP_MAP
        self.assertEqual(PORTAL_WARP_MAP[(2, 2)], (6, 6))
        self.assertEqual(PORTAL_WARP_MAP[(6, 6)], (2, 2))
        self.assertEqual(PORTAL_WARP_MAP[(2, 6)], (6, 2))
        self.assertEqual(PORTAL_WARP_MAP[(6, 2)], (2, 6))

    def test_evolve_cycle_transformation(self):
        # Verify evolve tile cycle: Scissors -> Rock -> Paper -> Scissors
        from app.engine.board import EVOLVE_CYCLE
        self.assertEqual(EVOLVE_CYCLE["SCISSORS"], "ROCK")
        self.assertEqual(EVOLVE_CYCLE["ROCK"], "PAPER")
        self.assertEqual(EVOLVE_CYCLE["PAPER"], "SCISSORS")


if __name__ == "__main__":
    unittest.main()

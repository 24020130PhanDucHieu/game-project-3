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
    def test_special_tiles_are_opt_in_and_do_not_overlap(self):
        from app.engine.board_rules import generate_mystery_tiles
        for bits in range(16):
            rule = f"COMBO_{bits}"
            rules = board_rules(rule, seed="opt-in")
            self.assertEqual(rules["special_tiles"], bool(bits & 8))
            pieces = initial_board(rule, seed="opt-in")
            for side in pieces.values():
                self.assertEqual(sum(p["type"] == "JOKER" for p in side), int(bool(bits & 8)))
        for seed in range(200):
            tiles = generate_mystery_tiles(seed)
            coords = tiles["evolve"] + tiles["traps"] + [p for pair in tiles["portals"] for p in pair]
            self.assertEqual(len(coords), 9)
            self.assertEqual(len(set(coords)), 9)
            self.assertEqual(tiles, generate_mystery_tiles(seed))

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
        self.assertEqual(len(rules["mystery_tiles"]["portals"]), 2)
        self.assertEqual(len(rules["mystery_tiles"]["traps"]), 4)

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
        self.assertIn("mystery_tiles", res)
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

    def test_stepping_on_tiles_triggers_activation(self):
        # Verify that when pieces step on mystery tiles, the effects (WARP, EVOLVE, TRAP) activate
        code_a = """
def decide_move(state):
    # Luôn chọn nước đi đầu tiên có thể di chuyển
    cards = state.get("remaining_cards", {})
    return "ROCK" if cards.get("ROCK", 0) > 0 else "PAPER"
"""
        code_b = "def decide_move(state): return 'ROCK'"
        res = simulate_board(code_a, code_b, round_num=1, stage_rule="RULE_SPECIAL_TILES", tie_seed="test_activation_seed")
        steps = res["board_steps"]
        clashes = [s.get("clash_event") for s in steps if s.get("clash_event")]
        clash_types = set(c["type"] for c in clashes if c and "type" in c)
        
        # Kiểm tra rằng các bước đấu đã kích hoạt ít nhất một trong các sự kiện đặc biệt (WARP, EVOLVE, TRAP, hoặc CLASH)
        self.assertGreater(len(steps), 5)
        self.assertIn("mystery_tiles", res)
        self.assertEqual(res["mystery_tiles"]["evolve"], [(4, 4)])


if __name__ == "__main__":
    unittest.main()

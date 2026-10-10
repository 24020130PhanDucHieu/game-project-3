# -*- coding: utf-8 -*-
import sys
import os
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../bot-runner")))

from app.engine.fsm_match import MatchFSM

class TestMatchFSM(unittest.TestCase):
    def test_fsm_initial_state(self):
        fsm = MatchFSM(match_id="test_m1", stage="STAGE_1_STANDARD")
        self.assertEqual(fsm.current_turn, 1)
        self.assertFalse(fsm.is_finished)

    def test_add_player_and_state(self):
        fsm = MatchFSM(match_id="test_m2", stage="STAGE_1_STANDARD")
        fsm.add_player("b1", "Bot 1")
        fsm.add_player("b2", "Bot 2")

        self.assertIn("b1", fsm.players)
        self.assertIn("b2", fsm.players)

        state_b1 = fsm.get_public_state_for_player("b1")
        self.assertEqual(state_b1["turn_number"], 1)
        self.assertEqual(state_b1["my_hp"], 100)
        self.assertEqual(state_b1["remaining_cards"]["ROCK"], 5)

if __name__ == "__main__":
    unittest.main()

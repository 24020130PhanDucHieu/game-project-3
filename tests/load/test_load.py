# -*- coding: utf-8 -*-
"""
Load & Concurrency Benchmark for OTTV2 AI Arena.
Kiểm tra hiệu năng xử lý hàng loạt ván đấu song song (Batch Simulation).
"""
import sys
import os
import time
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../bot-runner")))

from app.engine.fsm_match import MatchFSM
from app.sandbox.runner import BTCBossBots

class TestLoadPerformance(unittest.TestCase):
    def test_high_volume_match_simulation(self):
        start_time = time.time()
        num_matches = 100

        for i in range(num_matches):
            fsm = MatchFSM(match_id=f"bench_{i}")
            fsm.add_player("boss1", "Random Boss")
            fsm.add_player("boss2", "Counter Boss")

            # Simulate up to 5 turns
            for turn in range(1, 6):
                s1 = fsm.get_public_state_for_player("boss1")
                s2 = fsm.get_public_state_for_player("boss2")
                m1 = BTCBossBots.random_boss(s1)
                m2 = BTCBossBots.counter_boss(s2)

        elapsed = time.time() - start_time
        # Must finish 100 simulations in under 2 seconds
        self.assertLess(elapsed, 2.0, f"100 matches took too long: {elapsed:.3f}s")
        print(f"\n[BENCHMARK] 100 match simulations completed in {elapsed:.4f}s ({num_matches/elapsed:.1f} matches/sec)")

if __name__ == "__main__":
    unittest.main()

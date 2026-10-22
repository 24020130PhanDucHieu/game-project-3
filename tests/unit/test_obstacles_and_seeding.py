"""Unit tests for Obstacles rule (bit 16), safe seeding, bracket swap, and disqualification."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'bot-runner'))
from app.engine.board_rules import board_rules, generate_obstacles
from app.engine.board import simulate_board
from app.repository.database import Database
from app.models.schemas import BotLanguage


class ObstaclesAndSeedingTests(unittest.TestCase):
    def test_obstacles_generation_and_board_rules(self):
        # 1. generate_obstacles produces symmetric pairs
        obs = generate_obstacles("test-seed-123")
        self.assertEqual(len(obs), 4)
        for c, r in obs:
            self.assertTrue(0 <= c < 9 and 0 <= r < 9)
            # Cannot be on initial ranks 1 (blue) or 7 (red)
            self.assertNotIn(r, (0, 1, 7, 8))
            # Must have symmetric partner
            self.assertIn([8 - c, 8 - r], obs)

        # 2. board_rules with COMBO_16 or RULE_OBSTACLES has obstacles
        r16 = board_rules("COMBO_16", seed="test-seed-123")
        self.assertTrue(r16["has_obstacles"])
        self.assertEqual(len(r16["obstacles"]), 4)

        r_std = board_rules("STAGE_1_STANDARD")
        self.assertFalse(r_std["has_obstacles"])
        self.assertEqual(r_std["obstacles"], [])

    def test_simulation_with_obstacles_avoids_obstacle_tiles(self):
        code = """def decide_move(state):
    # Bot receives obstacles list in state
    assert 'obstacles' in state
    return 'ROCK'
"""
        result = simulate_board(code, code, stage_rule="COMBO_16", tie_seed="obs-run")
        self.assertEqual(result["bot_errors"], {"team_a": None, "team_b": None})
        self.assertTrue(len(result["obstacles"]) > 0)
        obs_set = set(tuple(c) for c in result["obstacles"])

        # Check no piece ever stepped onto an obstacle tile in any step
        for step in result["board_steps"]:
            for p in step["red_pieces"] + step["blue_pieces"]:
                if p["alive"]:
                    self.assertNotIn((p["col"], p["row"]), obs_set)

    def test_auto_schedule_safety_and_phantom_prevention(self):
        db = object.__new__(Database)
        db.save_tournaments_to_file = lambda: None
        db.ensure_tournament_editable = lambda t: None
        
        # Setup tournament needing 8 teams, but only 2 real teams enrolled
        tourn = {
            "tournament_id": "test_tourn",
            "num_teams": 8,
            "status": "CONFIGURING",
            "teams": [
                {"student_id": "24020001", "team_name": "Team 1", "university": "UET"},
                {"student_id": "24020002", "team_name": "Team 2", "university": "UET"},
                {"student_id": "24020099", "team_name": "Team Del", "is_deleted": True},
                {"student_id": "24020088", "team_name": "Team DQ", "disqualified": True},
            ],
            "matches": {}
        }
        db.tournaments = {"test_tourn": tourn}

        # 1. Bốc thăm không được chèn đội ma và phải ném lỗi khi thiếu đội
        with self.assertRaises(ValueError) as ctx:
            db.auto_schedule_tournament("test_tourn", fill_demo=False)
        self.assertIn("Không thể bốc thăm", str(ctx.exception))
        self.assertIn("2 đội hợp lệ", str(ctx.exception))

        # 2. Khi fill_demo=True, bổ sung đủ 8 đội mà không bị trùng và loại bỏ các đội xóa/loại
        scheduled = db.auto_schedule_tournament("test_tourn", fill_demo=True)
        self.assertEqual(len(scheduled["teams"]), 8)
        sids = [t["student_id"] for t in scheduled["teams"]]
        self.assertEqual(len(set(sids)), 8)  # Unique, no duplicates
        self.assertNotIn("24020099", sids)   # Deleted team excluded
        self.assertNotIn("24020088", sids)   # Disqualified team excluded

    def test_bracket_swap_and_disqualification(self):
        db = object.__new__(Database)
        db.save_tournaments_to_file = lambda: None
        db.ensure_tournament_editable = lambda t: None

        tourn = {
            "tournament_id": "t_swap",
            "num_teams": 4,
            "teams": [
                {"student_id": "A1", "team_name": "Team A1"},
                {"student_id": "B1", "team_name": "Team B1"},
                {"student_id": "A2", "team_name": "Team A2"},
                {"student_id": "B2", "team_name": "Team B2"},
            ],
            "matches": Database.build_bracket_matches(4)
        }
        tourn["matches"]["m_lvl1_1"]["team_a"] = Database.make_team_slot(tourn["teams"][0])
        tourn["matches"]["m_lvl1_1"]["team_b"] = Database.make_team_slot(tourn["teams"][1])
        tourn["matches"]["m_lvl1_2"]["team_a"] = Database.make_team_slot(tourn["teams"][2])
        tourn["matches"]["m_lvl1_2"]["team_b"] = Database.make_team_slot(tourn["teams"][3])
        db.tournaments = {"t_swap": tourn}

        # Test swap A1 with A2
        res = db.swap_bracket_teams("t_swap", "A1", "A2")
        self.assertEqual(res["status"], "SUCCESS")
        m1 = tourn["matches"]["m_lvl1_1"]
        m2 = tourn["matches"]["m_lvl1_2"]
        self.assertEqual(m1["team_a"]["student_id"], "A2")
        self.assertEqual(m2["team_a"]["student_id"], "A1")

        # Test disqualification
        res_dq = db.disqualify_tournament_team("t_swap", "A2", "Gian lận")
        self.assertEqual(res_dq["status"], "SUCCESS")
        self.assertTrue(tourn["matches"]["m_lvl1_1"]["team_a"]["disqualified"])
        # Match m_lvl1_1 should now be completed with winner team_b (B1)
        self.assertEqual(tourn["matches"]["m_lvl1_1"]["status"], "COMPLETED")
        self.assertEqual(tourn["matches"]["m_lvl1_1"]["winner"], "team_b")


if __name__ == '__main__':
    unittest.main()

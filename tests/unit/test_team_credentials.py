import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../bot-runner")))

from app.repository.database import Database


class TestDefaultTeamAccessCode(unittest.TestCase):
    def setUp(self):
        self.db = object.__new__(Database)
        self.team = {
            "student_id": "24020001",
            "team_name": "Test Team",
            # Legacy/random hashes are intentionally ignored by the fixed policy.
            "credential_hash": "legacy-hash",
        }
        self.db.tournaments = {
            "cup": {
                "teams": [self.team],
                "matches": {
                    "match-1": {
                        "team_a": {**self.team},
                        "team_b": None,
                    }
                },
            }
        }
        self.db.save_tournaments_to_file = lambda: None

    def test_code_is_k69_prefix_plus_student_id(self):
        self.assertEqual(Database.default_team_access_code(" 24020001 "), "k6924020001")

    def test_default_password_authenticates_against_legacy_match_snapshot(self):
        result = self.db.authenticate_match_login("cup", "match-1", "24020001", "k6924020001")
        self.assertEqual(result["role"], "TEAM_A")

    def test_other_password_is_rejected(self):
        with self.assertRaises(ValueError):
            self.db.authenticate_match_login("cup", "match-1", "24020001", "old-code")


if __name__ == "__main__":
    unittest.main()

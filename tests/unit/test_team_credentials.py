import hashlib
import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../bot-runner")))

from app.repository.database import Database


class TestTeamCredentialRotation(unittest.TestCase):
    def setUp(self):
        self.db = object.__new__(Database)
        self.team = {
            "student_id": "24020001",
            "team_name": "Test Team",
            "credential_hash": "previous-hash",
        }
        self.match_team_snapshot = {**self.team, "credential_hash": "stale-match-hash"}
        self.db.tournaments = {
            "cup": {
                "teams": [self.team],
                "matches": {"match-1": {"team_a": self.match_team_snapshot, "team_b": None}},
            }
        }
        self.db.save_tournaments_to_file = lambda: None

    def test_rotation_returns_new_code_and_stores_only_hash(self):
        result = self.db.rotate_team_access_code("cup", " 24020001 ")

        self.assertEqual(result["student_id"], "24020001")
        self.assertEqual(result["team_name"], "Test Team")
        self.assertTrue(result["team_access_code"])
        self.assertEqual(
            self.team["credential_hash"],
            hashlib.sha256(result["team_access_code"].encode()).hexdigest(),
        )
        self.assertNotEqual(self.team["credential_hash"], result["team_access_code"])
        self.assertNotEqual(self.team["credential_hash"], "previous-hash")
        self.assertEqual(self.match_team_snapshot["credential_hash"], self.team["credential_hash"])

        login = self.db.authenticate_match_login(
            "cup", "match-1", "24020001", result["team_access_code"]
        )
        self.assertEqual(login["role"], "TEAM_A")
        with self.assertRaises(ValueError):
            self.db.authenticate_match_login("cup", "match-1", "24020001", "old-code")

    def test_rotation_rejects_unknown_tournament_or_team(self):
        with self.assertRaises(ValueError):
            self.db.rotate_team_access_code("missing", "24020001")
        with self.assertRaises(ValueError):
            self.db.rotate_team_access_code("cup", "missing")
        with self.assertRaises(ValueError):
            self.db.rotate_team_access_code("cup", " ")


if __name__ == "__main__":
    unittest.main()

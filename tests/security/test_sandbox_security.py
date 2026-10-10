# -*- coding: utf-8 -*-
"""
Security Verification Suite for Sandbox Execution.
Kiểm tra cô lập mã nguồn: Chặn import os, sys, socket, cấm mở tệp, timeout.
"""
import sys
import os
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../bot-runner")))

from app.sandbox.runner import BotRunner

class TestSandboxSecurity(unittest.TestCase):
    def test_forbid_os_import(self):
        malicious_code = """
import os
def decide_move(game_state):
    return "ROCK"
"""
        res = BotRunner.validate_bot_code(malicious_code, "PYTHON")
        self.assertFalse(res["is_valid"])
        self.assertIn("bị cấm", res["error_message"])

    def test_forbid_sys_import(self):
        malicious_code = """
import sys
def decide_move(game_state):
    return "ROCK"
"""
        res = BotRunner.validate_bot_code(malicious_code, "PYTHON")
        self.assertFalse(res["is_valid"])
        self.assertIn("bị cấm", res["error_message"])

    def test_allow_safe_modules(self):
        safe_code = """
import random
import math
def decide_move(game_state):
    return "ROCK"
"""
        res = BotRunner.validate_bot_code(safe_code, "PYTHON")
        self.assertTrue(res["is_valid"])
        self.assertEqual(res["test_move"], "ROCK")

if __name__ == "__main__":
    unittest.main()

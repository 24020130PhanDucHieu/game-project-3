# -*- coding: utf-8 -*-
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../bot-runner")))
from app.sandbox.runner import BotRunner


class TestSandboxSecurity(unittest.TestCase):
    def test_forbid_os_import(self):
        result = BotRunner.validate_bot_code('import os\ndef decide_move(game_state):\n    return "ROCK"', "PYTHON")
        self.assertFalse(result["is_valid"])
        self.assertIn("bị cấm", result["error_message"])

    def test_forbid_sys_import(self):
        result = BotRunner.validate_bot_code('import sys\ndef decide_move(game_state):\n    return "ROCK"', "PYTHON")
        self.assertFalse(result["is_valid"])
        self.assertIn("bị cấm", result["error_message"])

    def test_allow_safe_modules(self):
        result = BotRunner.validate_bot_code('import random, math\ndef decide_move(game_state):\n    return "ROCK"', "PYTHON")
        self.assertTrue(result["is_valid"])
        self.assertEqual(result["test_move"], "ROCK")

    def test_reject_python_introspection(self):
        code = "def decide_move(game_state):\n    return type(game_state).__class__.__name__"
        result = BotRunner.validate_bot_code(code, "PYTHON")
        self.assertFalse(result["is_valid"])
        self.assertIn("Python", result["error_message"])

    def test_stop_infinite_loop(self):
        code = "def decide_move(game_state):\n    while True:\n        pass"
        result = BotRunner.validate_bot_code(code, "PYTHON")
        self.assertFalse(result["is_valid"])
        self.assertIn("Time Limit Exceeded", result["error_message"])

    def test_disable_native_cpp_in_production(self):
        with patch.dict(os.environ, {"ENVIRONMENT": "production"}):
            with patch('app.sandbox.cpp_wasi.compile_wasi', return_value=('fixture.wasm', None)) as compile_wasi:
                path, error = BotRunner.compile_cpp_code("int main() { return 0; }")
                compile_wasi.assert_called_once_with("int main() { return 0; }")
                self.assertEqual(path, 'fixture.wasm')
                self.assertIsNone(error)
            with patch('app.sandbox.runner.subprocess.run') as native:
                _, error = BotRunner.run_cpp_binary('fixture.exe', {})
                self.assertIn('WASI', error)
                native.assert_not_called()


if __name__ == "__main__":
    unittest.main()

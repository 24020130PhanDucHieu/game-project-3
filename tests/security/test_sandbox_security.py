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

    def test_block_indirect_system_modules_and_private_imports(self):
        for source in [
            'import typing\ndef decide_move(s):\n    typing.sys.modules["os"].getpid()\n    return "ROCK"',
            'from typing import sys\ndef decide_move(s):\n    return "ROCK"',
            'from math import __getattribute__ as access\ndef decide_move(s):\n    return "ROCK"',
            'import functools\ndef decide_move(s):\n    functools.update_wrapper(None,None)\n    return "ROCK"',
        ]:
            with self.subTest(source=source):
                self.assertFalse(BotRunner.validate_bot_code(source, 'PYTHON')['is_valid'])

    def test_supported_algorithm_imports(self):
        code = '''from collections import Counter, deque
from collections.abc import Mapping
from functools import lru_cache
from typing import Dict, List
import json, heapq, itertools
def decide_move(state):
    values = deque([1, 2])
    assert Counter(values)[1] == 1
    assert isinstance(state, Mapping)
    return 'ROCK'
'''
        result=BotRunner.validate_bot_code(code,'PYTHON')
        self.assertTrue(result['is_valid'],result)

    def test_sandbox_setup_failure_is_not_an_invalid_bot(self):
        from app.sandbox.game_process import SandboxUnavailableError
        child="import sys,json;sys.stdin.readline();print(json.dumps({'error':'fixture isolation failure','isolation_error':True}),flush=True)"
        with patch('app.sandbox.game_process.CHILD',child):
            with self.assertRaises(SandboxUnavailableError):
                BotRunner.validate_bot_code("def decide_move(state): return 'ROCK'",'PYTHON')

    def test_worker_marks_isolation_failure_retryable(self):
        from fastapi import HTTPException
        from main import MutateRequest, mutate_tournament, worker_health
        from app.sandbox.game_process import SandboxUnavailableError
        self.assertEqual(worker_health()['status'],'HEALTHY')
        with patch.object(BotRunner,'validate_bot_code',side_effect=SandboxUnavailableError('fixture')):
            with self.assertRaises(HTTPException) as raised:
                mutate_tournament(MutateRequest(action='validate-code',params={'code_content':'fixture'}))
        self.assertEqual(raised.exception.status_code,503)

    def test_worker_internal_failure_is_not_a_source_error(self):
        from fastapi import HTTPException
        from main import MutateRequest, mutate_tournament
        with patch.object(BotRunner,'validate_bot_code',side_effect=RuntimeError('fixture worker failure')), patch('traceback.print_exc'):
            with self.assertRaises(HTTPException) as raised:
                mutate_tournament(MutateRequest(action='validate-code',params={'code_content':'fixture'}))
        self.assertEqual(raised.exception.status_code,500)

    def test_process_spawn_failure_is_retryable(self):
        from app.sandbox.game_process import SandboxUnavailableError
        with patch('app.sandbox.game_process.subprocess.Popen',side_effect=OSError('fixture spawn failure')):
            with self.assertRaises(SandboxUnavailableError):
                BotRunner.validate_bot_code("def decide_move(s): return 'ROCK'",'PYTHON')

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

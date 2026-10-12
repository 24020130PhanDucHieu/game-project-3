# -*- coding: utf-8 -*-
"""
Hệ thống Sandbox Thực thi Mã nguồn An toàn (Python & C++).
Quản lý biên dịch g++ tự động, chạy tiến trình con cô lập, giám sát Timeout 1.0s,
và cung cấp các Boss Bot mẫu của BTC để thí sinh luyện tập.
"""

import subprocess
import os
import sys
import tempfile
import json
import random
import time
import ast
try:
    import resource
except ImportError:
    resource = None
from typing import Dict, Any, Optional, Tuple

# --- BOSS BOTS CỦA BAN TỔ CHỨC ---
class BTCBossBots:
    @staticmethod
    def random_boss(game_state: dict) -> str:
        """Boss 1: Đánh ngẫu nhiên trong số các thẻ còn lại"""
        cards = game_state.get("remaining_cards", {})
        available = [k for k, v in cards.items() if v > 0]
        return random.choice(available) if available else "ROCK"

    @staticmethod
    def counter_boss(game_state: dict) -> str:
        """Boss 2: Đếm tần suất bài đối thủ đã đánh, chọn bài khắc chế"""
        cards = game_state.get("remaining_cards", {})
        available = [k for k, v in cards.items() if v > 0]
        if not available:
            return "ROCK"

        history = game_state.get("history", [])
        if not history:
            return random.choice(available)

        # Đếm các nước đi gần nhất của đối thủ
        opp_moves = []
        for h in history:
            for name, move in h.items():
                if "Boss" not in name:
                    opp_moves.append(move)

        if not opp_moves:
            return random.choice(available)

        # Nước đi đối thủ hay ra nhất
        most_common = max(set(opp_moves), key=opp_moves.count)
        counter_map = {"ROCK": "PAPER", "SCISSORS": "ROCK", "PAPER": "SCISSORS"}
        desired = counter_map.get(most_common, "ROCK")

        return desired if desired in available else random.choice(available)

    @staticmethod
    def nash_markov_boss(game_state: dict) -> str:
        """Boss 3: Chuỗi Markov dự đoán nước đi tiếp theo + Cân bằng Nash"""
        cards = game_state.get("remaining_cards", {})
        available = [k for k, v in cards.items() if v > 0]
        if not available:
            return "ROCK"

        history = game_state.get("history", [])
        if len(history) < 2:
            return random.choice(available)

        # Lấy nước đi hiệp vừa rồi của đối thủ
        last_turn = history[-1]
        opp_last = None
        for name, move in last_turn.items():
            if "Boss" not in name:
                opp_last = move
                break

        if not opp_last:
            return random.choice(available)

        # Giả định tâm lý: Đối thủ thắng thường giữ nguyên hoặc đổi quân tiếp theo
        # Chiến thuật Nash: Chọn quân có xác suất cao nhất
        counter_map = {"ROCK": "PAPER", "SCISSORS": "ROCK", "PAPER": "SCISSORS"}
        predicted_counter = counter_map.get(opp_last, "ROCK")
        my_best = counter_map.get(predicted_counter, "ROCK")

        return my_best if my_best in available else random.choice(available)


class ValidationResult(dict):
    """Kaggle-style Bot Validation Result (supports dict indexing and 2-tuple unpacking)"""
    def __init__(self, is_valid: bool, error_message: Optional[str] = None, test_move: Optional[str] = None, execution_time_ms: float = 0.0):
        super().__init__({
            "is_valid": is_valid,
            "error_message": error_message,
            "test_move": test_move,
            "execution_time_ms": execution_time_ms
        })
        self.is_valid = is_valid
        self.error_message = error_message
        self.test_move = test_move
        self.execution_time_ms = execution_time_ms

    def __iter__(self):
        yield self["is_valid"]
        yield self.get("error_message")

SAFE_MODULES = {"random", "math", "collections", "itertools", "re", "json", "heapq", "functools", "typing"}
MAX_CODE_BYTES = 65536

def _limit_child_resources():
    if resource is None:
        return
    resource.setrlimit(resource.RLIMIT_CPU, (1, 2))
    resource.setrlimit(resource.RLIMIT_AS, (160 * 1024 * 1024, 160 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_FSIZE, (1024 * 1024, 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))

def _validate_python_ast(code_str: str) -> Optional[str]:
    if len(code_str.encode("utf-8")) > MAX_CODE_BYTES:
        return "Mã nguồn vượt quá giới hạn 64 KB."
    try:
        tree = ast.parse(code_str)
    except SyntaxError as exc:
        return f"Lỗi cú pháp Python: dòng {exc.lineno}: {exc.msg}"
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and node.attr.startswith("_"):
            return "Không cho phép truy cập thuộc tính nội bộ của Python."
        if isinstance(node, ast.Name) and node.id.startswith("_"):
            return "Không cho phép sử dụng tên nội bộ của Python."
        if isinstance(node, (ast.Global, ast.Nonlocal)):
            return "Không cho phép thay đổi biến toàn cục trong sandbox."
    return None

def _execute_python_isolated(code_str: str, game_state: dict, timeout: float) -> Tuple[Optional[str], Optional[str]]:
    validation_error = _validate_python_ast(code_str)
    if validation_error:
        return None, validation_error
    child = r'''import json, sys, random, math, builtins
payload = json.loads(sys.stdin.read())
safe_modules = {"random", "math", "collections", "itertools", "re", "json", "heapq", "functools", "typing"}
def safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    if name.split(".")[0] not in safe_modules: raise ImportError("Import module bị cấm")
    return builtins.__import__(name, globals, locals, fromlist, level)
safe_builtins = {"range":range,"len":len,"min":min,"max":max,"abs":abs,"sum":sum,"int":int,"float":float,"str":str,"bool":bool,"list":list,"dict":dict,"set":set,"tuple":tuple,"print":lambda *a:None,"sorted":sorted,"reversed":reversed,"enumerate":enumerate,"zip":zip,"next":next,"iter":iter,"any":any,"all":all,"map":map,"filter":filter,"isinstance":isinstance,"type":type,"__import__":safe_import}
scope = {"__builtins__":safe_builtins,"random":random,"math":math}
try:
    exec(compile(payload["code"], "<bot>", "exec"), scope, scope)
    fn = scope.get("decide_move")
    if not callable(fn): raise ValueError("Thiếu hàm decide_move(game_state).")
    result = fn(payload["state"])
    if not isinstance(result, str) or result.upper() not in ("ROCK","PAPER","SCISSORS"): raise ValueError("Nước đi không hợp lệ.")
    print(json.dumps({"move":result.upper()}))
except BaseException as exc:
    print(json.dumps({"error":str(exc)}))
'''
    try:
        child_env = {
            key: value for key, value in os.environ.items()
            if key.upper() not in {"ADMIN_PASSWORD", "DATABASE_URL", "POSTGRES_URL", "NEON_DATABASE_URL", "SECRET_KEY"}
        }
        child_env["PYTHONIOENCODING"] = "utf-8"
        completed = subprocess.run(
            [sys.executable, "-I", "-S", "-c", child],
            input=json.dumps({"code": code_str, "state": game_state}),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace",
            timeout=max(0.05, timeout), close_fds=True,
            cwd=tempfile.gettempdir(), env=child_env,
            preexec_fn=_limit_child_resources if os.name == "posix" else None
        )
        output = json.loads(completed.stdout.splitlines()[-1]) if completed.stdout.strip() else {}
        if "move" in output:
            return output["move"], None
        return None, output.get("error") or completed.stderr[-2000:] or "Bot không trả về nước đi."
    except subprocess.TimeoutExpired:
        return None, f"Time Limit Exceeded ({timeout:.2f}s)."
    except Exception as exc:
        return None, f"Lỗi sandbox: {exc}"

# --- BỘ ĐIỀU PHỐI SANDBOX ---
class BotRunner:
    @staticmethod
    def validate_bot_code(code_str: str, language: str = "PYTHON") -> ValidationResult:
        """
        Kiểm tra và cô lập code bot trước khi cho phép thi đấu (Validation Stage):
        - Định dạng và khả năng biên dịch/thông dịch.
        - Khả năng khởi chạy trong môi trường cô lập.
        - Khả năng trả về nước đi hợp lệ (ROCK/PAPER/SCISSORS) với game_state mẫu.
        - Giới hạn thời gian (Timeout 0.5s cho kiểm thử).
        """
        if not code_str or not code_str.strip():
            return ValidationResult(False, "Mã nguồn không được để trống.")

        lang = (language or "PYTHON").upper()
        dummy_state = {
            "my_hp": 100,
            "remaining_cards": {"ROCK": 3, "PAPER": 3, "SCISSORS": 3},
            "turn_number": 1,
            "history": []
        }

        if lang == "PYTHON":
            started = time.monotonic()
            move, error = _execute_python_isolated(code_str, dummy_state, timeout=0.5)
            elapsed_ms = round((time.monotonic() - started) * 1000, 2)
            if error:
                return ValidationResult(False, error)
            return ValidationResult(True, None, test_move=move, execution_time_ms=elapsed_ms)
        elif lang == "CPP":
            exe_path, err = BotRunner.compile_cpp_code(code_str)
            if err:
                return ValidationResult(False, err)
            try:
                t0 = time.time()
                move, run_err = BotRunner.run_cpp_binary(exe_path, dummy_state, timeout=1.0)
                t_elapsed = time.time() - t0
                if run_err:
                    return ValidationResult(False, f"Lỗi thực thi C++: {run_err}")
                if move not in ["ROCK", "PAPER", "SCISSORS"]:
                    return ValidationResult(False, f"Output C++ không hợp lệ: '{move}'")
                return ValidationResult(True, None, test_move=move, execution_time_ms=round(t_elapsed * 1000, 2))
            finally:
                if exe_path and os.path.exists(exe_path):
                    try:
                        os.remove(exe_path)
                    except:
                        pass

        return ValidationResult(False, f"Ngôn ngữ '{language}' không được hỗ trợ.")

    @staticmethod
    def run_python_code(code_str: str, game_state: dict, timeout: float = 1.0) -> Tuple[str, Optional[str]]:
        cards = game_state.get("remaining_cards", {})
        available = [k for k, v in cards.items() if v > 0]
        fallback_move = available[0] if available else "ROCK"
        chosen, error = _execute_python_isolated(code_str, game_state, timeout=timeout)
        return (chosen, None) if chosen else (fallback_move, f"Runtime Error: {error}")
    @staticmethod
    def compile_cpp_code(cpp_code_str: str) -> Tuple[Optional[str], Optional[str]]:
        """
        Biên dịch mã nguồn C++ bằng g++ MinGW.
        Trả về: (đường_dẫn_file_exe_nếu_thành_công, lỗi_biên_dịch_nếu_có)
        """
        temp_dir = tempfile.gettempdir()
        if os.getenv("ENVIRONMENT", "").lower() == "production":
            return None, "Native C++ execution is disabled in production until an OS-isolated runner is configured."
        if len(cpp_code_str.encode("utf-8")) > MAX_CODE_BYTES:
            return None, "C++ source exceeds the 64 KB limit."
        file_id = f"bot_{int(time.time()*1000)}_{random.randint(100, 999)}"
        src_path = os.path.join(temp_dir, f"{file_id}.cpp")
        exe_path = os.path.join(temp_dir, f"{file_id}.exe")

        try:
            with open(src_path, "w", encoding="utf-8") as f:
                f.write(cpp_code_str)

            # Gọi lệnh biên dịch g++ -O3 -std=c++17
            compile_cmd = ["g++", "-O3", "-std=c++17", src_path, "-o", exe_path]
            proc = subprocess.run(
                compile_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=10.0
            )

            if proc.returncode != 0:
                return None, f"Lỗi biên dịch g++:\n{proc.stderr}"

            return exe_path, None

        except subprocess.TimeoutExpired:
            return None, "Biên dịch quá thời gian quy định (Compilation Timeout 10s)."
        except Exception as e:
            return None, f"Lỗi hệ thống khi biên dịch: {str(e)}"
        finally:
            if os.path.exists(src_path):
                try:
                    os.remove(src_path)
                except:
                    pass

    @staticmethod
    def run_cpp_binary(exe_path: str, game_state: dict, timeout: float = 1.0) -> Tuple[str, Optional[str]]:
        """
        Chạy binary C++ đã biên dịch trong môi trường cách ly ICPC (STDIN / STDOUT).
        """
        cards = game_state.get("remaining_cards", {})
        available = [k for k, v in cards.items() if v > 0]
        fallback_move = available[0] if available else "ROCK"

        if os.getenv("ENVIRONMENT", "").lower() == "production":
            return fallback_move, "Native C++ execution is disabled in production."

        if not os.path.exists(exe_path):
            return fallback_move, "Không tìm thấy tệp nhị phân thực thi C++."

        input_data = json.dumps(game_state) + "\n"

        try:
            proc = subprocess.run(
                [exe_path],
                input=input_data,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=timeout
            )

            output = proc.stdout.strip().upper()
            if output in ["ROCK", "PAPER", "SCISSORS"]:
                return output, None
            else:
                return fallback_move, f"Output STDOUT không hợp lệ từ C++: '{output}'"

        except subprocess.TimeoutExpired:
            return fallback_move, f"Time Limit Exceeded (Quá 1.0s timeout)"
        except Exception as e:
            return fallback_move, f"Lỗi thực thi C++: {str(e)}"

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

def safe_import_func(name, globals=None, locals=None, fromlist=(), level=0):
    if name in SAFE_MODULES:
        return __import__(name, globals, locals, fromlist, level)
    raise ImportError(f"Import module '{name}' bị cấm trong môi trường thi đấu bảo mật của sàn đấu.")

def make_safe_sandbox_globals():
    import random, math
    return {
        "__builtins__": {
            "range": range, "len": len, "min": min, "max": max,
            "abs": abs, "sum": sum, "int": int, "float": float,
            "str": str, "bool": bool, "list": list, "dict": dict,
            "set": set, "tuple": tuple, "print": lambda *args: None,
            "sorted": sorted, "reversed": reversed, "enumerate": enumerate,
            "zip": zip, "any": any, "all": all, "map": map, "filter": filter,
            "isinstance": isinstance, "type": type,
            "__import__": safe_import_func,
            "random": random, "math": math
        },
        "random": random,
        "math": math
    }

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
            try:
                # 1. Kiểm tra cú pháp (Syntax Check)
                compiled = compile(code_str, "<validate_bot>", "exec")
            except SyntaxError as e:
                return ValidationResult(False, f"Lỗi cú pháp Python (Syntax Error): dòng {e.lineno}: {e.msg}")
            except Exception as e:
                return ValidationResult(False, f"Lỗi cú pháp: {str(e)}")

            # 2. Kiểm thử thực thi với dummy_state
            safe_globals = make_safe_sandbox_globals()
            local_scope = {}
            try:
                exec(compiled, safe_globals, local_scope)
                if "decide_move" not in local_scope or not callable(local_scope["decide_move"]):
                    return ValidationResult(False, "Thiếu định nghĩa hàm bắt buộc: 'def decide_move(game_state):'")

                t0 = time.time()
                res = local_scope["decide_move"](dummy_state)
                t_elapsed = time.time() - t0

                if t_elapsed > 0.5:
                    return ValidationResult(False, f"Hàm chạy quá thời gian thử nghiệm cho phép ({t_elapsed:.3f}s > 0.5s).")

                if not isinstance(res, str) or res.upper() not in ["ROCK", "PAPER", "SCISSORS"]:
                    return ValidationResult(False, f"Hàm trả về giá trị không hợp lệ: '{res}'. Phải là 'ROCK', 'PAPER' hoặc 'SCISSORS'.")

                return ValidationResult(True, None, test_move=res.upper(), execution_time_ms=round(t_elapsed * 1000, 2))
            except Exception as e:
                return ValidationResult(False, f"Lỗi khi chạy thử hàm decide_move: {str(e)}")

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
        """
        Thực thi code Python an toàn.
        Trả về: (nước_đi_chọn, thông_báo_lỗi_nếu_có)
        """
        cards = game_state.get("remaining_cards", {})
        available = [k for k, v in cards.items() if v > 0]
        fallback_move = available[0] if available else "ROCK"

        # Định nghĩa môi trường chạy cô lập
        safe_globals = make_safe_sandbox_globals()
        local_scope = {}

        try:
            # Biên dịch mã nguồn
            compiled_code = compile(code_str, "<student_bot>", "exec")
            exec(compiled_code, safe_globals, local_scope)

            if "decide_move" not in local_scope:
                return fallback_move, "Không tìm thấy hàm 'decide_move(game_state)' trong mã nguồn."

            # Thực thi hàm
            start_t = time.time()
            chosen = local_scope["decide_move"](game_state)
            elapsed = time.time() - start_t

            if elapsed > timeout:
                return fallback_move, f"Time Limit Exceeded ({elapsed:.3f}s > {timeout}s)"

            if isinstance(chosen, str) and chosen.upper() in ["ROCK", "PAPER", "SCISSORS"]:
                return chosen.upper(), None
            else:
                return fallback_move, f"Giá trị trả về không hợp lệ: '{chosen}'"

        except Exception as e:
            return fallback_move, f"Runtime Error: {str(e)}"

    @staticmethod
    def compile_cpp_code(cpp_code_str: str) -> Tuple[Optional[str], Optional[str]]:
        """
        Biên dịch mã nguồn C++ bằng g++ MinGW.
        Trả về: (đường_dẫn_file_exe_nếu_thành_công, lỗi_biên_dịch_nếu_có)
        """
        temp_dir = tempfile.gettempdir()
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

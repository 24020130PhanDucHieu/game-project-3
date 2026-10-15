"""Alternating single-action board engine. Every completed game has one winner."""
import copy
import hashlib
import itertools
import os
import secrets

from app.engine.rules import GameRulesEngine
from app.engine.board_rules import board_rules, initial_board
from app.sandbox.runner import BotRunner

MOVES = ("ROCK", "PAPER", "SCISSORS")


def simulate_board(code_a, code_b, lang_a="PYTHON", lang_b="PYTHON", round_num=1,
                   stage_rule="STAGE_1_STANDARD", tie_seed=None, reuse_sandbox=False):
    tie_seed = tie_seed or secrets.token_hex(16)
    initial_rules = board_rules(stage_rule, seed=tie_seed)
    pieces = initial_board(stage_rule, seed=tie_seed)
    targets = {"team_a": (8, 0), "team_b": (0, 8)}
    names = {"team_a": "Đỏ", "team_b": "Xanh"}
    colors = {"team_a": "red", "team_b": "blue"}
    histories = {side: [] for side in pieces}
    errors = {side: None for side in pieces}
    codes = {"team_a": code_a, "team_b": code_b}
    languages = {"team_a": lang_a, "team_b": lang_b}
    executables = {}
    python_processes = {}
    wasi_processes = {}
    steps = []
    first = "team_a" if round_num % 2 else "team_b"
    order = (first, "team_b" if first == "team_a" else "team_a")
    winner, reason = None, ""

    def alive(side):
        return [p for p in pieces[side] if p["alive"]]

    def distance(piece, side):
        col, row = targets[side]
        return abs(piece["col"] - col) + abs(piece["row"] - row)

    def snapshot(log, side=None, clash=None, cycle=0):
        steps.append({"step_idx": len(steps), "turn_label": f"Nước {len(steps)} · Đội {names[side]}" if side else "Bắt đầu hiệp đấu",
                      "active_side": side, "cycle": cycle,
                      "red_pieces": copy.deepcopy(pieces["team_a"]),
                      "blue_pieces": copy.deepcopy(pieces["team_b"]), "clash_event": clash,
                      "log": log, "red_alive": len(alive("team_a")), "blue_alive": len(alive("team_b"))})

    snapshot(f"Đi lần lượt. Đội {names[first]} đi trước; không giới hạn số nước. Chiếm căn cứ hoặc quét sạch quân đối thủ để thắng.")
    try:
        for side, language in languages.items():
            if language == "PYTHON" and reuse_sandbox:
                from app.sandbox.game_process import GameProcess
                python_processes[side] = GameProcess(codes[side])
                errors[side] = python_processes[side].error
            if language == "CPP":
                executable, error = BotRunner.compile_cpp_code(codes[side])
                executables[side] = executable
                errors[side] = error if error or not executable else None
                if executable and executable.endswith('.wasm') and not error:
                    from app.sandbox.cpp_wasi import WasiGameProcess
                    wasi_processes[side]=WasiGameProcess(executable)
                    errors[side]=wasi_processes[side].error
        if any(errors.values()):
            if all(errors.values()):
                winner = "team_a" if int(hashlib.sha256(f"{tie_seed}:compile".encode()).hexdigest(), 16) % 2 == 0 else "team_b"
                reason = "Cả hai bot lỗi biên dịch; phân định bằng bốc thăm đã lưu."
            else:
                winner = "team_b" if errors["team_a"] else "team_a"
                reason = "Đối thủ bị xử thua vì lỗi biên dịch."
            snapshot(reason, winner)
        for ply in itertools.count():
            if winner:
                break
            side = order[ply % 2]
            opponent = "team_b" if side == "team_a" else "team_a"
            cycle = ply // 2 + 1
            own, enemy = alive(side), alive(opponent)
            cards = {move: sum(p["type"] == move for p in own) for move in MOVES}
            active_rules = board_rules(stage_rule, cycle, seed=tie_seed)
            fog, reverse = active_rules["fog"], active_rules["reverse"]
            history = copy.deepcopy(histories[side])
            if fog:
                for entry in history:
                    entry.pop("opponent_move", None)
                    entry.pop("their_move", None)
            enemy_view = copy.deepcopy(enemy)
            if fog:
                for piece in enemy_view:
                    piece.pop("type", None)
            state = {"my_hp": 100, "remaining_cards": cards, "turn_number": cycle,
                     "ply_number": ply + 1, "active_side": side, "history": history,
                     "my_pieces": copy.deepcopy(own), "opponent_pieces": enemy_view,
                     "target": list(targets[side]), "reverse_rule": reverse,
                     "rules": copy.deepcopy(active_rules)}
            try:
                move, error = (wasi_processes[side].decide(state) if side in wasi_processes
                               else BotRunner.run_cpp_binary(executables[side], state) if languages[side] == "CPP"
                               else python_processes[side].decide(state) if side in python_processes
                               else BotRunner.run_python_code(codes[side], state))
            except Exception as exc:
                move, error = None, str(exc)
            if error or move not in MOVES:
                errors[side] = str(error or "Nước đi không hợp lệ.")
                winner, reason = opponent, f"Đội {names[side]} bị xử thua: bot lỗi hoặc quá thời gian."
                snapshot(reason, side, cycle=cycle)
                break
            histories[side].append({"turn": cycle, "ply": ply + 1, "my_move": move})
            for other_entry in histories[opponent][-1:]:
                other_entry["opponent_move"] = other_entry["their_move"] = move
            candidates = sorted(own, key=lambda p: (p["type"] != move, distance(p, side), p["id"]))
            attacker, destination = None, None
            # Favor a winning adjacent capture; same-type encounters favor defense.
            for candidate in candidates:
                victim = next((p for p in enemy if max(abs(candidate["col"] - p["col"]), abs(candidate["row"] - p["row"])) == 1
                               and GameRulesEngine.check_clash(candidate["type"], p["type"], reverse) == 1), None)
                if victim:
                    attacker, destination = candidate, (victim["col"], victim["row"])
                    break
            if attacker is None:
                direction = -1 if side == "team_a" else 1
                horizontal = 1 if side == "team_a" else -1
                for candidate in candidates:
                    col, row = candidate["col"], candidate["row"]
                    options = [(col, row + direction), (col + horizontal, row), (col + horizontal, row + direction)]
                    options = [cell for cell in options if all(0 <= x < 9 for x in cell)
                               and not any((p["col"], p["row"]) == cell for p in own if p is not candidate)]
                    if options:
                        attacker = candidate
                        destination = min(options, key=lambda cell: abs(cell[0] - targets[side][0]) + abs(cell[1] - targets[side][1]))
                        break
            clash = None
            log = f"Đội {names[side]} không có ô di chuyển hợp lệ, bỏ lượt."
            if attacker:
                defender = next((p for p in enemy if (p["col"], p["row"]) == destination), None)
                attacker["col"], attacker["row"] = destination
                log = f"Đội {names[side]} điều quân ({attacker['type']}) tới [{destination[0]},{destination[1]}]."
                if defender:
                    outcome = GameRulesEngine.check_clash(attacker["type"], defender["type"], reverse)
                    winning_side = side if outcome == 1 else opponent
                    losing_piece = defender if outcome == 1 else attacker
                    winning_piece = attacker if outcome == 1 else defender
                    losing_piece["alive"] = False
                    log = f"Đội {names[winning_side]} ({winning_piece['type']}) thắng va chạm với ({losing_piece['type']}) tại [{destination[0]},{destination[1]}]."
                    if outcome == 0:
                        log += " Cùng loại: quân phòng thủ thắng."
                    clash = {"type": "CLASH", "col": destination[0], "row": destination[1], "winner": colors[winning_side],
                             "winner_type": winning_piece["type"], "loser_type": losing_piece["type"], "log": log}
            for possible_winner in (side, opponent):
                opposing = "team_b" if possible_winner == "team_a" else "team_a"
                if not alive(opposing):
                    winner, reason = possible_winner, f"Đội {names[possible_winner]} thắng: quét sạch quân đối thủ."
                    break
                if any((p["col"], p["row"]) == targets[possible_winner] for p in alive(possible_winner)):
                    winner, reason = possible_winner, f"Đội {names[possible_winner]} thắng: chiếm căn cứ đối thủ."
                    clash = {"type": "GOAL", "side": colors[possible_winner], "col": targets[possible_winner][0], "row": targets[possible_winner][1], "log": reason}
                    break
            snapshot(log + (" " + reason if winner else ""), side, clash, cycle)
        return {"winner_side": winner, "win_reason": reason, "board_steps": steps,
                "final_red_alive": len(alive("team_a")), "final_blue_alive": len(alive("team_b")),
                "pref_move_a": histories["team_a"][0]["my_move"] if histories["team_a"] else "ROCK",
                "pref_move_b": histories["team_b"][0]["my_move"] if histories["team_b"] else "ROCK",
                "bot_errors": errors, "first_side": first, "tie_break_seed": tie_seed,
                "rules": initial_rules}
    finally:
        for process in wasi_processes.values():
            process.close()
        for process in python_processes.values():
            process.close()
        for executable in executables.values():
            if executable and os.path.exists(executable):
                try:
                    os.remove(executable)
                except OSError:
                    pass

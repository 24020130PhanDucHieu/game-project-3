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
ALL_MOVES = ("ROCK", "PAPER", "SCISSORS", "JOKER")

PORTAL_WARP_MAP = {
    (2, 2): (6, 6),
    (6, 6): (2, 2),
    (2, 6): (6, 2),
    (6, 2): (2, 6)
}
EVOLVE_TILES_SET = {(4, 4)}
TRAP_TILES_SET = {(3, 4), (5, 4), (4, 1), (4, 7)}
EVOLVE_CYCLE = {
    "SCISSORS": "ROCK",
    "ROCK": "PAPER",
    "PAPER": "SCISSORS"
}


MAX_PLIES = 2000  # chốt an toàn; trận thật kết thúc sớm hơn rất nhiều


def stalemate_winner(pieces, targets, names, seed):
    """Bàn cờ kẹt: nhiều quân sống hơn thắng; bằng nhau thì quân gần căn cứ đối thủ hơn thắng; vẫn bằng thì bốc thăm theo seed."""
    def score(side):
        alive = [p for p in pieces[side] if p["alive"]]
        col, row = targets[side]
        return len(alive), -min((abs(p["col"] - col) + abs(p["row"] - row) for p in alive), default=99)
    a, b = score("team_a"), score("team_b")
    if a != b:
        side = "team_a" if a > b else "team_b"
        how = "còn nhiều quân hơn" if a[0] != b[0] else "có quân gần căn cứ đối thủ hơn"
    else:
        side = "team_a" if int(hashlib.sha256(f"{seed}:stalemate".encode()).hexdigest(), 16) % 2 == 0 else "team_b"
        how = "bốc thăm đã lưu (hai bên ngang nhau)"
    return side, f"Bàn cờ bế tắc, không bên nào còn nước đi. Đội {names[side]} thắng vì {how}."


def simulate_board(code_a, code_b, lang_a="PYTHON", lang_b="PYTHON", round_num=1,
                   stage_rule="STAGE_1_STANDARD", tie_seed=None, reuse_sandbox=False,
                   record_replay=True, policies=None, trace=None):
    """policies: {'team_a': fn(state)->card, ...} chạy ngay trong tiến trình (sinh dữ liệu cho Giải AI), thay cho bot trong sandbox.
    trace: fn(event) gọi sau mỗi nước đi với {'ply','side','state','move','clash','alive','pieces'}; không đổi luật chơi."""
    tie_seed = tie_seed or secrets.token_hex(16)
    initial_rules = board_rules(stage_rule, seed=tie_seed)
    pieces = initial_board(stage_rule, seed=tie_seed)

    mystery_tiles = copy.deepcopy(initial_rules.get("mystery_tiles", {}))
    special_mode = bool(initial_rules.get("special_tiles", False))
    obstacles_list = [list(c) for c in initial_rules.get("obstacles", [])]
    obstacles_set = set(tuple(c) for c in obstacles_list)

    evolve_tiles_set = set(tuple(c) for c in mystery_tiles.get("evolve", []))
    portal_warp_map = {}
    for pair in mystery_tiles.get("portals", []):
        p1, p2 = tuple(pair[0]), tuple(pair[1])
        portal_warp_map[p1] = p2
        portal_warp_map[p2] = p1
    active_traps = set(tuple(c) for c in mystery_tiles.get("traps", []))

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
    passes = 0  # số lượt bỏ liên tiếp của cả hai bên; 2 nghĩa là bàn cờ đã kẹt vĩnh viễn

    def alive(side):
        return [p for p in pieces[side] if p["alive"]]

    def distance(piece, side):
        col, row = targets[side]
        return abs(piece["col"] - col) + abs(piece["row"] - row)

    def snapshot(log, side=None, clash=None, cycle=0):
        if not record_replay:
            return
        current_tiles = {
            "evolve": [list(c) for c in evolve_tiles_set],
            "portals": [list(pair) for pair in mystery_tiles.get("portals", [])],
            "traps": [list(c) for c in active_traps],
            "obstacles": [list(c) for c in obstacles_list]
        }
        steps.append({"step_idx": len(steps), "turn_label": f"Nước {len(steps)} · Đội {names[side]}" if side else "Bắt đầu hiệp đấu",
                      "active_side": side, "cycle": cycle,
                      "red_pieces": [dict(p) for p in pieces["team_a"]],
                      "blue_pieces": [dict(p) for p in pieces["team_b"]], "clash_event": clash,
                      "mystery_tiles": current_tiles,
                      "obstacles": [list(c) for c in obstacles_list],
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
            if passes >= 2 or ply >= MAX_PLIES:
                # Không bên nào còn nước đi (trạng thái không đổi nữa): phân xử ngay để trận luôn kết thúc.
                winner, reason = stalemate_winner(pieces, targets, names, tie_seed)
                snapshot(reason, winner)
                break
            side = order[ply % 2]
            opponent = "team_b" if side == "team_a" else "team_a"
            cycle = ply // 2 + 1
            own, enemy = alive(side), alive(opponent)
            active_rules = board_rules(stage_rule, cycle, seed=tie_seed)
            fog, reverse = active_rules["fog"], active_rules["reverse"]
            has_joker_now = any(p["type"] == "JOKER" for p in own)
            has_joker_mode = bool(initial_rules.get("has_joker", False)) or has_joker_now
            card_types = ALL_MOVES if has_joker_mode else MOVES
            cards = {move: sum(p["type"] == move for p in own) for move in card_types}
            if fog:
                history = [{k: v for k, v in entry.items() if k not in ("opponent_move", "their_move")} for entry in histories[side]]
                enemy_view = [{k: v for k, v in p.items() if k != "type"} for p in enemy]
            else:
                history = [dict(entry) for entry in histories[side]]
                enemy_view = [dict(p) for p in enemy]
            state = {"my_hp": 100, "remaining_cards": cards, "turn_number": cycle,
                     "ply_number": ply + 1, "active_side": side, "history": history,
                     "my_pieces": [dict(p) for p in own], "opponent_pieces": enemy_view,
                     "target": list(targets[side]), "reverse_rule": reverse,
                     "obstacles": [list(c) for c in obstacles_list],
                     "rules": dict(active_rules)}
            try:
                move, error = (policies[side](state), None) if policies and side in policies else (wasi_processes[side].decide(state) if side in wasi_processes
                               else BotRunner.run_cpp_binary(executables[side], state) if languages[side] == "CPP"
                               else python_processes[side].decide(state) if side in python_processes
                               else BotRunner.run_python_code(codes[side], state))
            except Exception as exc:
                move, error = None, str(exc)
            allowed_moves = ALL_MOVES if has_joker_mode else MOVES
            if error or move not in allowed_moves:
                errors[side] = str(error or "Nước đi không hợp lệ.")
                winner, reason = opponent, f"Đội {names[side]} bị xử thua: bot lỗi hoặc quá thời gian."
                snapshot(reason, side, cycle=cycle)
                break
            histories[side].append({"turn": cycle, "ply": ply + 1, "my_move": move})
            for other_entry in histories[opponent][-1:]:
                other_entry["opponent_move"] = other_entry["their_move"] = move
            movable = [p for p in own if not (p["type"] == "JOKER" and p.get("steps_left", 5) <= 0)]
            candidates = sorted(movable or own, key=lambda p: (p["type"] != move, distance(p, side), p["id"]))
            attacker, destination = None, None
            # Favor a winning adjacent capture; same-type encounters favor defense.
            for candidate in candidates:
                victim = next((p for p in enemy if max(abs(candidate["col"] - p["col"]), abs(candidate["row"] - p["row"])) == 1
                               and (p["col"], p["row"]) not in obstacles_set
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
                    # Chỉ đi vào ô trống: quân không tự lao vào quân địch, chỉ tấn công khi thắng (khối ở trên).
                    options = [cell for cell in options if all(0 <= x < 9 for x in cell)
                               and cell not in obstacles_set
                               and not any((p["col"], p["row"]) == cell for p in own if p is not candidate)
                               and not any((p["col"], p["row"]) == cell for p in enemy)]
                    if options:
                        attacker = candidate
                        destination = min(options, key=lambda cell: abs(cell[0] - targets[side][0]) + abs(cell[1] - targets[side][1]))
                        break
            clash = None
            log = f"Đội {names[side]} không có ô di chuyển hợp lệ, bỏ lượt."
            passes = 0 if attacker else passes + 1
            if attacker:
                origin = (attacker["col"], attacker["row"])
                if attacker["type"] == "JOKER":
                    attacker["steps_left"] = attacker.get("steps_left", 5) - 1

                # Check Portal Warp
                if special_mode and destination in portal_warp_map:
                    warp_target = portal_warp_map[destination]
                    if not any(p["alive"] and (p["col"], p["row"]) == warp_target for p in own if p is not attacker):
                        origin_portal = destination
                        destination = warp_target
                        attacker["col"], attacker["row"] = destination
                        defender = next((p for p in enemy if (p["col"], p["row"]) == destination), None)
                        if defender:
                            log = f"[Cổng Dịch Chuyển] Quân ({attacker['type']}) của Đội {names[side]} nhảy từ [{origin_portal[0]},{origin_portal[1]}] sang [{destination[0]},{destination[1]}] tập kích ({defender['type']}) đối thủ!"
                        else:
                            log = f"[Cổng Dịch Chuyển] Quân ({attacker['type']}) của Đội {names[side]} nhảy từ [{origin_portal[0]},{origin_portal[1]}] sang [{destination[0]},{destination[1]}] sau lưng đối thủ!"
                        clash = {"type": "WARP", "from_col": origin_portal[0], "from_row": origin_portal[1],
                                 "col": destination[0], "row": destination[1], "log": log}
                    else:
                        attacker["col"], attacker["row"] = destination
                        defender = next((p for p in enemy if (p["col"], p["row"]) == destination), None)
                        log = f"Đội {names[side]} điều quân ({attacker['type']}) tới [{destination[0]},{destination[1]}]."
                else:
                    attacker["col"], attacker["row"] = destination
                    defender = next((p for p in enemy if (p["col"], p["row"]) == destination), None)
                    log = f"Đội {names[side]} điều quân ({attacker['type']}) tới [{destination[0]},{destination[1]}]."

                # Check Evolve Tile
                if special_mode and destination in evolve_tiles_set and attacker["type"] in EVOLVE_CYCLE:
                    old_type = attacker["type"]
                    attacker["type"] = EVOLVE_CYCLE[old_type]
                    evolve_msg = f" [Ô Tiến Hóa] ({old_type}) tiến hóa thành ({attacker['type']})!"
                    log += evolve_msg
                    if not clash:
                        clash = {"type": "EVOLVE", "col": destination[0], "row": destination[1],
                                 "old_type": old_type, "new_type": attacker["type"], "log": log}

                # Check Trap Tile
                if special_mode and destination in active_traps:
                    active_traps.remove(destination)
                    attacker["alive"] = False
                    if defender:
                        defender["alive"] = False
                        log = f"[BẪY MÌN PHÁT NỔ] Cả quân ({attacker['type']}) của Đội {names[side]} và ({defender['type']}) của Đội {names[opponent]} dẫm bẫy tại [{destination[0]},{destination[1]}] và cùng bị loại bỏ!"
                    else:
                        log = f"[BẪY MÌN PHÁT NỔ] Quân ({attacker['type']}) của Đội {names[side]} dẫm bẫy mìn ẩn tại [{destination[0]},{destination[1]}] và bị loại bỏ!"
                    clash = {"type": "TRAP", "col": destination[0], "row": destination[1], "side": colors[side], "log": log}
                elif defender and attacker["alive"] and defender["alive"]:
                    outcome = GameRulesEngine.check_clash(attacker["type"], defender["type"], reverse)
                    if outcome == 0:
                        # Cùng loại không ăn được nhau: hai quân còn nguyên, quân tấn công lùi về ô cũ.
                        attacker["col"], attacker["row"] = origin
                        log = f"Quân ({attacker['type']}) của Đội {names[side]} gặp quân cùng loại tại [{destination[0]},{destination[1]}]: hòa, không quân nào bị loại, quân tấn công lùi về [{origin[0]},{origin[1]}]."
                        clash = {"type": "CLASH", "col": destination[0], "row": destination[1], "winner": None, "draw": True,
                                 "winner_type": attacker["type"], "loser_type": defender["type"], "log": log}
                    else:
                        winning_side = side if outcome == 1 else opponent
                        losing_piece = defender if outcome == 1 else attacker
                        winning_piece = attacker if outcome == 1 else defender
                        losing_piece["alive"] = False
                        if outcome == -1:
                            attacker["col"], attacker["row"] = destination  # quân tấn công bị loại tại ô va chạm
                        log = f"Đội {names[winning_side]} ({winning_piece['type']}) thắng va chạm với ({losing_piece['type']}) tại [{destination[0]},{destination[1]}]."
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
            if trace:
                trace({"ply": ply, "side": side, "state": state, "move": move, "clash": clash, "pieces": pieces,
                       "alive": (len(alive("team_a")), len(alive("team_b"))), "winner": winner})
            snapshot(log + (" " + reason if winner else ""), side, clash, cycle)
        return {"winner_side": winner, "win_reason": reason, "board_steps": steps,
                "final_red_alive": len(alive("team_a")), "final_blue_alive": len(alive("team_b")),
                "pref_move_a": histories["team_a"][0]["my_move"] if histories["team_a"] else "ROCK",
                "pref_move_b": histories["team_b"][0]["my_move"] if histories["team_b"] else "ROCK",
                "bot_errors": errors, "first_side": first, "tie_break_seed": tie_seed,
                "mystery_tiles": copy.deepcopy(mystery_tiles),
                "obstacles": copy.deepcopy(obstacles_list),
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

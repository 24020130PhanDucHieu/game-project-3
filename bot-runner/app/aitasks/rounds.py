"""Hiệp đấu kiểu đề ML của giải chính AI (tournament["round_mode"] == "TASK"): kế hoạch đề, kiểm tra mã nộp và chấm một hiệp."""
import hashlib
import time

from app.aitasks import catalog, runner


def _entry(tourn, match):
    plan = tourn.get("ai_task_plan") or {}
    if not plan.get("locked"):
        raise ValueError("Ban tổ chức chưa khóa bộ đề của giải chính AI.")
    levels = plan.get("levels") or {}
    items = levels.get(str(match.get("round_level", 1))) or []
    index = int(match.get("current_round_idx", 1)) - 1
    if index < 0 or index >= len(items):
        raise ValueError("Bộ đề chưa có đề cho hiệp này.")
    return items[index]


def task_item(tourn, match):
    """Mục đề (có hạt giống) của hiệp hiện tại của trận."""
    entry = _entry(tourn, match)
    return catalog.normalize_item(entry.get("item") if isinstance(entry, dict) and "item" in entry else entry)


def public_task(tourn, match):
    item = task_item(tourn, match)
    return catalog.public_spec(item, int(match.get("current_round_idx", 1)))


def validate_submission(code, language, tourn, match):
    """Cùng dạng kết quả với BotRunner.validate_bot_code: {is_valid, error_message, execution_time_ms, test_move}."""
    if language != "PYTHON":
        return {"is_valid": False, "error_message": "Hiệp đề học máy chỉ nhận Python.", "execution_time_ms": 0, "test_move": None}
    result = runner.validate_code(code or "", task_item(tourn, match))
    result["test_move"] = None
    return result


def round_key(tournament_id, match_id, round_number):
    return f"{tournament_id}:{match_id}:{round_number}"


def play(tourn, match, team_a, team_b, round_number):
    """Chạy hiệp: hai đội cùng giải đề của hiệp, điểm riêng tư cao hơn thắng. Hòa điểm thì bốc thăm cố định theo hạt giống của trận."""
    item = task_item(tourn, match)
    key = round_key(tourn.get("tournament_id", ""), match.get("match_id", ""), round_number)
    duel = runner.duel(team_a.get("current_code", ""), team_b.get("current_code", ""), item, key)
    scores, errors = duel["scores"], duel["errors"]
    winner = duel["winner"]
    tie = winner is None
    if tie:
        digest = hashlib.sha256(f"{match.get('tie_break_seed', '')}:{round_number}:task".encode()).hexdigest()
        winner = "team_a" if int(digest, 16) % 2 == 0 else "team_b"
    names = {"team_a": team_a["team_name"], "team_b": team_b["team_name"]}
    spec = catalog.public_spec(item, round_number)
    reason = (f"Đề {round_number}: {spec['name']}. Điểm riêng tư: {names['team_a']} {scores['team_a']:.1f} — {names['team_b']} {scores['team_b']:.1f}. "
              + (f"Hòa điểm nên bốc thăm đã lưu: {names[winner]} thắng hiệp." if tie else f"{names[winner]} có điểm cao hơn và thắng hiệp."))
    return {"winner_side": winner, "win_reason": reason, "scores": scores, "errors": errors, "task": spec, "tie": tie,
            "tie_break_seed": hashlib.sha256(f"{match.get('tie_break_seed', '')}:{round_number}".encode()).hexdigest()[:16], "at": time.time()}

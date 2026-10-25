"""Phần kết thúc một hiệp đề ML (tách khỏi database.py để dễ đọc): dựng bản ghi hiệp và cập nhật điểm/HP.

Hàm trả về `round_record` và các nhật ký; việc đóng trận, nghỉ giữa hiệp và lưu vẫn do Database làm như hiệp bàn cờ.
"""
import time

DAMAGE = 20  # HP chỉ để phân thắng bại khi hòa số hiệp; cố định cho hiệp đề ML


def build_record(res, team_a, team_b, r_num, sub_a_id, sub_b_id):
    winner_side, win_reason = res["winner_side"], res["win_reason"]
    if winner_side == "team_a":
        team_a["rounds_won"] += 1
        team_b["hp"] = max(0, team_b["hp"] - DAMAGE)
    else:
        team_b["rounds_won"] += 1
        team_a["hp"] = max(0, team_a["hp"] - DAMAGE)
    bot_logs = []
    for side, team, sub_id in (("team_a", team_a, sub_a_id), ("team_b", team_b, sub_b_id)):
        error = res["errors"].get(side)
        bot_logs.append({"side": side, "team_name": team["team_name"], "lang": team.get("current_lang", "PYTHON"), "status": "FAILED" if error else "EXECUTED", "error": error,
                         "preferred_move": None, "submission_id": sub_id,
                         "log": f"Mô hình {team['team_name']}: lỗi ({error})." if error else f"Mô hình {team['team_name']} chạy xong, điểm riêng tư {res['scores'][side]:.1f}."})
    now_str = time.strftime("%H:%M:%S")
    system_logs = [f"[{now_str}] [Ban Tổ Chức] Chấm hiệp {r_num}. Đã khóa mã nguồn 2 đội ({sub_a_id}, {sub_b_id}).",
                   f"[{now_str}] [Đề] {res['task']['name']} ({res['task']['title']}), luật {res['task']['rule_id']}.",
                   f"[{now_str}] [Kết Quả Hiệp {r_num}] {win_reason}"]
    record = {
        "round_kind": "TASK", "stage_rule": "TASK", "rules": {}, "round_number": r_num, "sub_a_id": sub_a_id, "sub_b_id": sub_b_id,
        "team_a_code": team_a["current_code"], "team_b_code": team_b["current_code"], "team_a_lang": team_a.get("current_lang", "PYTHON"), "team_b_lang": team_b.get("current_lang", "PYTHON"),
        "team_a_name": team_a["team_name"], "team_b_name": team_b["team_name"], "team_a_hp": team_a["hp"], "team_b_hp": team_b["hp"],
        "team_a_move": None, "team_b_move": None, "winner": winner_side, "winner_name": team_a["team_name"] if winner_side == "team_a" else team_b["team_name"],
        "win_reason": win_reason, "damage": DAMAGE, "first_side": None, "tie_break_seed": res["tie_break_seed"], "final_red_alive": 0, "final_blue_alive": 0,
        "board_steps": [], "mystery_tiles": {}, "task": res["task"], "scores": res["scores"], "tie": res["tie"], "task_errors": res["errors"],
        "move_logs": [], "bot_logs": bot_logs, "system_logs": system_logs, "log": f"Hiệp {r_num}: {win_reason}", "timestamp": time.time(),
    }
    return record, bot_logs, system_logs

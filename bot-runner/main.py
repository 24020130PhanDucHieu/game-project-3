import json
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional

from app.repository.database import Database

app = FastAPI(title="Stateless Engine Worker")

@app.get("/health")
def worker_health():
    return {"status": "healthy"}

# Create a dummy database instance that doesn't use background threads or files
class StatelessDatabase(Database):
    def __init__(self):
        # DO NOT call super().__init__() which spawns threads
        self.users = {}
        self.bots = {}
        self.bot_versions = {}
        self.matches = {}
        self.solo_rooms = {}
        self.tournaments = {}
        self.active_tournament_id = None
        self._seed_default_data()

    def save_tournaments_to_file(self):
        pass # NO-OP

class MutateRequest(BaseModel):
    tournament: Optional[dict] = None
    action: str
    params: dict = {}

@app.post("/mutate-tournament")
def mutate_tournament(req: MutateRequest):
    # The gateway owns persistence. Never share mutable tournament state across requests.
    stateless_db = StatelessDatabase()
    t = req.tournament
    t_id = t["tournament_id"] if t else None
    action = req.action
    p = req.params

    if t_id and t:
        stateless_db.tournaments[t_id] = t
    
    action_res = {}
    try:
        if t_id:
            stateless_db.upgrade_tournament_rules(t_id)
        if action in {"submit-draft", "submit-code"} and t_id:
            match = stateless_db.tournaments[t_id].get("matches", {}).get(p.get("match_id"))
            if not match:
                raise ValueError("Không tìm thấy trận đấu.")
            if p.get("round_number") is not None and int(p["round_number"]) != match.get("current_round_idx", 1):
                raise ValueError("Hiệp đấu đã thay đổi. Hãy kiểm tra hiệp hiện tại rồi nộp lại.")
            side = p.get("side") or "team_a"
            if p.get("session_authenticated") and match.get(side):
                match[side]["authenticated"] = True
        if action == "validate-code":
            from app.sandbox.runner import BotRunner
            return BotRunner.validate_bot_code(p.get("code_content") or "", p.get("language") or "PYTHON")
        elif action == "create-tournament":
            new_t = stateless_db.create_tournament(p.get("name"), p.get("num_teams", 8))
            return {"status": "SUCCESS", "tournament": new_t}
        elif action == "qualifier-game":
            from app.engine.board import simulate_board
            result = simulate_board(p.get("code_a") or "", p.get("code_b") or "", p.get("language_a") or "PYTHON", p.get("language_b") or "PYTHON", 1 if p.get("first") == 1 else 2, "STAGE_1_STANDARD", p.get("seed"), reuse_sandbox=True)
            return {key: result[key] for key in ("winner_side", "win_reason", "final_red_alive", "final_blue_alive", "first_side", "bot_errors")}
        elif action == "import-qualified":
            tournament = stateless_db.tournaments[t_id]
            event_id = p.get("qualifier_id")
            if tournament.get("qualifier_id") != event_id:
                if tournament.get("teams") or any(m.get("rounds_history") for m in tournament.get("matches", {}).values()):
                    raise ValueError("Chọn giải chính còn trống, chưa có đội hoặc kết quả.")
                teams = p.get("teams") or []
                count = p.get("top_k")
                if count not in (8, 16, 32) or count != tournament.get("num_teams") or len(teams) != count:
                    raise ValueError("Số đội của giải chính phải bằng top K vòng loại.")
                ids = [t.get("student_id") for t in teams]
                if len(set(ids)) != count or not all(ids):
                    raise ValueError("Mã sinh viên trùng hoặc thiếu.")
                for team in teams:
                    stateless_db.add_team_to_tournament(t_id, team["team_name"], team["student_id"], "Vòng loại")
                    tournament["teams"][-1]["elo"] = team.get("elo", 1200)
                tournament["qualifier_id"] = event_id
                stateless_db.auto_schedule_tournament(t_id)
        elif action == "upgrade-rules":
            pass
        elif action == "auto-schedule":
            stateless_db.auto_schedule_tournament(t_id)
        elif action == "set-rule":
            stage_name = p.get("stage_name")
            allowed_stages = {"STAGE_1_STANDARD", "STAGE_2_MUTATED", "STAGE_3_REVERSE_FOG", "STAGE_4_FINALS"}
            if stage_name not in allowed_stages:
                raise ValueError("Invalid tournament rule.")
            stateless_db.tournaments[t_id]["stage_rule"] = stage_name
        elif action == "quick-fill":
            stateless_db.quick_fill_demo_teams(t_id)
        elif action == "add-team":
            action_res = stateless_db.add_team_to_tournament(t_id, p.get("team_name"), p.get("student_id"), p.get("university"))
        elif action == "remove-team":
            stateless_db.remove_team_from_tournament(t_id, p.get("student_id"))
        elif action == "play-round":
            action_res = stateless_db.play_match_round(t_id, p.get("match_id"))
        elif action == "login":
            user = str(p.get("username") or p.get("role") or p.get("student_id") or "").strip()
            pwd = str(p.get("password") or "").strip()
            login_res = stateless_db.authenticate_match_login(t_id, p.get("match_id"), user, pwd, p.get("student_id"))
            return {
                "status": "SUCCESS",
                "role": login_res.get("role"),
                "side": login_res.get("side"),
                "team": login_res.get("team"),
                "message": login_res.get("message"),
                "tournament": stateless_db.tournaments[t_id]
            }
        elif action == "auth":
            side = p.get("side") or "team_a"
            auth_res = stateless_db.authenticate_match_team(t_id, p.get("match_id"), side, p.get("student_id"), p.get("password"))
            return {
                "status": "SUCCESS",
                "result": auth_res,
                "tournament": stateless_db.tournaments[t_id]
            }
        elif action == "submit-draft":
            side = p.get("side") or "team_a"
            code = p.get("code_content") or p.get("code") or ""
            lang = p.get("language") or "PYTHON"
            stateless_db.update_match_draft_code(t_id, p.get("match_id"), side, code, lang)
        elif action == "submit-code":
            side = p.get("side") or "team_a"
            code = p.get("code_content") or p.get("code") or ""
            lang = p.get("language") or "PYTHON"
            action_res = stateless_db.update_match_code(t_id, p.get("match_id"), side, code, lang)
        elif action == "demo-fill":
            action_res = stateless_db.quick_fill_demo_bots(t_id, p.get("match_id"))
        elif action == "reset":
            action_res = stateless_db.reset_match(t_id, p.get("match_id"))
        elif action == "next-round":
            action_res = stateless_db.advance_to_next_round(t_id, p.get("match_id"))
        elif action == "practice-match":
            code = p.get("code_content") or ""
            lang = p.get("language") or "PYTHON"
            side = p.get("side") or "team_a"
            boss = p.get("boss") or "RANDOM"
            res = stateless_db.run_practice_match(code, lang, side, boss)
            return res
        else:
            raise HTTPException(status_code=400, detail="Unknown action")
            
        # Return mutated tournament merged with action result
        resp = {"status": "SUCCESS", "tournament": stateless_db.tournaments[t_id]}
        if isinstance(action_res, dict):
            for k, v in action_res.items():
                if k not in resp:
                    resp[k] = v
        return resp
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        if t_id in stateless_db.tournaments:
            del stateless_db.tournaments[t_id]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)

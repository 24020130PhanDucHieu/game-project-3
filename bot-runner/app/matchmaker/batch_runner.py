# -*- coding: utf-8 -*-
"""
Bộ điều phối Thi đấu Phân tán và Chạy theo đợt (Batch Runner & Match Coordinator).
Kết nối Máy trạng thái FSM, Sandbox Runner và Cập nhật Elo tự động.
"""

from typing import List, Dict, Optional, Tuple
import asyncio
from app.engine.fsm_match import MatchFSM
from app.sandbox.runner import BotRunner, BTCBossBots
from app.matchmaker.ranking import EloCalculator
from app.database import db
from app.models.schemas import MatchHistory, SelfPlayResponse, TournamentStage, BotLanguage

class MatchCoordinator:
    @staticmethod
    def _get_bot_move(bot_id: str, bot_info: dict, code_info: Optional[dict], game_state: dict) -> str:
        """Lấy nước đi của một Bot (hỗ trợ Boss BTC, Python và C++)"""
        # Nếu là Boss của BTC
        if bot_info.get("is_boss", False):
            if bot_id == "boss_random":
                return BTCBossBots.random_boss(game_state)
            elif bot_id == "boss_counter":
                return BTCBossBots.counter_boss(game_state)
            elif bot_id == "boss_nash":
                return BTCBossBots.nash_markov_boss(game_state)
            return "ROCK"

        # Nếu là Bot của thí sinh
        if not code_info:
            return "ROCK"

        language = code_info.get("language", BotLanguage.PYTHON)
        code_str = code_info.get("code_content", "")

        if language == BotLanguage.PYTHON:
            move, err = BotRunner.run_python_code(code_str, game_state, timeout=1.0)
            return move
        elif language == BotLanguage.CPP:
            # Biên dịch sang exe (nếu chưa có trong cache)
            exe_path, compile_err = BotRunner.compile_cpp_code(code_str)
            if compile_err or not exe_path:
                return "ROCK"
            move, run_err = BotRunner.run_cpp_binary(exe_path, game_state, timeout=1.0)
            return move

        return "ROCK"

    @staticmethod
    def run_direct_match(
        bot_id_1: str,
        bot_id_2: str,
        stage: Optional[str] = None,
        match_type: str = "SOLO_1V1",
        room_code: Optional[str] = None
    ) -> MatchHistory:
        """Thực thi một trận đấu 1v1 hoàn chỉnh và lưu kết quả"""
        stage = stage or db.current_stage
        bot1 = db.bots.get(bot_id_1, {})
        bot2 = db.bots.get(bot_id_2, {})
        code1 = db.get_active_code(bot_id_1)
        code2 = db.get_active_code(bot_id_2)

        fsm = MatchFSM(match_type=match_type, stage=stage, room_code=room_code)
        fsm.add_player(bot_id_1, bot1.get("bot_name", "Bot_1"))
        fsm.add_player(bot_id_2, bot2.get("bot_name", "Bot_2"))

        # Vòng lặp các hiệp đấu
        while not fsm.is_finished:
            state_1 = fsm.get_public_state_for_player(bot_id_1)
            state_2 = fsm.get_public_state_for_player(bot_id_2)

            move_1 = MatchCoordinator._get_bot_move(bot_id_1, bot1, code1, state_1)
            move_2 = MatchCoordinator._get_bot_move(bot_id_2, bot2, code2, state_2)

            fsm.execute_turn({
                bot_id_1: move_1,
                bot_id_2: move_2
            })

        summary = fsm.get_summary()

        # Cập nhật điểm Elo (nếu không phải đấu Boss)
        if not bot1.get("is_boss") and not bot2.get("is_boss"):
            current_ratings = {
                bot_id_1: bot1.get("elo_score", 1000),
                bot_id_2: bot2.get("elo_score", 1000)
            }
            ranks = {}
            if summary.winner_id == bot_id_1:
                ranks = {bot_id_1: 1, bot_id_2: 2}
            elif summary.winner_id == bot_id_2:
                ranks = {bot_id_2: 1, bot_id_1: 2}
            else:
                ranks = {bot_id_1: 1, bot_id_2: 1} # Hòa

            new_ratings = EloCalculator.update_multiplayer_elo(current_ratings, ranks)
            summary.elo_changes = {
                pid: new_ratings[pid] - current_ratings[pid] for pid in current_ratings
            }
            # Lưu lại vào DB
            bot1["elo_score"] = new_ratings[bot_id_1]
            bot2["elo_score"] = new_ratings[bot_id_2]

        db.save_match(summary)
        return summary

    @staticmethod
    def run_self_play_benchmark(
        student_id: str,
        version_a: str,
        version_b: str,
        num_games: int = 10
    ) -> SelfPlayResponse:
        """Đấu thử nội bộ Self-Play giữa phiên bản v2 và v1 của cùng 1 sinh viên"""
        student_id = student_id.strip().upper()
        bot_profile = db.get_bot_profile(student_id)
        if not bot_profile:
            raise ValueError("Chưa tìm thấy Bot của sinh viên này.")

        bot_id = bot_profile.bot_id
        versions = {v.version_tag: v for v in bot_profile.versions}
        v_a = versions.get(version_a)
        v_b = versions.get(version_b)

        if not v_a or not v_b:
            raise ValueError(f"Không tìm thấy một trong hai phiên bản ({version_a}, {version_b}).")

        wins_a = 0
        wins_b = 0
        draws = 0

        for g in range(num_games):
            fsm = MatchFSM(match_type="SELF_PLAY", stage=db.current_stage)
            fsm.add_player("bot_a", f"{bot_profile.bot_name} ({version_a})")
            fsm.add_player("bot_b", f"{bot_profile.bot_name} ({version_b})")

            while not fsm.is_finished:
                st_a = fsm.get_public_state_for_player("bot_a")
                st_b = fsm.get_public_state_for_player("bot_b")

                m_a, _ = BotRunner.run_python_code(v_a.code_content, st_a) if v_a.language == BotLanguage.PYTHON else ("ROCK", None)
                m_b, _ = BotRunner.run_python_code(v_b.code_content, st_b) if v_b.language == BotLanguage.PYTHON else ("ROCK", None)

                fsm.execute_turn({"bot_a": m_a, "bot_b": m_b})

            res = fsm.get_summary()
            if res.winner_id == "bot_a":
                wins_a += 1
            elif res.winner_id == "bot_b":
                wins_b += 1
            else:
                draws += 1

        win_rate_a = round((wins_a / num_games * 100), 1)
        rec = ""
        if win_rate_a >= 60.0:
            rec = f"✅ Bản {version_a} vượt trội ({win_rate_a}% thắng)! Bạn nên kích hoạt làm bản thi đấu chính thức."
        elif win_rate_a <= 40.0:
            rec = f"⚠️ Bản {version_a} yếu hơn bản cũ ({win_rate_a}% thắng). Hãy tối ưu lại thuật toán trước khi deploy!"
        else:
            rec = f"⚖️ Hai phiên bản ngang tài ngang sức ({win_rate_a}% thắng). Cần kiểm thử thêm với Boss BTC."

        return SelfPlayResponse(
            bot_name=bot_profile.bot_name,
            version_a=version_a,
            version_b=version_b,
            games_played=num_games,
            wins_a=wins_a,
            wins_b=wins_b,
            draws=draws,
            win_rate_a=win_rate_a,
            recommendation=rec
        )

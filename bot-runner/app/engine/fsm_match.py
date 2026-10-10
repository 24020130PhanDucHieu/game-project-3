# -*- coding: utf-8 -*-
"""
Máy trạng thái hữu hạn (FSM Match Controller) điều phối ván đấu OTTV2.
Quản lý vòng lặp ván đấu, thu thập nước đi qua Blind-Commit Buffer,
và tạo bản ghi lịch sử trận đấu (MatchHistory) chi tiết.
"""

from typing import Dict, List, Optional, Callable, Any
from app.models.schemas import (
    GameRulesConfig, PlayerTurnState, RoundResult, MatchHistory, TournamentStage
)
from app.engine.rules import GameRulesEngine
import uuid
import time
import copy

class MatchFSM:
    def __init__(
        self,
        match_id: Optional[str] = None,
        match_type: str = "SOLO_1V1",
        stage: str = TournamentStage.STAGE_1_STANDARD,
        room_code: Optional[str] = None
    ):
        self.match_id = match_id or str(uuid.uuid4())
        self.match_type = match_type
        self.stage = stage
        self.room_code = room_code
        self.rules: GameRulesConfig = GameRulesEngine.get_stage_rules(stage)
        
        # Danh sách người chơi
        self.players: Dict[str, PlayerTurnState] = {}
        self.total_scores: Dict[str, int] = {}
        
        # Trạng thái vòng lặp
        self.current_turn = 1
        self.is_finished = False
        self.winner_id: Optional[str] = None
        self.winner_name: Optional[str] = None
        self.rounds_history: List[RoundResult] = []

    def add_player(self, bot_id: str, bot_name: str):
        """Thêm một bot vào phòng thi đấu"""
        self.players[bot_id] = PlayerTurnState(
            bot_id=bot_id,
            bot_name=bot_name,
            hp=self.rules.starting_hp,
            remaining_deck=copy.deepcopy(self.rules.starting_deck),
            chosen_move=None,
            damage_taken=0,
            attack_score_gained=0,
            is_knocked_out=False
        )
        self.total_scores[bot_id] = 0

    def get_public_state_for_player(self, target_bot_id: str) -> dict:
        """
        Tạo gói tin game_state gửi cho Bot trong lượt hiện tại.
        Hỗ trợ tính năng Fog of War (Sương mù thông tin ở Vòng 3 & 4):
        Nếu có fog_of_war, ẩn số bài còn lại của đối thủ, chỉ gửi HP.
        """
        target = self.players.get(target_bot_id)
        if not target:
            return {}
            
        opponents_info = []
        for pid, p in self.players.items():
            if pid != target_bot_id:
                info = {
                    "bot_name": p.bot_name,
                    "hp": p.hp,
                    "is_knocked_out": p.is_knocked_out
                }
                # Nếu không có sương mù thông tin -> gửi số bài còn lại
                if not self.rules.fog_of_war:
                    info["remaining_cards"] = p.remaining_deck
                opponents_info.append(info)

        # Lấy tóm tắt lịch sử hiệp trước
        history_summary = []
        for r in self.rounds_history:
            round_info = {}
            for pid, st in r.player_states.items():
                round_info[st.bot_name] = st.chosen_move
            history_summary.append(round_info)

        return {
            "match_id": self.match_id,
            "turn_number": self.current_turn,
            "max_turns": self.rules.max_turns,
            "stage": self.stage,
            "my_hp": target.hp,
            "remaining_cards": copy.deepcopy(target.remaining_deck),
            "opponents": opponents_info,
            "history": history_summary,
            "rules_config": {
                "even_turn_multiplier": self.rules.even_turn_multiplier,
                "reverse_odd_turns": self.rules.reverse_odd_turns,
                "fog_of_war": self.rules.fog_of_war
            }
        }

    def execute_turn(self, raw_moves: Dict[str, str]) -> RoundResult:
        """
        Thực hiện một lượt đấu:
        1. Phân giải va chạm ma trận
        2. Cập nhật điểm và lịch sử
        3. Kiểm tra điều kiện kết thúc
        """
        if self.is_finished:
            raise RuntimeError("Trận đấu đã kết thúc.")

        round_res = GameRulesEngine.resolve_round(
            turn_number=self.current_turn,
            player_states=self.players,
            raw_moves=raw_moves,
            rules=self.rules
        )
        self.rounds_history.append(round_res)
        
        # Cập nhật tổng điểm tấn công
        for pid, st in self.players.items():
            self.total_scores[pid] += st.attack_score_gained

        # Kiểm tra điều kiện dừng
        survivors = [pid for pid, p in self.players.items() if not p.is_knocked_out]
        
        # 1. Chỉ còn 1 người sống sót
        if len(survivors) <= 1:
            self.is_finished = True
            if len(survivors) == 1:
                self.winner_id = survivors[0]
                self.winner_name = self.players[self.winner_id].bot_name
            else:
                # Cả hai cùng bị knockout ở hiệp này -> so sánh điểm tấn công
                self._resolve_winner_by_score()
        # 2. Đã đánh hết số hiệp tối đa (ví dụ 15 hiệp)
        elif self.current_turn >= self.rules.max_turns:
            self.is_finished = True
            self._resolve_winner_by_hp_and_score(survivors)
        else:
            self.current_turn += 1

        return round_res

    def _resolve_winner_by_score(self):
        """Xác định người thắng theo điểm số tấn công cao nhất"""
        best_pid = max(self.total_scores, key=self.total_scores.get)
        self.winner_id = best_pid
        self.winner_name = self.players[best_pid].bot_name

    def _resolve_winner_by_hp_and_score(self, survivors: List[str]):
        """Xác định người thắng khi hết 15 hiệp: Ưu tiên HP cao nhất, sau đó đến Điểm tấn công"""
        best_pid = max(survivors, key=lambda pid: (self.players[pid].hp, self.total_scores[pid]))
        self.winner_id = best_pid
        self.winner_name = self.players[best_pid].bot_name

    def get_summary(self) -> MatchHistory:
        """Xuất toàn bộ lịch sử trận đấu hoàn chỉnh"""
        bot_names = {pid: p.bot_name for pid, p in self.players.items()}
        return MatchHistory(
            match_id=self.match_id,
            match_type=self.match_type,
            room_code=self.room_code,
            stage=self.stage,
            bot_ids=list(self.players.keys()),
            bot_names=bot_names,
            winner_id=self.winner_id,
            winner_name=self.winner_name,
            total_turns=len(self.rounds_history),
            rounds=self.rounds_history,
            final_scores=self.total_scores,
            elo_changes={}
        )

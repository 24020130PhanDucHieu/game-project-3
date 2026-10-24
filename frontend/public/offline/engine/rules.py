# -*- coding: utf-8 -*-
"""
Động cơ Luật chơi OTTV2 (Oẳn Tù Tì V2 Engine) và Cơ chế Đột biến Luật qua 4 Vòng Đấu.
Quy tắc chặt chẽ, tối ưu tính toán ma trận va chạm đa người chơi, hỗ trợ Rule Mutation động.
"""

from typing import Dict, List, Tuple
from app.models.schemas import GameRulesConfig, TournamentStage, MoveType, PlayerTurnState, RoundResult
import copy

class GameRulesEngine:
    @staticmethod
    def get_stage_rules(stage: str) -> GameRulesConfig:
        """Trả về cấu hình luật tương ứng với từng giai đoạn giải đấu"""
        if stage == TournamentStage.STAGE_2_MUTATED:
            return GameRulesConfig(
                stage_name=stage,
                display_title="Vòng 2: Kho Thẻ Lệch & Hiệp Chẵn Bùng Nổ",
                description="Kho bài lệch (7 Búa, 3 Bao, 5 Kéo). Các hiệp chẵn (2, 4, 6...) sát thương x2 (30 HP)!",
                starting_hp=100,
                starting_deck={"ROCK": 7, "PAPER": 3, "SCISSORS": 5},
                base_damage=15,
                even_turn_multiplier=2.0,
                reverse_odd_turns=False,
                fog_of_war=False,
                max_turns=15
            )
        elif stage == TournamentStage.STAGE_3_REVERSE_FOG:
            return GameRulesConfig(
                stage_name=stage,
                display_title="Vòng 3: Chiều Không Gian Đảo Ngược & Sương Mù",
                description="Hiệp lẻ đảo tương khắc (Kéo > Búa > Bao > Kéo). Ẩn số bài còn lại của đối phương!",
                starting_hp=100,
                starting_deck={"ROCK": 5, "PAPER": 5, "SCISSORS": 5},
                base_damage=15,
                even_turn_multiplier=1.0,
                reverse_odd_turns=True,
                fog_of_war=True,
                max_turns=15
            )
        elif stage == TournamentStage.STAGE_4_FINALS:
            return GameRulesConfig(
                stage_name=stage,
                display_title="Vòng 4: Chung Kết Đỉnh Cao - Luật Động Server",
                description="Cấu hình nạp động qua gói tin JSON. Bot phải thích nghi Zero-Shot thích ứng tức thì!",
                starting_hp=120,
                starting_deck={"ROCK": 6, "PAPER": 4, "SCISSORS": 5},
                base_damage=20,
                even_turn_multiplier=1.5,
                reverse_odd_turns=False,
                fog_of_war=True,
                max_turns=15
            )
        else: # STAGE_1_STANDARD
            return GameRulesConfig(
                stage_name=TournamentStage.STAGE_1_STANDARD,
                display_title="Vòng 1: Luật Chuẩn ICPC Cổ Điển",
                description="15 thẻ đều (5-5-5), 100 HP, Búa > Kéo > Bao > Búa, sát thương 15 HP/lượt.",
                starting_hp=100,
                starting_deck={"ROCK": 5, "PAPER": 5, "SCISSORS": 5},
                base_damage=15,
                even_turn_multiplier=1.0,
                reverse_odd_turns=False,
                fog_of_war=False,
                max_turns=15
            )

    @staticmethod
    def check_clash(move_a: str, move_b: str, is_reverse: bool = False) -> int:
        """
        Kiểm tra va chạm giữa 2 nước đi.
        Trả về:
         1 nếu move_a thắng move_b
        -1 nếu move_a thua move_b
         0 nếu hòa
        """
        if move_a == move_b:
            return 0

        # Quân Joker (Đa Năng): thắng bất kỳ quân nào, hòa khi đối đầu Joker
        if move_a == "JOKER":
            return 1
        if move_b == "JOKER":
            return -1

        # Ma trận thắng cổ điển: Búa thắng Kéo, Kéo thắng Bao, Bao thắng Búa
        normal_wins = {
            ("ROCK", "SCISSORS"): True,
            ("SCISSORS", "PAPER"): True,
            ("PAPER", "ROCK"): True
        }
        
        if not is_reverse:
            return 1 if (move_a, move_b) in normal_wins else -1
        else:
            # Luật nghịch đảo: Kéo thắng Búa, Búa thắng Bao, Bao thắng Kéo
            return -1 if (move_a, move_b) in normal_wins else 1

    @staticmethod
    def resolve_round(
        turn_number: int,
        player_states: Dict[str, PlayerTurnState],
        raw_moves: Dict[str, str],
        rules: GameRulesConfig
    ) -> RoundResult:
        """
        Phân giải một hiệp đấu giữa các người chơi còn sống.
        Trừ bài, kiểm tra tính hợp lệ, tính sát thương và cộng điểm.
        """
        active_pids = [pid for pid, p in player_states.items() if not p.is_knocked_out]
        combat_logs: List[str] = []
        
        is_even = (turn_number % 2 == 0)
        is_reverse = (rules.reverse_odd_turns and (turn_number % 2 != 0))
        
        # Hệ số sát thương
        damage_multiplier = rules.even_turn_multiplier if is_even else 1.0
        calculated_damage = int(rules.base_damage * damage_multiplier)
        
        # 1. Kiểm tra và trừ bài hợp lệ
        valid_moves: Dict[str, str] = {}
        for pid in active_pids:
            p = player_states[pid]
            p.damage_taken = 0
            p.attack_score_gained = 0
            p.warning = None
            
            requested_move = raw_moves.get(pid, "ROCK").upper()
            if requested_move not in MoveType.ALL:
                requested_move = "ROCK"
                
            # Kiểm tra xem trong kho thẻ còn bài này không
            deck = p.remaining_deck
            if deck.get(requested_move, 0) > 0:
                p.chosen_move = requested_move
                deck[requested_move] -= 1
            else:
                # Vi phạm kho bài: Bốc ngẫu nhiên lá bài còn lại
                available = [k for k, v in deck.items() if v > 0]
                if available:
                    p.chosen_move = available[0]
                    deck[p.chosen_move] -= 1
                    p.warning = f"Hết thẻ {requested_move}! Tự động đổi sang {p.chosen_move}."
                else:
                    p.chosen_move = "ROCK"
                    p.warning = "Hết toàn bộ bài! Nước đi không hợp lệ."
                    
            valid_moves[pid] = p.chosen_move

        # Thêm thông báo mở đầu hiệp
        rule_note = ""
        if is_reverse:
            rule_note = " [⚠️ HIỆP NGHỊCH ĐẢO: KÉO > BÚA > BAO > KÉO]"
        elif is_even and damage_multiplier > 1.0:
            rule_note = f" [💥 HIỆP CHẴN SÁT THƯƠNG X{damage_multiplier:.1f}: {calculated_damage} HP]"
            
        combat_logs.append(f"--- Hiệp {turn_number}/{rules.max_turns}{rule_note} ---")
        for pid in active_pids:
            p = player_states[pid]
            warn = f" ({p.warning})" if p.warning else ""
            combat_logs.append(f"• {p.bot_name} tung ra: [{p.chosen_move}]{warn}")

        # 2. Phân giải va chạm giữa tất cả các cặp (i, j)
        round_damage: Dict[str, int] = {pid: 0 for pid in active_pids}
        round_attack_score: Dict[str, int] = {pid: 0 for pid in active_pids}
        
        for i in range(len(active_pids)):
            for j in range(i + 1, len(active_pids)):
                p1_id = active_pids[i]
                p2_id = active_pids[j]
                m1 = valid_moves[p1_id]
                m2 = valid_moves[p2_id]
                
                clash = GameRulesEngine.check_clash(m1, m2, is_reverse=is_reverse)
                if clash == 1:
                    # P1 thắng P2
                    round_damage[p2_id] += calculated_damage
                    round_attack_score[p1_id] += rules.win_attack_bonus
                    combat_logs.append(
                        f"⚔️ {player_states[p1_id].bot_name} ({m1}) khắc chế {player_states[p2_id].bot_name} ({m2}): -{calculated_damage} HP!"
                    )
                elif clash == -1:
                    # P2 thắng P1
                    round_damage[p1_id] += calculated_damage
                    round_attack_score[p2_id] += rules.win_attack_bonus
                    combat_logs.append(
                        f"⚔️ {player_states[p2_id].bot_name} ({m2}) khắc chế {player_states[p1_id].bot_name} ({m1}): -{calculated_damage} HP!"
                    )
                else:
                    combat_logs.append(
                        f"🛡️ {player_states[p1_id].bot_name} và {player_states[p2_id].bot_name} cùng ra [{m1}]: Hòa!"
                    )

        # 3. Kiểm tra hiệu ứng thiểu số đột phá (Minority Breakthrough)
        # Nếu chỉ có duy nhất 1 bot ra nước đi thắng áp đảo tất cả các bot khác
        move_counts: Dict[str, int] = {}
        for m in valid_moves.values():
            move_counts[m] = move_counts.get(m, 0) + 1
            
        if len(active_pids) >= 3:
            for pid, m in valid_moves.items():
                if move_counts[m] == 1:
                    # Là bot duy nhất ra nước đi này
                    all_others_beaten = True
                    for other_id, other_m in valid_moves.items():
                        if other_id != pid and GameRulesEngine.check_clash(m, other_m, is_reverse) <= 0:
                            all_others_beaten = False
                            break
                    if all_others_beaten:
                        bonus = 15
                        round_attack_score[pid] += bonus
                        combat_logs.append(f"🌟 THIỂU SỐ ĐỘT PHÁ! {player_states[pid].bot_name} một mình khắc chế toàn sàn: Thưởng +{bonus} điểm công!")

        # 4. Trừ HP và cập nhật trạng thái
        for pid in active_pids:
            p = player_states[pid]
            dmg = round_damage[pid]
            p.damage_taken = dmg
            p.attack_score_gained = round_attack_score[pid]
            p.hp = max(0, p.hp - dmg)
            
            if p.hp <= 0 and not p.is_knocked_out:
                p.is_knocked_out = True
                combat_logs.append(f"💀 {p.bot_name} ĐÃ HẾT MÁU (KNOCKOUT) VÀ BỊ LOẠI KHỎI BÀN ĐẤU!")

        return RoundResult(
            turn_number=turn_number,
            player_states=copy.deepcopy(player_states),
            combat_logs=combat_logs,
            is_even_turn=is_even,
            is_reverse_turn=is_reverse
        )

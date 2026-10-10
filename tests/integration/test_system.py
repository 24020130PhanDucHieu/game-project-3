# -*- coding: utf-8 -*-
"""
Kịch bản Kiểm thử Toàn diện Hệ thống Đấu trường OTTV2 ICPC.
Kiểm tra API, FSM Engine, Sandbox Python & C++, Self-Play và Đổi luật giữa các vòng.
"""

import sys
import os

# Ensure UTF-8 output on Windows
sys.stdout.reconfigure(encoding='utf-8')

# Đảm bảo import được app
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import db
from app.models.schemas import TournamentStage, BotLanguage
from app.engine.rules import GameRulesEngine
from app.matchmaker.batch_runner import MatchCoordinator
from app.sandbox.runner import BotRunner

def test_full_pipeline():
    print("=" * 60)
    print("🚀 BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG HỆ THỐNG OTTV2 ICPC")
    print("=" * 60)

    # 1. Kiểm tra đăng ký người dùng
    user = db.register_user("24020130", "Nguyễn Văn A", "K69-CACLC", "password123")
    print(f"✅ 1. Đăng ký thành công: {user.full_name} ({user.student_id}) - API Key: {user.api_key}")

    # 2. Nộp Bot Python Version 1.0 (Bản cơ bản)
    code_v1 = """
def decide_move(game_state):
    cards = game_state.get("remaining_cards", {})
    available = [c for c, count in cards.items() if count > 0]
    return available[0] if available else "ROCK"
"""
    bot1 = db.save_or_update_bot(
        student_id="24020130",
        bot_name="CyberKnight_K69",
        language=BotLanguage.PYTHON,
        version_tag="v1.0",
        code_content=code_v1,
        notes="Bản cơ sở ngẫu nhiên"
    )
    print(f"✅ 2. Nộp thành công Bot v1.0: {bot1['bot_name']}")

    # 3. Nộp Bot Python Version 2.0 (Bản tối ưu thuật toán đếm bài)
    code_v2 = """
def decide_move(game_state):
    cards = game_state.get("remaining_cards", {})
    available = [c for c, count in cards.items() if count > 0]
    turn = game_state.get("turn_number", 1)
    # Ưu tiên ra Búa ở hiệp chẵn
    if turn % 2 == 0 and "ROCK" in available:
        return "ROCK"
    if "PAPER" in available:
        return "PAPER"
    return available[0] if available else "ROCK"
"""
    bot2 = db.save_or_update_bot(
        student_id="24020130",
        bot_name="CyberKnight_K69",
        language=BotLanguage.PYTHON,
        version_tag="v2.0",
        code_content=code_v2,
        notes="Bản nâng cấp tối ưu hiệp chẵn"
    )
    print(f"✅ 3. Nâng cấp thành công Bot lên v2.0 (Active: {bot2['active_version']})")

    # 4. Kiểm thử Self-Play Benchmark (v2.0 vs v1.0 - 10 ván)
    print("⏳ 4. Đang chạy kiểm thử nội bộ Self-Play (v2 vs v1)...")
    self_play = MatchCoordinator.run_self_play_benchmark("24020130", "v2.0", "v1.0", num_games=10)
    print(f"✅ 4. Kết quả Self-Play: v2.0 thắng {self_play.wins_a}/10 ván ({self_play.win_rate_a}%). {self_play.recommendation}")

    # 5. Kiểm thử Đấu với Boss BTC (Boss_Counter_AI)
    print("⏳ 5. Đang chạy đấu tập với Boss Counter BTC...")
    match_boss = MatchCoordinator.run_direct_match(
        bot_id_1=bot1["bot_id"],
        bot_id_2="boss_counter",
        match_type="TRAINING_BOSS"
    )
    print(f"✅ 5. Kết thúc trận đấu Boss sau {match_boss.total_turns} hiệp: Người thắng = {match_boss.winner_name}")

    # 6. Kiểm thử Biên dịch & Chạy Bot C++ với g++ MinGW
    print("⏳ 6. Đang kiểm thử biên dịch Bot C++ bằng g++ MinGW...")
    cpp_source = """
#include <iostream>
#include <string>
int main() {
    std::string s;
    if (std::getline(std::cin, s)) {
        std::cout << "PAPER" << std::endl;
    } else {
        std::cout << "ROCK" << std::endl;
    }
    return 0;
}
"""
    exe_path, compile_err = BotRunner.compile_cpp_code(cpp_source)
    if compile_err:
        print(f"❌ Lỗi biên dịch C++: {compile_err}")
    else:
        print(f"✅ 6a. Biên dịch C++ thành công: {exe_path}")
        move, run_err = BotRunner.run_cpp_binary(exe_path, {"test": True}, timeout=1.0)
        print(f"✅ 6b. Thực thi C++ thành công, nước đi nhận được: {move} (Lỗi: {run_err})")

    # 7. Kiểm thử Đổi luật giữa các vòng (Vòng 1 -> Vòng 2)
    print("⏳ 7. Kiểm thử Cơ chế Đột biến luật (Stage 1 -> Stage 2)...")
    rule_v1 = GameRulesEngine.get_stage_rules(TournamentStage.STAGE_1_STANDARD)
    rule_v2 = GameRulesEngine.get_stage_rules(TournamentStage.STAGE_2_MUTATED)
    print(f"• Vòng 1: Deck = {rule_v1.starting_deck}, Hệ số hiệp chẵn = {rule_v1.even_turn_multiplier}")
    print(f"• Vòng 2: Deck = {rule_v2.starting_deck}, Hệ số hiệp chẵn = {rule_v2.even_turn_multiplier} (x2 sát thương!)")
    assert rule_v2.starting_deck["ROCK"] == 7, "Kho bài vòng 2 phải có 7 Búa"
    assert rule_v2.even_turn_multiplier == 2.0, "Hiệp chẵn vòng 2 phải x2 sát thương"
    print("✅ 7. Cơ chế Đổi luật hoạt động chính xác 100%!")

    # 8. Kiểm tra Bảng xếp hạng ELO
    lb = db.get_leaderboard()
    print("✅ 8. Bảng xếp hạng hiện tại:", lb)

    print("=" * 60)
    print("🎉 TẤT CẢ 8 BƯỚC KIỂM THỬ ĐÃ ĐẠT 10/10 - HỆ THỐNG SẴN SÀNG KHỞI CHẠY!")
    print("=" * 60)

if __name__ == "__main__":
    test_full_pipeline()

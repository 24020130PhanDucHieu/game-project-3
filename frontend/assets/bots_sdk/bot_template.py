# -*- coding: utf-8 -*-
"""
Bot Mẫu Oẳn Tù Tì V2 (OTTV2) - Ngôn ngữ Python
Dành cho Tân sinh viên K69 tham gia Giải đấu Lập trình ICPC Bot

Luật cơ bản:
- Mỗi Bot có 100 HP.
- Mỗi ván có 15 thẻ bài: 5 Kéo (SCISSORS), 5 Búa (ROCK), 5 Bao (PAPER).
- Tương khắc: ROCK > SCISSORS, SCISSORS > PAPER, PAPER > ROCK.
- Thua tương khắc bị trừ 15 HP, thắng được cộng 10 điểm tấn công.
- Lưu ý: Giữa các vòng có thể đổi luật (kho bài lệch, hiệp chẵn x2 sát thương, v.v.).
"""

import random

def decide_move(game_state: dict) -> str:
    """
    Hàm ra quyết định nước đi cho Bot.
    
    Tham số game_state truyền từ Server gồm:
    - my_hp: Lượng máu hiện tại của Bot (int)
    - remaining_cards: Kho thẻ bài còn lại, ví dụ {"ROCK": 5, "PAPER": 5, "SCISSORS": 5}
    - turn_number: Lượt đấu hiện tại (1 -> 15)
    - history: Lịch sử các lượt trước
    - rules: Cấu hình luật (nếu có biến thể từ server)
    
    Giá trị trả về: Một trong 3 chuỗi "ROCK", "PAPER", "SCISSORS".
    """
    cards = game_state.get("remaining_cards", {})
    available = [card for card, count in cards.items() if count > 0]
    
    # Nếu không còn bài hợp lệ, mặc định ra ROCK
    if not available:
        return "ROCK"
        
    turn = game_state.get("turn_number", 1)
    
    # Chiến thuật ví dụ: Phân tích lịch sử hiệp trước
    history = game_state.get("history", [])
    if history:
        last_turn = history[-1]
        # Nếu hiệp trước đối thủ hay ra Búa và ta còn Bao -> ưu tiên ra Bao
        if "ROCK" in str(last_turn) and "PAPER" in available:
            return "PAPER"
            
    # Mặc định: Chọn ngẫu nhiên trong số các thẻ còn lại
    return random.choice(available)

if __name__ == "__main__":
    # Test thử cục bộ
    sample_state = {
        "my_hp": 100,
        "remaining_cards": {"ROCK": 5, "PAPER": 4, "SCISSORS": 5},
        "turn_number": 2,
        "history": []
    }
    move = decide_move(sample_state)
    print(f"[TEST] Nước đi được chọn: {move}")

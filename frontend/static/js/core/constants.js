// Các nhãn hiển thị quân bài chuẩn Oẳn tù tì (Không dùng emoji)
const PIECE_ICONS = {
  "ROCK": "BÚA",
  "PAPER": "BAO",
  "SCISSORS": "KÉO",
  "UNKNOWN": "Quân đối thủ chưa rõ loại",
  "PENDING": "Chờ xếp quân khi bắt đầu hiệp"
};

// Cập nhật nhãn nút nộp mã lệnh gọn gàng, không bị tràn
function updateStudioSubmitBtnText(roundNum = null) {
  const btn = document.getElementById("btn-studio-submit-bot");
  const span = document.getElementById("btn-submit-bot-text");
  const label = roundNum ? `Nộp mã lệnh R${roundNum}` : "Nộp mã lệnh";
  if (span) {
    span.textContent = label;
  } else if (btn) {
    btn.innerHTML = `

      <span id="btn-submit-bot-text">${escapeHtml(label)}</span>
    `;
  }
}

// Mẫu code mặc định chuẩn đấu trường
const DEFAULT_PYTHON_CODE = `# -*- coding: utf-8 -*-
import random

def decide_move(game_state):
    """
    Chiến thuật Tân sinh viên K69 qua từng Round:
    game_state cung cấp:
    - my_hp: Lượng máu hiện tại (int)
    - remaining_cards: Thẻ còn lại {"ROCK": 3, "PAPER": 3, "SCISSORS": 3}
    - turn_number: Số thứ tự round đang đấu (1 -> 5)
    - history: Danh sách nước đi các round trước
    """
    cards = game_state.get("remaining_cards", {})
    available = [c for c, count in cards.items() if count > 0]
    if not available:
        return "ROCK"

    turn = game_state.get("turn_number", 1)
    # Chiến thuật thích ứng: Ví dụ ở round lẻ ưu tiên Búa
    if turn % 2 == 1 and "ROCK" in available:
        return "ROCK"

    return random.choice(available)
`;

const DEFAULT_CPP_CODE = `/**
 * Bot Mẫu C++ 17 Standard I/O
 */
#include <iostream>
#include <string>

int main() {
    std::ios_base::sync_with_stdio(false);
    std::cin.tie(NULL);

    std::string state;
    if (std::getline(std::cin, state)) {
        // Thuật toán đối phó round 1..5
        std::cout << "ROCK" << std::endl;
    } else {
        std::cout << "ROCK" << std::endl;
    }
    return 0;
}
`;

// =============================================================================
// CORE CONSTANTS - OTTV2 FRESHMAN BOT ARENA
// =============================================================================

export const API_BASE = localStorage.getItem("ARENA_API_URL") || window.location.origin;

export const PIECE_ICONS = {
  "ROCK": "Búa",
  "PAPER": "Bao",
  "SCISSORS": "Kéo"
};

export const DEFAULT_PYTHON_CODE = `# -*- coding: utf-8 -*-
import random

def decide_move(game_state):
    cards = game_state.get("remaining_cards", {})
    available = [c for c, count in cards.items() if count > 0]
    if not available:
        return "ROCK"
    turn = game_state.get("turn_number", 1)
    if turn % 2 == 1 and "ROCK" in available:
        return "ROCK"
    return random.choice(available)
`;

export const DEFAULT_CPP_CODE = `/**
 * Bot Mẫu C++ 17 ICPC Standard I/O
 */
#include <iostream>
#include <string>

int main() {
    std::ios_base::sync_with_stdio(false);
    std::cin.tie(NULL);
    std::string state;
    if (std::getline(std::cin, state)) {
        std::cout << "ROCK" << std::endl;
    } else {
        std::cout << "ROCK" << std::endl;
    }
    return 0;
}
`;

"""Chính sách chơi mẫu để sinh dữ liệu thế cờ: hàm nhận `state` của engine, trả lá bài. Chạy ngay trong tiến trình."""
import random

CARDS = ("ROCK", "PAPER", "SCISSORS")
# Lá bài thắng lá được chỉ ra (luật thường); luật đảo khắc thì ngược lại.
BEATS = {"ROCK": "PAPER", "PAPER": "SCISSORS", "SCISSORS": "ROCK"}
LOSES = {v: k for k, v in BEATS.items()}
POLICIES = ("random", "aggressive", "counter", "majority", "hunter")


def _available(state):
    cards = state.get("remaining_cards", {})
    have = [c for c in CARDS if cards.get(c, 0) > 0]
    return have or list(CARDS)


def build(name, seed, noise=0.0):
    """Trả hàm chính sách. noise: xác suất ra ngẫu nhiên thay vì theo chiến thuật (làm đề khó và bớt tất định)."""
    rng = random.Random(seed)

    def rand(state):
        return rng.choice(_available(state))

    def aggressive(state):
        turn = state.get("turn_number", 1)
        pref = "ROCK" if turn <= 3 else ("SCISSORS" if turn <= 6 else "PAPER")
        have = _available(state)
        return pref if pref in have else rng.choice(have)

    def counter(state):
        history = state.get("history", [])
        if history:
            seen = history[-1].get("opponent_move")
            if seen in BEATS:
                card = (LOSES if state.get("reverse_rule") else BEATS)[seen]
                if card in _available(state):
                    return card
        return rng.choice(_available(state))

    def majority(state):
        cards = state.get("remaining_cards", {})
        return max(CARDS, key=lambda c: (cards.get(c, 0), -CARDS.index(c)))

    def hunter(state):
        counts = {}
        for piece in state.get("opponent_pieces", []):
            kind = piece.get("type")
            if kind in BEATS:
                counts[kind] = counts.get(kind, 0) + 1
        if not counts:
            return majority(state)
        target = max(CARDS, key=lambda c: (counts.get(c, 0), -CARDS.index(c)))
        card = (LOSES if state.get("reverse_rule") else BEATS)[target]
        return card if card in _available(state) else rng.choice(_available(state))

    base = {"random": rand, "aggressive": aggressive, "counter": counter, "majority": majority, "hunter": hunter}[name]
    if not noise:
        return base

    def noisy(state):
        return rand(state) if rng.random() < noise else base(state)
    return noisy

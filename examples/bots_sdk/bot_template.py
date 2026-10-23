"""Example Python bot for the Arena OTTV2 judge."""


def decide_move(game_state: dict) -> str:
    cards = game_state.get("remaining_cards", {})
    for card in ("ROCK", "PAPER", "SCISSORS"):
        if cards.get(card, 0) > 0:
            return card
    return "ROCK"

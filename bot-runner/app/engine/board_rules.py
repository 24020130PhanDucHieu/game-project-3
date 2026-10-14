"""Board presets shared by initial placement and the state supplied to bots."""

def board_rules(rule_id, cycle=1):
    counts = {"ROCK": 3, "PAPER": 3, "SCISSORS": 3}
    if rule_id in ("STAGE_2_MUTATED", "RULE_MUTATED_FOG"):
        counts = {"ROCK": 5, "PAPER": 2, "SCISSORS": 2}
    elif rule_id == "STAGE_4_FINALS":
        counts = {"ROCK": 2, "PAPER": 4, "SCISSORS": 3}
    reverse = (rule_id == "RULE_REVERSE" or
               rule_id == "STAGE_3_REVERSE_FOG" and cycle % 2 == 1 or
               rule_id == "STAGE_4_FINALS" and cycle % 3 == 0)
    fog = rule_id in ("RULE_FOG", "RULE_MUTATED_FOG", "STAGE_3_REVERSE_FOG", "STAGE_4_FINALS")
    return {"id": rule_id, "initial_pieces": counts, "fog": fog,
            "reverse": reverse, "board_size": 9, "max_moves": None,
            "win_conditions": ["capture_base", "eliminate_opponent"]}


def match_rule(tournament, match):
    configured = tournament.get("stage_rules", {}).get(str(match.get("round_level", 1)), {})
    return configured.get("rule_id", tournament.get("stage_rule", "STAGE_1_STANDARD"))

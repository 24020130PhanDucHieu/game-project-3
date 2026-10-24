"""Board presets shared by initial placement and the state supplied to bots."""
import random


def combination_bits(rule_id):
    if str(rule_id).startswith("COMBO_"):
        try:
            return int(str(rule_id).split("_")[1])
        except (IndexError, ValueError):
            return 0
    return 0


def shuffled_pattern(seed, has_joker=False):
    rng = random.Random(str(seed) + ':pieces')
    moves = ['ROCK', 'PAPER', 'SCISSORS']
    if has_joker:
        pattern = ['ROCK', 'PAPER', 'SCISSORS', 'ROCK', 'PAPER', 'SCISSORS', 'ROCK', 'PAPER', 'JOKER']
    else:
        pattern = moves + [rng.choice(moves) for _ in range(6)]
    rng.shuffle(pattern)
    return pattern

def generate_mystery_tiles(seed='validation'):
    """Sinh ngẫu nhiên các ô đặc biệt theo từng trận đấu (dựa trên seed), đối xứng công bằng cho cả 2 đội."""
    rng = random.Random(str(seed) + ':tiles')
    evolve = [(4, 4)]
    occupied = {(4, 4), (0, 8), (8, 0)}

    # Sinh 2 cặp Cổng dịch chuyển đối xứng: 1 cổng ở hàng 2..3, cổng đối ứng ở hàng 5..6
    portal_candidates = []
    for r in (2, 3):
        for c in range(1, 8):
            p1 = (c, r)
            p2 = (8 - c, 8 - r)
            if p1 != p2 and p1 not in occupied and p2 not in occupied:
                portal_candidates.append((p1, p2))
    rng.shuffle(portal_candidates)
    portal_pairs = portal_candidates[:2] if portal_candidates else [((2, 2), (6, 6)), ((2, 6), (6, 2))]
    for p1, p2 in portal_pairs:
        occupied.add(p1)
        occupied.add(p2)

    # Sinh 2 cặp Bẫy mìn đối xứng (4 bẫy mìn ngẫu nhiên tại các vị trí giao chiến)
    trap_candidates = []
    for r in (2, 3, 4):
        for c in range(0, 9):
            t1 = (c, r)
            t2 = (8 - c, 8 - r)
            if t1 != t2 and t1 not in occupied and t2 not in occupied:
                trap_candidates.append((t1, t2))
    rng.shuffle(trap_candidates)
    # A middle-row pair can occur in both orientations. Reserve cells while
    # selecting so two pairs never collapse into the same two traps.
    traps = []
    for t1, t2 in trap_candidates:
        if t1 in occupied or t2 in occupied:
            continue
        traps.extend([t1, t2])
        occupied.add(t1)
        occupied.add(t2)
        if len(traps) == 4:
            break

    return {
        "evolve": evolve,
        "portals": portal_pairs,
        "traps": traps
    }


def generate_obstacles(seed='validation'):
    """Sinh ngẫu nhiên các ô chướng ngại vật cố định, đối xứng công bằng qua tâm bàn cờ 9x9."""
    rng = random.Random(str(seed) + ':obstacles')
    occupied = {(4, 4), (0, 8), (8, 0)}  # Tâm và 2 căn cứ
    # Tránh hàng khởi đầu của hai đội (hàng 1 và hàng 7), tránh hàng 0 và hàng 8 (cửa căn cứ)
    candidates = []
    for r in (2, 3, 4):
        for c in range(1, 8):
            o1 = (c, r)
            o2 = (8 - c, 8 - r)
            if o1 != o2 and o1 not in occupied and o2 not in occupied:
                candidates.append((o1, o2))
    rng.shuffle(candidates)
    selected = candidates[:2] if candidates else [((3, 2), (5, 6)), ((2, 4), (6, 4))]
    obstacles = []
    for o1, o2 in selected:
        obstacles.extend([[o1[0], o1[1]], [o2[0], o2[1]]])
    return sorted(obstacles)


def board_rules(rule_id, cycle=1, seed='validation'):
    bits = combination_bits(rule_id)
    special_tiles = (rule_id in ("RULE_SPECIAL_TILES", "STAGE_SPECIAL_TILES", "STAGE_MYSTERY_TILES") or bool(bits & 8))
    obstacles_enabled = (rule_id in ("RULE_OBSTACLES", "STAGE_OBSTACLES") or bool(bits & 16))
    counts = {"ROCK": 3, "PAPER": 3, "SCISSORS": 3}
    if special_tiles:
        counts = {"ROCK": 3, "PAPER": 3, "SCISSORS": 2, "JOKER": 1}
    elif rule_id in ("STAGE_2_MUTATED", "RULE_MUTATED_FOG"):
        counts = {"ROCK": 5, "PAPER": 2, "SCISSORS": 2}
    elif rule_id == "STAGE_4_FINALS":
        counts = {"ROCK": 2, "PAPER": 4, "SCISSORS": 3}
    reverse = (rule_id == "RULE_REVERSE" or
               rule_id == "STAGE_3_REVERSE_FOG" and cycle % 2 == 1 or
               rule_id == "STAGE_4_FINALS" and cycle % 3 == 0)
    fog = rule_id in ("RULE_FOG", "RULE_MUTATED_FOG", "STAGE_3_REVERSE_FOG", "STAGE_4_FINALS")
    if bits & 1:
        pattern = shuffled_pattern(seed, has_joker=special_tiles)
        counts = {move: pattern.count(move) for move in counts}
    reverse = reverse or bool(bits & 2)
    fog = fog or bool(bits & 4)
    mystery_tiles = generate_mystery_tiles(seed) if special_tiles else {}
    obstacles = generate_obstacles(seed) if obstacles_enabled else []
    return {"id": rule_id, "initial_pieces": counts, "fog": fog,
            "shuffle": bool(bits & 1),
            "reverse": reverse, "special_tiles": special_tiles,
            "has_joker": special_tiles,
            "mystery_tiles": mystery_tiles,
            "obstacles": obstacles,
            "has_obstacles": bool(obstacles),
            "board_size": 9, "max_moves": None,
            "win_conditions": ["capture_base", "eliminate_opponent"]}


def match_rule(tournament, match):
    configured = tournament.get("stage_rules", {}).get(str(match.get("round_level", 1)), {})
    return configured.get("rule_id", tournament.get("stage_rule", "STAGE_1_STANDARD"))


def initial_board(rule_id, seed='validation'):
    rules = board_rules(rule_id, seed=seed)
    counts = rules["initial_pieces"]
    has_joker = rules.get("has_joker", False) or "JOKER" in counts
    if has_joker:
        pattern = ["ROCK", "PAPER", "SCISSORS", "ROCK", "JOKER", "PAPER", "SCISSORS", "ROCK", "PAPER"]
    elif all(counts.get(m, 0) == 3 for m in ("ROCK", "PAPER", "SCISSORS")):
        pattern = list(("ROCK", "PAPER", "SCISSORS")) * 3
    else:
        pattern = [move for move in ("ROCK", "PAPER", "SCISSORS") for _ in range(counts.get(move, 0))]
    if combination_bits(rule_id) & 1:
        pattern = shuffled_pattern(seed, has_joker=has_joker)
    return {side: [{"id": f"{prefix}_{i}", "col": i, "row": row,
                    "type": kind, "alive": True,
                    **({"steps_left": 5} if kind == "JOKER" else {})} for i, kind in enumerate(
                        list(reversed(pattern)) if side == 'team_b' and combination_bits(rule_id) & 1 else pattern)]
            for side, prefix, row in (("team_a", "r", 7), ("team_b", "b", 1))}

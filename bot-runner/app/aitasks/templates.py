"""Các mẫu đề của Giải AI: dữ liệu là thế cờ lấy từ chính engine bàn cờ 9x9, nhãn là kết quả ván thật.

Mỗi ván được chạy trong tiến trình (không sandbox) bằng `simulate_board(..., policies=..., trace=...)`; engine giữ nguyên mọi luật.
Mọi thứ tất định theo `seed`: cùng hạt giống ra cùng dữ liệu, nên kho đề chỉ cần lưu thông số.
"""
import random
import re

from app.aitasks import policies as pol
from app.aitasks.encode import CARD_INDEX, LETTER, encode
from app.engine.board import simulate_board

RULE_RE = re.compile(r"^(STAGE_[1-4]_[A-Z_]+|RULE_[A-Z_]+|COMBO_\d{1,2})$")

TEMPLATES = {
    "winner": {"kind": "class", "classes": ["Bên đi thua", "Bên đi thắng"], "metric": "accuracy", "title": "Đoán bên thắng"},
    "nextcard": {"kind": "class", "classes": ["Búa", "Giấy", "Kéo"], "metric": "accuracy", "title": "Đoán lá bài bên đi sẽ ra"},
    "plies_left": {"kind": "reg", "classes": None, "metric": "r2", "title": "Đoán số nước còn lại"},
    "material": {"kind": "reg", "classes": None, "metric": "r2", "title": "Đoán chênh lệch số quân"},
    "capture_next": {"kind": "class", "classes": ["Không ăn quân", "Có ăn quân"], "metric": "balanced_accuracy", "title": "Đoán lượt này có ăn quân không"},
}

DEFAULTS = {
    "rule_id": "STAGE_1_STANDARD", "mix": ["random", "counter", "majority", "hunter", "aggressive"], "target": "counter",
    "noise": 0.1, "per_game": 2, "horizon": 6, "cap": 60, "balance": 0.5,
    "n_train": 400, "n_public": 200, "n_private": 600, "time_s": 8,
}

LIMITS = {"n_train": (50, 800), "n_public": (50, 400), "n_private": (100, 1100), "time_s": (2, 10), "per_game": (1, 4), "horizon": (1, 20), "cap": (10, 120)}


def _pick(rng, names):
    return rng.choice(names)


def _play(params, seed, rng, target_seat=None):
    events = []

    def trace(e):
        events.append({"ply": e["ply"], "side": e["side"], "state": e["state"], "move": e["move"], "alive": e["alive"]})

    mix = params["mix"]
    noise = params["noise"]
    if target_seat:
        other = "team_b" if target_seat == "team_a" else "team_a"
        chosen = {target_seat: pol.build(params["target"], f"{seed}:t", noise), other: pol.build("random", f"{seed}:o")}
    else:
        chosen = {"team_a": pol.build(_pick(rng, mix), f"{seed}:a", noise), "team_b": pol.build(_pick(rng, mix), f"{seed}:b", noise)}
    result = simulate_board("", "", "PYTHON", "PYTHON", 1 + rng.randrange(2), params["rule_id"], seed, policies=chosen, trace=trace, record_replay=False)
    return events, result


def _choose(rng, candidates, k):
    if len(candidates) <= k:
        return list(candidates)
    return rng.sample(candidates, k)


def _side_index(side):
    return 0 if side == "team_a" else 1


def _extract(template, events, result, params, rng, target_seat):
    k = params["per_game"]
    out = []
    n = len(events)
    if n < 3:
        return out
    if template == "winner":
        for i in _choose(rng, list(range(1, n - 1)), k):
            out.append((encode(events[i]["state"]), 1 if events[i]["side"] == result["winner_side"] else 0))
    elif template == "nextcard":
        cands = [i for i in range(n) if events[i]["side"] == target_seat]
        for i in _choose(rng, cands, k):
            out.append((encode(events[i]["state"]), CARD_INDEX[LETTER[events[i]["move"]]]))
    elif template == "plies_left":
        for i in _choose(rng, list(range(0, n - 1)), k):
            out.append((encode(events[i]["state"]), float(min(params["cap"], n - 1 - i))))
    elif template == "material":
        for i in _choose(rng, list(range(0, n - 1)), k):
            j = min(i + params["horizon"], n - 1)
            me = _side_index(events[i]["side"])
            alive = events[j]["alive"]
            out.append((encode(events[i]["state"]), float(alive[me] - alive[1 - me])))
    elif template == "capture_next":
        pos, neg = [], []
        for i in range(n):
            me = _side_index(events[i]["side"])
            before = len(events[i]["state"]["opponent_pieces"])
            (pos if events[i]["alive"][1 - me] < before else neg).append(i)
        want_pos = min(len(pos), round(k * params["balance"]))
        picks = _choose(rng, pos, want_pos) + _choose(rng, neg, k - want_pos)
        for i in picks:
            label = 1 if i in pos else 0
            out.append((encode(events[i]["state"]), label))
    return out


def build_dataset(template, params, seed, n):
    """Sinh n mẫu: trả {"X": [dict gọn], "y": [nhãn]}. Tất định theo seed."""
    rng = random.Random(f"{seed}:{template}")
    X, y, games = [], [], 0
    while len(X) < n and games < n * 6 + 20:
        games += 1
        target_seat = rng.choice(("team_a", "team_b")) if template == "nextcard" else None
        events, result = _play(params, f"{seed}:g{games}", rng, target_seat)
        for sample, label in _extract(template, events, result, params, rng, target_seat):
            X.append(sample)
            y.append(label)
    return {"X": X[:n], "y": y[:n]}

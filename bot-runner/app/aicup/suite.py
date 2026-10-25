"""Chấm một mô hình (bot Python) trên bộ đề của Giải AI.

Đề A, đọc đối thủ: bot đấu nhiều ván oẳn tù tì liên tiếp với các đối thủ sinh theo hạt giống và nhìn thấy `history`
y hệt trong trận bàn cờ thật (my_move, opponent_move, their_move). Một tiến trình sandbox được dùng lại cho cả bộ đề.
Đề B, bàn cờ: bot đấu bàn 9x9 với các boss có hạt giống cố định theo lượt.
"""
import time

from app.aicup import opponents as ops

NAMES = ops.MOVES
LABEL = {"ROCK": 0, "PAPER": 1, "SCISSORS": 2}

BOSSES = {
    "RANDOM": """import random
def decide_move(game_state):
    cards = game_state.get("remaining_cards", {})
    available = [c for c, count in cards.items() if count > 0]
    return random.choice(available) if available else "ROCK"
""",
    "AGGRESSIVE": """import random
def decide_move(game_state):
    turn = game_state.get("turn_number", 1)
    cards = game_state.get("remaining_cards", {})
    available = [c for c, count in cards.items() if count > 0]
    if not available:
        return "ROCK"
    pref = "ROCK" if turn <= 3 else ("SCISSORS" if turn <= 6 else "PAPER")
    return pref if pref in available else random.choice(available)
""",
    "ADAPTIVE": """import random
def decide_move(game_state):
    cards = game_state.get("remaining_cards", {})
    available = [c for c, count in cards.items() if count > 0]
    if not available:
        return "ROCK"
    counter = {"ROCK": "PAPER", "PAPER": "SCISSORS", "SCISSORS": "ROCK"}
    history = game_state.get("history", [])
    if history:
        opp = history[-1].get("opponent_move") or history[-1].get("their_move")
        if opp in counter and counter[opp] in available:
            return counter[opp]
    return random.choice(available)
""",
}


def duel_state(round_no, total, history):
    """Cùng khóa với state của trận bàn cờ; các trường về quân/ô để rỗng để bot chỉ cần đọc `history`."""
    return {"my_hp": 100, "remaining_cards": {"ROCK": 99, "PAPER": 99, "SCISSORS": 99},
            "turn_number": round_no, "ply_number": round_no, "active_side": "team_a", "history": history,
            "my_pieces": [], "opponent_pieces": [], "target": [8, 0], "reverse_rule": False, "obstacles": [],
            "rules": {"mode": "ai_duel", "total_rounds": total}, "ai_duel": True, "total_rounds": total}


class Session:
    """Giữ một tiến trình bot; nếu bot quá giờ thì tiến trình bị giết và được dựng lại cho ván sau."""

    def __init__(self, code):
        self.code = code
        self.process = None
        self.init_error = None
        self.open()

    def open(self):
        self.close()
        from app.sandbox.game_process import GameProcess  # nhập muộn: trong trình duyệt (Pyodide) không có tiến trình con
        self.process = GameProcess(self.code)
        self.init_error = self.process.error

    def decide(self, state, timeout):
        if self.init_error:
            return None, self.init_error
        move, error = self.process.decide(state, timeout=timeout)
        if error:
            self.open()
        return move, error

    def close(self):
        if self.process:
            self.process.close()
            self.process = None


class LocalSession:
    """Chạy bot ngay trong tiến trình hiện tại (dùng cho "Kiểm tra trên máy" trong trình duyệt)."""

    def __init__(self, code, run):
        self.code, self.run, self.init_error = code, run, None

    def decide(self, state, timeout):
        started = time.monotonic()
        move, error = self.run(self.code, state)
        if not error and time.monotonic() - started > timeout:
            error = f"Time Limit Exceeded ({timeout:.2f}s)."
        return move, error

    def close(self):
        pass


def play_duel(session, opponent, total, move_timeout, deadline):
    """Trả (điểm 0..1, lỗi). Bot lỗi hoặc ra nước không hợp lệ thì thua cả ván đấu."""
    own, bot, history = [], [], []
    points = 0.0
    for t in range(1, total + 1):
        if time.monotonic() > deadline:
            return 0.0, "Hết thời gian chấm của bộ đề."
        move_name, error = session.decide(duel_state(t, total, [dict(h) for h in history]), move_timeout)
        if error or move_name not in LABEL:
            return 0.0, str(error or "Nước đi không hợp lệ.")[:200]
        mine = LABEL[move_name]
        theirs = opponent.play(own, bot)
        if mine == theirs:
            points += 0.5
        elif ops.beats(mine) == theirs:
            pass
        else:
            points += 1.0
        # `own` là nước của đối thủ mẫu, `bot` là nước của mô hình; đối thủ mẫu nhìn góc của nó.
        own.append(theirs)
        bot.append(mine)
        history.append({"turn": t, "ply": t, "my_move": move_name, "opponent_move": NAMES[theirs], "their_move": NAMES[theirs]})
    return points / total, None


def run_set(session, kinds, seed, instances, total, move_timeout, deadline, errors, label):
    families = {}
    for kind in kinds:
        scores = []
        for i in range(instances):
            opponent = ops.make(kind, ops.derive(seed, kind, i), total)
            score, error = play_duel(session, opponent, total, move_timeout, deadline)
            if error and len(errors) < 5:
                errors.append(f"{label}: {error}")
            scores.append(score)
        families[kind] = sum(scores) / len(scores)
    return families


def run_board(code, seed, games, deadline, errors):
    from app.engine.board import simulate_board
    bosses = list(BOSSES)
    wins, played, per_boss = 0, 0, {}
    for index in range(games):
        if time.monotonic() > deadline:
            break
        boss = bosses[index % len(bosses)]
        side = "team_a" if (index // len(bosses)) % 2 == 0 else "team_b"
        code_a, code_b = (code, BOSSES[boss]) if side == "team_a" else (BOSSES[boss], code)
        result = simulate_board(code_a, code_b, "PYTHON", "PYTHON", 1, "STAGE_1_STANDARD", f"{seed}:board:{index}", reuse_sandbox=True, record_replay=False)
        won = result["winner_side"] == side
        error = result["bot_errors"].get(side)
        if error and len(errors) < 5:
            errors.append(f"Bàn cờ: {str(error)[:120]}")
        wins += 1 if won else 0
        played += 1
        entry = per_boss.setdefault(boss, [0, 0])
        entry[0] += 1 if won else 0
        entry[1] += 1
    return wins, played, {boss: w / n for boss, (w, n) in per_boss.items()}


def mean(values):
    values = list(values)
    return sum(values) / len(values) if values else 0.0


def run_public_check(code, public_seed, run, *, total=150, instances=2, move_timeout=1.0, budget=120.0):
    """Chấm thử bộ công khai ngay trên máy người dùng: cùng đối thủ, cùng hạt giống nên kết quả sát điểm công khai thật."""
    started = time.monotonic()
    errors = []
    session = LocalSession(code, run)
    families = run_set(session, ops.PUBLIC_KINDS, public_seed, instances, total, move_timeout, started + budget, errors, "Bộ công khai")
    return {"public_score": round(mean(families.values()) * 100, 3), "families_public": {k: round(v * 100, 2) for k, v in families.items()},
            "errors": errors, "elapsed_ms": int((time.monotonic() - started) * 1000)}


def run_suite(code, secret_seed, public_seed, round_no, *, total=150, instances=2, board_games=9, move_timeout=1.0, budget=75.0):
    """Chấm một bot cho một lượt. Điểm công khai và riêng tư đều trên thang 0..100 (ngẫu nhiên ≈ 50)."""
    from app.aicup import hidden  # đăng ký các nhóm đối thủ ẩn; chỉ nhập trên máy chấm
    started = time.monotonic()
    deadline = started + budget
    errors = []
    session = Session(code)
    if session.init_error:
        session.close()
        return {"error": str(session.init_error)[:300], "public_score": 0.0, "private_score": 0.0, "families_public": {},
                "families_private": {}, "board": {"score": 0.0, "games": 0, "bosses": {}}, "errors": [], "elapsed_ms": 0}
    try:
        public = run_set(session, ops.PUBLIC_KINDS, public_seed, instances, total, move_timeout, deadline, errors, "Bộ công khai")
        private = run_set(session, hidden.PRIVATE_KINDS, f"{secret_seed}:{round_no}", instances, total, move_timeout, deadline, errors, "Bộ ẩn")
    finally:
        session.close()
    wins, played, per_boss = run_board(code, f"{secret_seed}:{round_no}", board_games, deadline, errors)
    board = wins / board_games * 100 if board_games else 0.0
    a_private = mean(private.values()) * 100
    return {
        "public_score": round(mean(public.values()) * 100, 3),
        "private_score": round(0.6 * a_private + 0.4 * board, 3),
        "reading_score": round(a_private, 3),
        "families_public": {k: round(v * 100, 2) for k, v in public.items()},
        "families_private": {k: round(v * 100, 2) for k, v in private.items()},
        "board": {"score": round(board, 2), "games": played, "bosses": {k: round(v * 100, 1) for k, v in per_boss.items()}},
        "errors": errors, "budget_exceeded": time.monotonic() > deadline,
        "elapsed_ms": int((time.monotonic() - started) * 1000),
    }


def build_dataset(public_seed, matches_per_family=6, total=150):
    """Dữ liệu huấn luyện công khai: bot tham chiếu ra nước ngẫu nhiên đấu các đối thủ công khai (khác hạt giống chấm điểm)."""
    families = []
    for kind in ops.PUBLIC_KINDS:
        matches = []
        for i in range(matches_per_family):
            opponent = ops.make(kind, ops.derive(public_seed, "dataset", kind, i), total)
            rng = ops.random.Random(ops.derive(public_seed, "dataset-bot", kind, i))
            own, bot = [], []
            for _ in range(total):
                mine = rng.randrange(3)
                theirs = opponent.play(own, bot)
                own.append(theirs)
                bot.append(mine)
            matches.append({"bot": "".join("RPS"[m] for m in bot), "opponent": "".join("RPS"[m] for m in own)})
        families.append({"kind": kind, "matches": matches})
    return {"format": "R=ROCK, P=PAPER, S=SCISSORS; bot[t] là nước của bot tham chiếu (ngẫu nhiên), opponent[t] là nước của đối thủ ở vòng t.", "rounds_per_match": total, "families": families}

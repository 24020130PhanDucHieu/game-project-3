"""Đối thủ mẫu của Giải AI: mỗi đối thủ được sinh hoàn toàn từ hạt giống nên chấm lại luôn ra cùng kết quả.

Nước đi là số 0=ROCK, 1=PAPER, 2=SCISSORS; beats(x) là nước thắng x.
"""
import hashlib
import random

MOVES = ("ROCK", "PAPER", "SCISSORS")


def beats(move):
    return (move + 1) % 3


def derive(*parts):
    """Hạt giống con ổn định từ chuỗi các thành phần (không phụ thuộc PYTHONHASHSEED)."""
    return int(hashlib.sha256(":".join(str(p) for p in parts).encode()).hexdigest()[:16], 16)


def _skewed(rng, dominant=0.65):
    """Một phân phối lệch: một nước chiếm ưu thế, hai nước còn lại chia phần dư."""
    favourite = rng.randrange(3)
    rest = rng.uniform(0.25, 0.75)
    probs = [0.0, 0.0, 0.0]
    probs[favourite] = dominant
    others = [i for i in range(3) if i != favourite]
    probs[others[0]] = (1 - dominant) * rest
    probs[others[1]] = (1 - dominant) * (1 - rest)
    return probs


def _draw(rng, probs):
    x = rng.random()
    acc = 0.0
    for move, p in enumerate(probs):
        acc += p
        if x < acc:
            return move
    return 2


class Opponent:
    """Mọi đối thủ nhìn thấy: nước đi của bot (bot) và nước đi của chính nó (own), cùng số vòng đã chơi."""
    kind = ""

    def __init__(self, rng, total):
        self.rng = rng
        self.total = total

    def play(self, own, bot):
        raise NotImplementedError

    def describe(self):
        return {}


class Bias(Opponent):
    kind = "bias"

    def __init__(self, rng, total):
        super().__init__(rng, total)
        self.probs = _skewed(rng, rng.uniform(0.45, 0.6))

    def play(self, own, bot):
        return _draw(self.rng, self.probs)

    def describe(self):
        return {"probs": [round(p, 3) for p in self.probs]}


class Cycle(Opponent):
    kind = "cycle"

    def __init__(self, rng, total):
        super().__init__(rng, total)
        length = rng.randint(3, 6)
        while True:
            self.pattern = [rng.randrange(3) for _ in range(length)]
            if len(set(self.pattern)) > 1:
                break

    def play(self, own, bot):
        return self.pattern[len(own) % len(self.pattern)]

    def describe(self):
        return {"pattern": "".join("RPS"[m] for m in self.pattern)}


class Markov1(Opponent):
    """Nước kế tiếp phụ thuộc nước vừa rồi của chính nó."""
    kind = "markov1"

    def __init__(self, rng, total):
        super().__init__(rng, total)
        self.rows = [_skewed(rng, 0.7) for _ in range(3)]

    def play(self, own, bot):
        if not own:
            return self.rng.randrange(3)
        return _draw(self.rng, self.rows[own[-1]])


class BeatLast(Opponent):
    """Phản đòn: ra nước thắng nước vừa rồi của bot."""
    kind = "beat_last"

    def play(self, own, bot):
        return beats(bot[-1]) if bot else self.rng.randrange(3)


FAMILIES = {cls.kind: cls for cls in (Bias, Cycle, Markov1, BeatLast)}

# Bộ công khai: đề bài nêu rõ các nhóm này và hạt giống công khai, ai cũng tự dựng lại được để huấn luyện.
PUBLIC_KINDS = ("bias", "cycle", "markov1", "beat_last")


def make(kind, seed, total):
    return FAMILIES[kind](random.Random(seed), total)

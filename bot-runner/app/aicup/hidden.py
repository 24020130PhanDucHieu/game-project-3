"""Các nhóm đối thủ của bộ ẩn. Tệp này chỉ có trên máy chấm, không được gửi xuống trình duyệt.

Bộ ẩn gồm cả bốn nhóm công khai (tham số mới mỗi lượt) lẫn các nhóm chưa từng công bố dưới đây,
để đo khả năng tổng quát hóa của mô hình.
"""
from app.aicup.opponents import Bias, Cycle, Markov1, Opponent, FAMILIES, _draw, _skewed, beats

class NoisyCycle(Cycle):
    kind = "noisy_cycle"

    def __init__(self, rng, total):
        super().__init__(rng, total)
        self.noise = rng.uniform(0.12, 0.22)

    def play(self, own, bot):
        if self.rng.random() < self.noise:
            return self.rng.randrange(3)
        return super().play(own, bot)

    def describe(self):
        return {**super().describe(), "noise": round(self.noise, 2)}


class Markov2(Opponent):
    """Nước kế tiếp phụ thuộc cặp (nước vừa rồi của nó, nước vừa rồi của bot)."""
    kind = "markov2"

    def __init__(self, rng, total):
        super().__init__(rng, total)
        self.rows = [_skewed(rng, 0.75) for _ in range(9)]

    def play(self, own, bot):
        if not own:
            return self.rng.randrange(3)
        return _draw(self.rng, self.rows[own[-1] * 3 + bot[-1]])


class Switcher(Opponent):
    """Đổi sở thích giữa chừng: kiểm tra mô hình có biết quên dữ liệu cũ không."""
    kind = "switcher"

    def __init__(self, rng, total):
        super().__init__(rng, total)
        self.first = _skewed(rng, 0.6)
        self.second = _skewed(rng, 0.6)
        while max(range(3), key=lambda i: self.second[i]) == max(range(3), key=lambda i: self.first[i]):
            self.second = _skewed(rng, 0.6)
        self.switch_at = total // 2

    def play(self, own, bot):
        return _draw(self.rng, self.first if len(own) < self.switch_at else self.second)


class AdaptiveFreq(Opponent):
    """Đối thủ thích ứng: ra nước thắng nước bot dùng nhiều nhất cho tới giờ."""
    kind = "adaptive_freq"

    def play(self, own, bot):
        if len(bot) < 3:
            return self.rng.randrange(3)
        counts = [bot.count(i) for i in range(3)]
        return beats(max(range(3), key=lambda i: (counts[i], -i)))


class Wsls(Opponent):
    """Thắng thì giữ, thua thì đổi sang nước thắng nước vừa rồi của bot, hòa thì ngẫu nhiên."""
    kind = "wsls"

    def play(self, own, bot):
        if not own:
            return self.rng.randrange(3)
        mine, theirs = own[-1], bot[-1]
        if mine == theirs:
            return self.rng.randrange(3)
        if beats(theirs) == mine:
            return mine
        return beats(theirs)



FAMILIES.update({cls.kind: cls for cls in (NoisyCycle, Markov2, Switcher, AdaptiveFreq, Wsls)})

PRIVATE_KINDS = ("bias", "cycle", "markov1", "markov2", "noisy_cycle", "switcher", "adaptive_freq", "wsls")

/** Mã mẫu cho đề học từ thế cờ. Sinh từ bot-runner/app/aitasks/reference.py bằng scripts/gen_task_templates.py; đừng sửa tay. */

export const MLP_TEMPLATE = `# Mô hình mẫu: đặc trưng thế cờ + mạng nơ-ron nhỏ huấn luyện bằng nnlite (xuôi -> mất mát -> ngược -> cập nhật trọng số).
import nnlite

BEATS = {"R": "s", "S": "p", "P": "r"}          # luật thường: Búa thắng Kéo, Kéo thắng Giấy, Giấy thắng Búa
BEATS_REVERSE = {"R": "p", "S": "r", "P": "s"}  # luật đảo tương khắc


def features(s):
    board = s["b"]
    me = s["s"]
    goal_col, goal_row = (8, 0) if me == 0 else (0, 8)       # căn cứ bên đi cần chiếm
    home_col, home_row = (0, 8) if me == 0 else (8, 0)       # căn cứ của bên đi
    own = []
    opp = []
    for i in range(81):
        ch = board[i]
        if ch in "RPSJ":
            own.append((i % 9, i // 9, ch))
        elif ch in "rpsj?":
            opp.append((i % 9, i // 9, ch))

    def far(pieces, col, row):
        return min([abs(c - col) + abs(r - row) for c, r, k in pieces] or [16])

    adv_own = [(8 - r) if me == 0 else r for c, r, k in own] or [0]
    adv_opp = [r if me == 0 else (8 - r) for c, r, k in opp] or [0]
    hit = 0
    hit_rev = 0
    near = 0
    for c, r, k in own:
        for c2, r2, k2 in opp:
            if abs(c - c2) <= 1 and abs(r - r2) <= 1:
                near += 1
                if BEATS.get(k) == k2:
                    hit = 1
                if BEATS_REVERSE.get(k) == k2:
                    hit_rev = 1
    fog = 1 if s["e"] is None else 0
    f = [len(own) / 9, len(opp) / 9, (len(own) - len(opp)) / 9, s["t"] / 30, me, fog,
         sum(adv_own) / len(adv_own) / 8, max(adv_own) / 8, sum(adv_opp) / len(adv_opp) / 8, max(adv_opp) / 8,
         far(own, goal_col, goal_row) / 16, far(opp, home_col, home_row) / 16, hit, hit_rev, min(near, 6) / 6]
    f += [v / 3 for v in s["c"]]
    f += [v / 3 for v in (s["e"] or [0, 0, 0])]
    for text in (s["h"], s["g"]):
        last = text[-3:].rjust(3, "-")
        for ch in last:
            f += [1.0 if ch == "R" else 0.0, 1.0 if ch == "P" else 0.0, 1.0 if ch == "S" else 0.0]
    return f


def solve(task):
    meta = task["meta"]
    X = [features(s) for s in task["train"]["X"]]
    T = [features(s) for s in task["test"]["X"]]
    X, mean, std = nnlite.standardize(X)
    T, mean, std = nnlite.standardize(T, mean, std)
    budget = meta["time_s"] * 0.45
    if meta["regression"]:
        y = task["train"]["y"]
        mu = sum(y) / len(y)
        sd = (sum((v - mu) ** 2 for v in y) / len(y)) ** 0.5 or 1.0
        net = nnlite.MLP([len(X[0]), 16, 1], task="reg", seed=1)
        net.fit(X, [(v - mu) / sd for v in y], epochs=60, lr=0.01, batch=16, time_limit=budget)
        return [p * sd + mu for p in net.predict(T)]
    net = nnlite.MLP([len(X[0]), 16, meta["n_classes"]], task="class", seed=1)
    net.fit(X, task["train"]["y"], epochs=60, lr=0.01, batch=16, time_limit=budget)
    return net.predict(T)
`

export const SCRATCH_TEMPLATE = `# Mẫu: hồi quy softmax (phân loại) hoặc tuyến tính (hồi quy) tự viết.
# Mỗi bước: lan truyền XUÔI (tính điểm z) -> MẤT MÁT -> lan truyền NGƯỢC (đạo hàm g) -> CẬP NHẬT trọng số W.


def features(s):
    board = s["b"]
    me = s["s"]
    own = [(i % 9, i // 9) for i in range(81) if board[i] in "RPSJ"]
    opp = [(i % 9, i // 9) for i in range(81) if board[i] in "rpsj?"]
    adv_own = [(8 - r) if me == 0 else r for c, r in own] or [0]
    adv_opp = [r if me == 0 else (8 - r) for c, r in opp] or [0]
    f = [len(own) / 9, len(opp) / 9, s["t"] / 30, me, 1 if s["e"] is None else 0,
         sum(adv_own) / len(adv_own) / 8, max(adv_own) / 8, sum(adv_opp) / len(adv_opp) / 8, max(adv_opp) / 8]
    f += [v / 3 for v in s["c"]]
    f += [v / 3 for v in (s["e"] or [0, 0, 0])]
    for text in (s["h"], s["g"]):
        for ch in text[-3:].rjust(3, "-"):
            f += [1.0 if ch == "R" else 0.0, 1.0 if ch == "P" else 0.0, 1.0 if ch == "S" else 0.0]
    return f


def solve(task):
    meta = task["meta"]
    X = [features(s) for s in task["train"]["X"]]
    T = [features(s) for s in task["test"]["X"]]
    n, d = len(X), len(X[0])
    mean = [sum(row[j] for row in X) / n for j in range(d)]
    std = [(sum((row[j] - mean[j]) ** 2 for row in X) / n) ** 0.5 or 1.0 for j in range(d)]
    X = [[(v - m) / sd for v, m, sd in zip(row, mean, std)] + [1.0] for row in X]
    T = [[(v - m) / sd for v, m, sd in zip(row, mean, std)] + [1.0] for row in T]
    regression = meta["regression"]
    y = task["train"]["y"]
    if regression:
        mu = sum(y) / n
        scale = (sum((v - mu) ** 2 for v in y) / n) ** 0.5 or 1.0
        targets = [(v - mu) / scale for v in y]
    k = 1 if regression else meta["n_classes"]
    W = [[0.0] * (d + 1) for c in range(k)]
    lr = 0.03
    for epoch in range(25):
        for i in range(n):
            x = X[i]
            z = [sum(w * v for w, v in zip(row, x)) for row in W]                    # lan truyền xuôi
            if regression:
                g = [2.0 * (z[0] - targets[i])]                                       # đạo hàm của sai số bình phương
            else:
                top = max(z)
                e = [2.718281828 ** (v - top) for v in z]
                total = sum(e)
                g = [e[c] / total - (1.0 if c == y[i] else 0.0) for c in range(k)]    # đạo hàm của cross-entropy
            for c in range(k):                                                        # lan truyền ngược + cập nhật trọng số
                for j in range(d + 1):
                    W[c][j] -= lr * g[c] * x[j]
    scores = [[sum(w * v for w, v in zip(row, x)) for row in W] for x in T]
    if regression:
        return [sc[0] * scale + mu for sc in scores]
    return [max(range(k), key=lambda c: sc[c]) for sc in scores]
`

export const NAIVE_TEMPLATE = `# Mẫu tối giản: dự đoán lớp phổ biến nhất (phân loại) hoặc giá trị trung bình (hồi quy).
def solve(task):
    y = task["train"]["y"]
    n = len(task["test"]["X"])
    if task["meta"]["regression"]:
        return [sum(y) / len(y)] * n
    best = max(set(y), key=y.count)
    return [best] * n
`

export const TASK_TEMPLATES = [
  { id: 'mlp', label: 'Mẫu 1: đặc trưng + MLP (nnlite)', code: MLP_TEMPLATE },
  { id: 'scratch', label: 'Mẫu 2: tự viết xuôi/ngược', code: SCRATCH_TEMPLATE },
  { id: 'naive', label: 'Mẫu 3: tối giản', code: NAIVE_TEMPLATE },
]

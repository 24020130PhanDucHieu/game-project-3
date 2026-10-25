"""nnlite: mạng nơ-ron nhỏ bằng Python thuần cho Giải AI (không cần NumPy).

Có đủ vòng huấn luyện kinh điển: lan truyền xuôi (forward) -> tính mất mát -> lan truyền ngược (backward)
-> cập nhật trọng số (SGD hoặc Adam). Thư viện này được import được trong sandbox: `import nnlite`.

    net = nnlite.MLP([n_dac_trung, 16, n_lop], seed=0)         # phân loại
    net.fit(X, y, epochs=30, lr=0.01, batch=16, time_limit=6)    # y là số nguyên lớp
    nhan = net.predict(X_moi)

    net = nnlite.MLP([n_dac_trung, 16, 1], task="reg")           # hồi quy (y là số thực)
    w = net.export_weights()   # danh sách lồng nhau, nhúng vào mã nộp rồi net.load_weights(w)

Mạng nhỏ (vài chục nơ-ron ẩn, <= ~40 đặc trưng) mới huấn luyện kịp trong ngân sách thời gian của đề.
"""
import math
import random
import time


def standardize(X, mean=None, std=None):
    """Chuẩn hóa từng cột về trung bình 0, độ lệch chuẩn 1. Trả (X_moi, mean, std) để dùng lại cho dữ liệu kiểm tra."""
    n = len(X)
    d = len(X[0]) if n else 0
    if mean is None:
        mean = [sum(row[j] for row in X) / n for j in range(d)] if n else []
    if std is None:
        std = []
        for j in range(d):
            var = sum((row[j] - mean[j]) ** 2 for row in X) / n
            std.append(math.sqrt(var) or 1.0)
    return [[(v - m) / s for v, m, s in zip(row, mean, std)] for row in X], mean, std


def softmax(z):
    top = max(z)
    e = [math.exp(v - top) for v in z]
    total = sum(e)
    return [v / total for v in e]


def cross_entropy(logits, label):
    """Mất mát cross-entropy của softmax; trả (mất_mát, đạo_hàm_theo_logits)."""
    p = softmax(logits)
    loss = -math.log(max(p[label], 1e-12))
    grad = list(p)
    grad[label] -= 1.0
    return loss, grad


def mse(pred, target):
    """Sai số bình phương trung bình trên một mẫu; trả (mất_mát, đạo_hàm_theo_dự_đoán)."""
    diff = [a - b for a, b in zip(pred, target)]
    return sum(d * d for d in diff) / len(diff), [2.0 * d / len(diff) for d in diff]


class Linear:
    """Lớp tuyến tính y = Wx + b với đạo hàm cộng dồn gW, gb."""

    def __init__(self, n_in, n_out, rng):
        scale = math.sqrt(2.0 / n_in)
        self.W = [[rng.gauss(0.0, scale) for _ in range(n_in)] for _ in range(n_out)]
        self.b = [0.0] * n_out
        self.zero_grad()
        self.x = None

    def zero_grad(self):
        self.gW = [[0.0] * len(row) for row in self.W]
        self.gb = [0.0] * len(self.b)

    def forward(self, x):
        self.x = x
        return [sum(w * v for w, v in zip(row, x)) + b for row, b in zip(self.W, self.b)]

    def backward(self, g):
        """Nhận đạo hàm theo đầu ra, cộng dồn gW/gb, trả đạo hàm theo đầu vào."""
        x = self.x
        gin = [0.0] * len(x)
        for j, gj in enumerate(g):
            if gj == 0.0:
                continue
            self.gW[j] = [a + gj * v for a, v in zip(self.gW[j], x)]
            self.gb[j] += gj
            gin = [a + gj * w for a, w in zip(gin, self.W[j])]
        return gin


class Activation:
    def __init__(self, kind):
        if kind not in ("relu", "tanh", "sigmoid"):
            raise ValueError("Hàm kích hoạt phải là relu, tanh hoặc sigmoid.")
        self.kind = kind
        self.out = None

    def forward(self, x):
        if self.kind == "relu":
            self.out = [v if v > 0.0 else 0.0 for v in x]
        elif self.kind == "tanh":
            self.out = [math.tanh(v) for v in x]
        else:
            self.out = [1.0 / (1.0 + math.exp(-max(-60.0, min(60.0, v)))) for v in x]
        return self.out

    def backward(self, g):
        if self.kind == "relu":
            return [gv if o > 0.0 else 0.0 for gv, o in zip(g, self.out)]
        if self.kind == "tanh":
            return [gv * (1.0 - o * o) for gv, o in zip(g, self.out)]
        return [gv * o * (1.0 - o) for gv, o in zip(g, self.out)]


class SGD:
    """Gradient descent có động lượng: w <- w - lr * (momentum * v + g)."""

    def __init__(self, lr=0.05, momentum=0.9):
        self.lr, self.momentum, self.state = lr, momentum, {}

    def step(self, layers, scale):
        for k, layer in enumerate(layers):
            vW, vb = self.state.setdefault(k, ([[0.0] * len(r) for r in layer.W], [0.0] * len(layer.b)))
            for j, row in enumerate(layer.W):
                vW[j] = [self.momentum * v + g * scale for v, g in zip(vW[j], layer.gW[j])]
                layer.W[j] = [w - self.lr * v for w, v in zip(row, vW[j])]
            for j in range(len(layer.b)):
                vb[j] = self.momentum * vb[j] + layer.gb[j] * scale
                layer.b[j] -= self.lr * vb[j]


class Adam:
    """Adam: ước lượng động lượng bậc 1 và bậc 2 của đạo hàm rồi cập nhật trọng số."""

    def __init__(self, lr=0.01, beta1=0.9, beta2=0.999, eps=1e-8):
        self.lr, self.b1, self.b2, self.eps, self.t, self.state = lr, beta1, beta2, eps, 0, {}

    def step(self, layers, scale):
        self.t += 1
        c1, c2 = 1.0 - self.b1 ** self.t, 1.0 - self.b2 ** self.t
        for k, layer in enumerate(layers):
            if k not in self.state:
                self.state[k] = ([[0.0] * len(r) for r in layer.W], [[0.0] * len(r) for r in layer.W], [0.0] * len(layer.b), [0.0] * len(layer.b))
            mW, vW, mb, vb = self.state[k]
            for j, row in enumerate(layer.W):
                g = [v * scale for v in layer.gW[j]]
                mW[j] = [self.b1 * m + (1.0 - self.b1) * gv for m, gv in zip(mW[j], g)]
                vW[j] = [self.b2 * v + (1.0 - self.b2) * gv * gv for v, gv in zip(vW[j], g)]
                layer.W[j] = [w - self.lr * (m / c1) / (math.sqrt(v / c2) + self.eps) for w, m, v in zip(row, mW[j], vW[j])]
            for j in range(len(layer.b)):
                g = layer.gb[j] * scale
                mb[j] = self.b1 * mb[j] + (1.0 - self.b1) * g
                vb[j] = self.b2 * vb[j] + (1.0 - self.b2) * g * g
                layer.b[j] -= self.lr * (mb[j] / c1) / (math.sqrt(vb[j] / c2) + self.eps)


# Nhật ký mất mát từng vòng huấn luyện và móc báo tiến độ: chỉ để giao diện chấm thử trên máy vẽ đường học.
# Là danh sách đột biến (không gán lại tên) vì sandbox chụp tên công khai của module một lần.
FIT_LOG = []
FIT_LOG_CAP = 1000
PROGRESS = [None]


class MLP:
    """Mạng nhiều lớp. sizes = [vào, ẩn..., ra]; task = "class" (ra = số lớp) hoặc "reg" (ra = 1)."""

    def __init__(self, sizes, activation="relu", task="class", seed=0):
        if len(sizes) < 2:
            raise ValueError("Cần ít nhất lớp vào và lớp ra.")
        if task not in ("class", "reg"):
            raise ValueError('task phải là "class" hoặc "reg".')
        self.sizes, self.task = list(sizes), task
        rng = random.Random(seed)
        self.parts = []
        self.layers = []
        for i in range(len(sizes) - 1):
            layer = Linear(sizes[i], sizes[i + 1], rng)
            self.layers.append(layer)
            self.parts.append(layer)
            if i < len(sizes) - 2:
                self.parts.append(Activation(activation))

    def forward(self, x):
        for part in self.parts:
            x = part.forward(x)
        return x

    def backward(self, grad):
        for part in reversed(self.parts):
            grad = part.backward(grad)
        return grad

    def zero_grad(self):
        for layer in self.layers:
            layer.zero_grad()

    def fit(self, X, y, epochs=20, lr=0.01, batch=16, opt="adam", seed=0, time_limit=None):
        """Huấn luyện bằng mini-batch. Trả danh sách mất mát trung bình của từng epoch.
        time_limit (giây): dừng sớm khi hết giờ, giữ trọng số hiện có."""
        optimizer = Adam(lr) if opt == "adam" else SGD(lr)
        rng = random.Random(seed)
        order = list(range(len(X)))
        started = time.monotonic()
        history = []
        for _ in range(epochs):
            rng.shuffle(order)
            total = 0.0
            for start in range(0, len(order), batch):
                chunk = order[start:start + batch]
                self.zero_grad()
                for i in chunk:
                    out = self.forward(X[i])
                    if self.task == "class":
                        loss, grad = cross_entropy(out, int(y[i]))
                    else:
                        loss, grad = mse(out, [float(y[i])])
                    total += loss
                    self.backward(grad)
                optimizer.step(self.layers, 1.0 / len(chunk))
            history.append(total / max(1, len(X)))
            if len(FIT_LOG) < FIT_LOG_CAP:
                FIT_LOG.append(history[-1])
            hook = PROGRESS[0]
            if hook is not None:
                try:
                    hook(len(FIT_LOG), history[-1])
                except Exception:
                    PROGRESS[0] = None
            if time_limit is not None and time.monotonic() - started > time_limit:
                break
        return history

    def predict_proba(self, X):
        return [softmax(self.forward(x)) for x in X]

    def predict(self, X):
        if self.task == "reg":
            return [self.forward(x)[0] for x in X]
        out = []
        for x in X:
            scores = self.forward(x)
            out.append(max(range(len(scores)), key=lambda k: scores[k]))
        return out

    def export_weights(self):
        """Trọng số dạng danh sách lồng nhau (số thực làm tròn 5 chữ số), nhúng được vào mã nộp."""
        return [{"W": [[round(v, 5) for v in row] for row in layer.W], "b": [round(v, 5) for v in layer.b]} for layer in self.layers]

    def load_weights(self, weights):
        if len(weights) != len(self.layers):
            raise ValueError("Số lớp trong trọng số không khớp mạng.")
        for layer, saved in zip(self.layers, weights):
            if len(saved["W"]) != len(layer.W) or len(saved["W"][0]) != len(layer.W[0]):
                raise ValueError("Kích thước trọng số không khớp mạng.")
            layer.W = [list(row) for row in saved["W"]]
            layer.b = list(saved["b"])

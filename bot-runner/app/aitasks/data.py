"""Sinh và đệm dữ liệu của một đề. Dữ liệu huấn luyện suy ra từ hạt giống của đề; nhãn kiểm tra suy ra từ bí mật của máy chấm."""
import hashlib
import hmac
import os
import random
import threading
from collections import OrderedDict

from app.aitasks import templates as T

_lock = threading.Lock()
_cache = OrderedDict()
CACHE_ITEMS = int(os.getenv("AI_TASK_CACHE", "24"))  # mỗi mục ~ 0,2–1 MB; trần để tiết kiệm bộ nhớ


def secret():
    return os.getenv("AI_TASK_SECRET") or os.getenv("WORKER_TOKEN") or "dev-ai-task-secret"


def hmac_seed(*parts):
    return hmac.new(secret().encode(), ":".join(str(p) for p in parts).encode(), hashlib.sha256).hexdigest()[:24]


def _cached(key, build):
    with _lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
    value = build()
    with _lock:
        _cache[key] = value
        _cache.move_to_end(key)
        while len(_cache) > CACHE_ITEMS:
            _cache.popitem(last=False)
    return value


def params_key(item):
    p = item["params"]
    return hashlib.sha256(repr((item["template"], sorted((k, repr(v)) for k, v in p.items()))).encode()).hexdigest()[:16]


def train_set(item):
    key = ("train", item["seed"], params_key(item))
    return _cached(key, lambda: T.build_dataset(item["template"], item["params"], f"{item['seed']}:train", item["params"]["n_train"]))


def public_set(item):
    seed = hmac_seed("public", item["seed"], params_key(item))
    return _cached(("public", seed), lambda: T.build_dataset(item["template"], item["params"], seed, item["params"]["n_public"]))


def private_set(item, round_no):
    seed = hmac_seed("private", item["seed"], params_key(item), round_no)
    return _cached(("private", seed), lambda: T.build_dataset(item["template"], item["params"], seed, item["params"]["n_private"]))


def task_meta(item):
    meta = T.TEMPLATES[item["template"]]
    return {"classes": meta["classes"], "n_classes": len(meta["classes"]) if meta["classes"] else 0, "regression": meta["kind"] == "reg",
            "time_s": item["params"]["time_s"], "rule_id": item["params"]["rule_id"], "n_train": item["params"]["n_train"],
            "metric": meta["metric"], "task_kind": meta["kind"]}


def team_view(item):
    """Dữ liệu đội được tải về: đề + tập huấn luyện có nhãn (không có tập kiểm tra)."""
    return {"kind": item["template"], "meta": task_meta(item), "train": train_set(item)}


def build_for_grading(item, round_no, include_public=True):
    """Trả (task cho solve, nhãn công khai, nhãn riêng tư, các vị trí). Đầu vào kiểm tra trộn công khai + riêng tư để đội không phân biệt được."""
    pub = public_set(item) if include_public else {"X": [], "y": []}
    priv = private_set(item, round_no)
    inputs = [("pub", i) for i in range(len(pub["X"]))] + [("priv", i) for i in range(len(priv["X"]))]
    random.Random(hmac_seed("perm", item["seed"], round_no)).shuffle(inputs)
    X = [(pub if kind == "pub" else priv)["X"][i] for kind, i in inputs]
    task = {"kind": item["template"], "meta": task_meta(item), "train": train_set(item), "test": {"X": X}}
    return task, pub["y"], priv["y"], inputs

"""Chấm mã `solve(task)` của đội trên các đề đã bốc. Một tiến trình sandbox dùng lại cho mọi đề; quá giờ ở đề nào chỉ mất điểm đề đó."""
import threading
import time

from app.aitasks import data as D
from app.aitasks import metrics as M
from app.aitasks import templates as T
from app.sandbox.task_process import TaskProcess

DEFAULT_BUDGET = 75.0


class Session:
    """Giữ một tiến trình; nếu mô hình lỗi/quá giờ thì giết và dựng lại cho đề sau."""

    def __init__(self, code):
        self.code = code
        self.proc = None
        self.init_error = None
        self.open()

    def open(self):
        self.close()
        self.proc = TaskProcess(self.code)
        self.init_error = self.proc.error

    def solve(self, task, timeout):
        if self.init_error:
            return None, self.init_error
        out, error = self.proc.solve(task, timeout)
        if error:
            self.open()
        return out, error

    def close(self):
        if self.proc:
            self.proc.close()
            self.proc = None


def grade_item(session, item, round_no, timeout, with_public=True):
    """Trả {"public", "private", "error"}. Điểm 0..100; lỗi thì cả hai điểm bằng 0. with_public=False: chỉ chấm tập riêng tư (hiệp đấu giải chính)."""
    task, pub_y, priv_y, order = D.build_for_grading(item, round_no, include_public=with_public)
    meta = T.TEMPLATES[item["template"]]
    out, error = session.solve(task, timeout)
    if error:
        return {"public": 0.0, "private": 0.0, "error": str(error)[:200]}
    preds, problem = M.clean_predictions(meta["kind"], out, len(order), len(meta["classes"]) if meta["classes"] else None)
    if problem:
        return {"public": 0.0, "private": 0.0, "error": problem}
    pub_pred, priv_pred = [None] * len(pub_y), [None] * len(priv_y)
    for (kind, index), p in zip(order, preds):  # đưa dự đoán về đúng vị trí của mẫu gốc (đầu vào đã bị trộn)
        (pub_pred if kind == "pub" else priv_pred)[index] = p
    metric = meta["metric"]
    return {"public": M.score(metric, pub_y, pub_pred) if pub_y else 0.0, "private": M.score(metric, priv_y, priv_pred), "error": None}


def run_items(code, items, round_no, budget=DEFAULT_BUDGET):
    started = time.monotonic()
    deadline = started + budget
    session = Session(code)
    if session.init_error:
        session.close()
        return {"error": str(session.init_error)[:300], "tasks": [], "public_score": 0.0, "private_score": 0.0, "errors": [], "elapsed_ms": 0}
    results, errors = [], []
    try:
        for n, item in enumerate(items):
            remaining = deadline - time.monotonic()
            if remaining <= 0.5:
                result = {"public": 0.0, "private": 0.0, "error": "Hết thời gian chấm của bộ đề."}
            else:
                result = grade_item(session, item, round_no, min(float(item["params"]["time_s"]), remaining))
            result["n"] = n
            if result["error"] and len(errors) < 5:
                errors.append(f"Đề {n + 1}: {result['error']}")
            results.append(result)
    finally:
        session.close()
    mean = lambda key: round(sum(r[key] for r in results) / len(results), 3) if results else 0.0
    return {"tasks": results, "public_score": mean("public"), "private_score": mean("private"), "errors": errors,
            "budget_exceeded": time.monotonic() > deadline, "elapsed_ms": int((time.monotonic() - started) * 1000)}


def validate_code(code, item):
    """Kiểm tra mã nộp: chạy `solve` trên một đề mini (40 mẫu huấn luyện, 10 mẫu kiểm tra) sinh riêng, chỉ để biết mã chạy và trả đúng dạng."""
    meta = T.TEMPLATES[item["template"]]
    params = dict(item["params"], n_train=40, n_public=10)
    tiny = {"kind": item["template"], "meta": D.task_meta(dict(item, params=params)),
            "train": T.build_dataset(item["template"], params, "validate:train", 40), "test": {"X": T.build_dataset(item["template"], params, "validate:test", 10)["X"]}}
    started = time.monotonic()
    session = Session(code)
    try:
        if session.init_error:
            return {"is_valid": False, "error_message": str(session.init_error)[:300], "execution_time_ms": 0}
        out, error = session.solve(tiny, min(float(item["params"]["time_s"]), 10.0))
    finally:
        session.close()
    ms = int((time.monotonic() - started) * 1000)
    if error:
        return {"is_valid": False, "error_message": str(error)[:300], "execution_time_ms": ms}
    _, problem = M.clean_predictions(meta["kind"], out, 10, len(meta["classes"]) if meta["classes"] else None)
    if problem:
        return {"is_valid": False, "error_message": problem, "execution_time_ms": ms}
    return {"is_valid": True, "error_message": None, "execution_time_ms": ms}


def duel(code_a, code_b, item, round_no, timeout=None):
    """Một hiệp đề ML: hai đội chạy song song trên cùng đề, điểm riêng tư cao hơn thắng. Trả {scores, errors, winner|None}."""
    limit = float(timeout or item["params"]["time_s"])
    out = {}

    def run(side, code):
        session = Session(code)
        try:
            if session.init_error:
                out[side] = {"public": 0.0, "private": 0.0, "error": str(session.init_error)[:200]}
            else:
                out[side] = grade_item(session, item, round_no, limit, with_public=False)
        finally:
            session.close()

    # dữ liệu sinh sẵn một lần để hai luồng dùng chung bộ đệm
    D.build_for_grading(item, round_no, include_public=False)
    threads = [threading.Thread(target=run, args=(side, code)) for side, code in (("team_a", code_a), ("team_b", code_b))]
    for t in threads:
        t.start()
    for t in threads:
        t.join(limit + 20)
    for side in ("team_a", "team_b"):
        out.setdefault(side, {"public": 0.0, "private": 0.0, "error": "Không chấm được."})
    a, b = out["team_a"]["private"], out["team_b"]["private"]
    return {"scores": {"team_a": a, "team_b": b}, "errors": {"team_a": out["team_a"]["error"], "team_b": out["team_b"]["error"]},
            "winner": None if a == b else ("team_a" if a > b else "team_b")}

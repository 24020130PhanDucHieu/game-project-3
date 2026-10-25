"""Chấm thử trên máy (trong trình duyệt) một đề của Giải AI: chia 80/20 tập huấn luyện đã tải rồi chạy `solve`.

Chỉ cần dữ liệu có nhãn của đề: không có bộ sinh thế cờ và không có nhãn kiểm tra thật nên không lộ gì.
Điểm này là ước lượng; điểm thật tính trên thế cờ ẩn của máy chấm.

Ngoài điểm còn trả dữ liệu để giao diện vẽ hình minh họa: chỉ số mẫu kiểm tra, nhãn thật, dự đoán và
đường mất mát khi huấn luyện (nếu mô hình dùng nnlite).
"""
import sys
import time

from app.aitasks import metrics as M


def _fit_log():
    """Nhật ký mất mát của nnlite mà mã đội thấy (module cấp cao `nnlite`, khác với `app.aitasks.nnlite`)."""
    mod = sys.modules.get("nnlite")
    if mod is None:
        try:
            import importlib
            mod = importlib.import_module("nnlite")
        except ImportError:
            mod = None
    return mod, (getattr(mod, "FIT_LOG", None) if mod else None)


def check(code, task, run_solve, every=5, progress=None):
    X, y = task["train"]["X"], task["train"]["y"]
    val = [i for i in range(len(X)) if i % every == 0]
    fit = [i for i in range(len(X)) if i % every != 0]
    meta = dict(task["meta"], n_train=len(fit))
    sub = {"kind": task["kind"], "meta": meta, "train": {"X": [X[i] for i in fit], "y": [y[i] for i in fit]}, "test": {"X": [X[i] for i in val]}}
    mod, log = _fit_log()
    if log is not None:
        del log[:]
    if mod is not None and progress is not None:
        last = [0.0]

        def hook(epoch, loss):
            now = time.monotonic()
            if now - last[0] >= 0.1:
                last[0] = now
                progress(epoch, loss)

        mod.PROGRESS[0] = hook
    started = time.monotonic()
    base = {"n_val": len(val), "n_train": len(fit), "val_idx": val}
    try:
        out = run_solve(code, sub)
    except Exception as exc:
        return dict(base, score=0.0, error=str(exc)[:300], elapsed_ms=int((time.monotonic() - started) * 1000), fit_log=list(log or []))
    finally:
        if mod is not None:
            mod.PROGRESS[0] = None
    elapsed = int((time.monotonic() - started) * 1000)
    fit_log = [round(v, 5) for v in (list(log) if log else [])]
    preds, problem = M.clean_predictions(meta["task_kind"], out, len(val), meta["n_classes"] or None)
    if problem:
        return dict(base, score=0.0, error=problem, elapsed_ms=elapsed, fit_log=fit_log)
    error = None
    if elapsed > float(meta["time_s"]) * 1000:
        error = f"Chạy {elapsed / 1000:.1f}s, vượt thời gian cho phép {meta['time_s']}s: ở máy chấm đề này sẽ bị tính 0 điểm."
    y_true = [y[i] for i in val]
    return dict(base, score=M.score(meta["metric"], y_true, preds), error=error, elapsed_ms=elapsed, y_true=y_true, preds=list(preds), fit_log=fit_log)

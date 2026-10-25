"""Thước đo điểm của Giải AI (thang 0..100) và kiểm tra dạng dự đoán. Dùng chung với bản chấm thử trên trình duyệt."""
import math


def accuracy(y_true, y_pred):
    return 100.0 * sum(1 for a, b in zip(y_true, y_pred) if a == b) / len(y_true)


def balanced_accuracy(y_true, y_pred):
    totals, hits = {}, {}
    for a, b in zip(y_true, y_pred):
        totals[a] = totals.get(a, 0) + 1
        if a == b:
            hits[a] = hits.get(a, 0) + 1
    return 100.0 * sum(hits.get(k, 0) / n for k, n in totals.items()) / len(totals)


def r2(y_true, y_pred):
    mean = sum(y_true) / len(y_true)
    sst = sum((a - mean) ** 2 for a in y_true)
    if sst <= 0:
        return 0.0
    try:
        sse = sum((a - b) ** 2 for a, b in zip(y_true, y_pred))
    except OverflowError:  # mô hình phân kỳ cho dự đoán khổng lồ: coi là kém hơn đoán trung bình
        return 0.0
    if not math.isfinite(sse):
        return 0.0
    return 100.0 * max(0.0, 1.0 - sse / sst)


METRICS = {"accuracy": accuracy, "balanced_accuracy": balanced_accuracy, "r2": r2}
METRIC_NAME = {"accuracy": "độ chính xác (%)", "balanced_accuracy": "độ chính xác cân bằng giữa các lớp (%)", "r2": "R² (đo độ khớp, 0 nếu kém hơn đoán trung bình) × 100"}


def clean_predictions(kind, preds, n, n_classes=None):
    """Trả (danh_sách_đã_chuẩn_hóa, None) hoặc (None, lý_do)."""
    if not isinstance(preds, list):
        return None, "solve phải trả về một danh sách dự đoán."
    if len(preds) != n:
        return None, f"solve trả {len(preds)} dự đoán, cần đúng {n} (mỗi mẫu kiểm tra một dự đoán)."
    out = []
    for v in preds:
        if isinstance(v, bool):
            v = int(v)
        if not isinstance(v, (int, float)) or not math.isfinite(v):
            return None, "Dự đoán phải là số hữu hạn."
        if kind == "class":
            if int(v) != v or not (0 <= int(v) < n_classes):
                return None, f"Dự đoán lớp phải là số nguyên từ 0 đến {n_classes - 1}."
            out.append(int(v))
        else:
            # Giá trị quá lớn (mô hình phân kỳ) làm tràn khi bình phương; kẹp về một khoảng rộng nhưng an toàn.
            out.append(max(-1e9, min(1e9, float(v))))
    return out, None


def score(metric, y_true, y_pred):
    return round(METRICS[metric](y_true, y_pred), 3)

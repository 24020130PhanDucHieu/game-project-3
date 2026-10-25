"""Thử một đề trước khi cho vào kho/bốc: đo thời gian sinh, kích thước, điểm mức ngây thơ và điểm mô hình tham chiếu."""
import json
import time

from app.aitasks import catalog
from app.aitasks import data as D
from app.aitasks import metrics as M
from app.aitasks import runner
from app.aitasks import templates as T
from app.aitasks.reference import REFERENCE_CODE


def probe(raw_entry, run_reference=True):
    entry, errors = catalog.normalize_entry(raw_entry)
    if errors:
        return {"ok": False, "errors": errors, "entry": entry}
    item = {"entry_id": entry["id"], "name": entry["name"], "template": entry["template"], "difficulty": entry["difficulty"], "seed": "probe:1",
            "params": entry["params"], "statement": entry["statement"], "tags": entry["tags"], "n": 0}
    started = time.monotonic()
    train, public, private = D.train_set(item), D.public_set(item), D.private_set(item, 1)
    gen_ms = int((time.monotonic() - started) * 1000)
    size_kb = round(len(json.dumps(train, separators=(",", ":"))) / 1024 + len(json.dumps(public["X"], separators=(",", ":"))) / 1024 + len(json.dumps(private["X"], separators=(",", ":"))) / 1024, 1)
    meta = T.TEMPLATES[item["template"]]
    ytr = train["y"]
    if meta["kind"] == "class":
        majority = max(set(ytr), key=ytr.count)
        naive = M.score(meta["metric"], public["y"], [majority] * len(public["y"]))
        counts = {str(k): ytr.count(k) for k in sorted(set(ytr))}
    else:
        mu = sum(ytr) / len(ytr)
        naive = M.score("r2", public["y"], [mu] * len(public["y"]))
        counts = {"mean": round(mu, 3), "min": min(ytr), "max": max(ytr)}
    result = {"ok": True, "errors": [], "entry": entry, "gen_ms": gen_ms, "size_kb": size_kb, "naive": naive, "label_stats": counts,
              "samples": {"train": len(train["X"]), "public": len(public["X"]), "private": len(private["X"])}, "warnings": []}
    if run_reference:
        graded = runner.run_items(REFERENCE_CODE, [item], 1)
        ref = graded["tasks"][0] if graded.get("tasks") else {"public": 0.0, "private": 0.0, "error": graded.get("error")}
        result["reference"] = {"public": ref["public"], "private": ref["private"], "error": ref.get("error"), "elapsed_ms": graded.get("elapsed_ms", 0)}
        if ref.get("error"):
            result["warnings"].append("Mô hình tham chiếu bị lỗi trên đề này: " + str(ref["error"]))
        elif ref["private"] - naive < 10:
            result["warnings"].append("Mô hình tham chiếu không hơn mức ngây thơ ≥ 10 điểm: đề có thể quá khó hoặc quá nhiễu, các đội sẽ khó phân thắng thua.")
    if gen_ms > 4000:
        result["warnings"].append("Sinh dữ liệu chậm (> 4 giây). Hãy giảm số mẫu hoặc chọn luật nhẹ hơn.")
    if size_kb > 400:
        result["warnings"].append("Dữ liệu một đề lớn hơn 400 KB. Hãy giảm số mẫu.")
    return result

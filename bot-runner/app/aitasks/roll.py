"""Bốc ngẫu nhiên các đề từ kho thành một kế hoạch. Mỗi mục kế hoạch sao chép thông số của đề (sửa kho sau này không đổi kế hoạch đã khóa)."""
import copy
import random

from app.aitasks import catalog


def roll(entries, count, seed, tags=None, difficulties=None, exclude=None, ramp=True):
    """entries: các mục kho đã chuẩn hóa (dựng sẵn + của admin). Trả list mục kế hoạch hoặc ném ValueError nếu kho không đủ."""
    rng = random.Random(f"roll:{seed}")
    exclude = set(exclude or [])
    pool = [e for e in entries if e.get("enabled", True) and e["id"] not in exclude
            and (not tags or set(tags) & set(e.get("tags", []))) and (not difficulties or e["difficulty"] in difficulties)]
    if not pool:
        raise ValueError("Kho không có đề nào khớp bộ lọc. Hãy nới bộ lọc hoặc bật thêm đề.")
    by_template = {}
    for e in pool:
        by_template.setdefault(e["template"], []).append(e)
    for group in by_template.values():
        rng.shuffle(group)
    order = list(by_template)
    rng.shuffle(order)
    picked, i = [], 0
    while len(picked) < count:
        template = order[i % len(order)]
        group = by_template[template]
        entry = group[(i // len(order)) % len(group)]
        picked.append(entry)
        i += 1
    if ramp:
        picked.sort(key=lambda e: e["difficulty"])
    plan = []
    for n, e in enumerate(picked):
        plan.append({"n": n, "entry_id": e["id"], "name": e["name"], "template": e["template"], "difficulty": e["difficulty"],
                     "seed": f"{seed}:{n}:{rng.getrandbits(40):x}", "params": copy.deepcopy(e["params"]), "statement": e.get("statement", ""), "tags": e.get("tags", [])})
    return plan


def public_plan(plan):
    return [catalog.public_spec(item, n) for n, item in enumerate(plan)]

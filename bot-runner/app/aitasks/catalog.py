"""Kho đề của Giải AI: đề dựng sẵn, kiểm tra/chuẩn hóa đề do admin thêm, và phần công khai của đề (không có hạt giống)."""
import re

from app.aitasks import policies as pol
from app.aitasks import templates as T
from app.aitasks.metrics import METRIC_NAME

ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{2,39}$")
RULE_NAMES = {"STAGE_1_STANDARD": "luật chuẩn"}

CONTRACT = (
    "Viết hàm Python `solve(task)` trả về một danh sách dự đoán, mỗi mẫu trong `task[\"test\"][\"X\"]` đúng một dự đoán, đúng thứ tự. "
    "`task[\"train\"][\"X\"]` và `task[\"train\"][\"y\"]` là dữ liệu có nhãn để học; `task[\"meta\"]` có `classes` (tên lớp, nếu là phân loại), `n_classes`, `regression`, `time_s`. "
    "Mỗi mẫu là một dict gọn: b (chuỗi 81 ký tự của bàn cờ, hàng trước, 9 ô mỗi hàng; quân của bên đi in HOA, quân đối thủ in thường hoặc ? khi bị sương mù che, # là vật cản, . là ô trống), "
    "s (bên đi: 0 Đỏ, 1 Xanh), t (số lượt), c (số quân Búa/Giấy/Kéo của bên đi), e (của đối thủ, hoặc null khi sương mù), h và g (các lá bài gần nhất của bên đi và đối thủ, ví dụ \"RPS\"). "
    "Chỉ cần đọc các trường này, không cần biết engine."
)

TEMPLATE_STATEMENT = {
    "winner": "Mỗi mẫu là một thế cờ lúc bên đi sắp ra bài. Nhãn là 1 nếu bên đi sau đó thắng ván, 0 nếu thua. Ván do hai chính sách mẫu ({mix}) chơi nên có nhiễu.",
    "nextcard": "Mỗi mẫu là một thế cờ lúc bên đi sắp ra bài. Nhãn là lá bài (0 Búa, 1 Giấy, 2 Kéo) mà bên đi thực sự ra. Bên đi chơi theo một chính sách mẫu cố định ({target}, có nhiễu {noise}); hãy học (nhân bản) chính sách đó từ thế cờ và lịch sử.",
    "plies_left": "Mỗi mẫu là một thế cờ. Nhãn là số nước còn lại tới khi ván kết thúc (tối đa {cap}). Ván do hai chính sách mẫu ({mix}) chơi.",
    "material": "Mỗi mẫu là một thế cờ. Nhãn là (số quân của bên đi) trừ (số quân của đối thủ) sau {horizon} nước nữa (hoặc lúc ván kết thúc nếu sớm hơn). Ván do hai chính sách mẫu ({mix}) chơi.",
    "capture_next": "Mỗi mẫu là một thế cờ lúc bên đi sắp ra bài. Nhãn là 1 nếu trong lượt này bên đi ăn được quân đối thủ, 0 nếu không (dữ liệu cân bằng hai lớp). Đây là bài toán học luật tương khắc và tầm ăn quân của bàn cờ.",
}


def _entry(id, name, template, difficulty, tags, **params):
    return {"id": id, "name": name, "template": template, "params": params, "statement": "", "tags": tags, "difficulty": difficulty, "enabled": True, "builtin": True}


BUILTIN = [
    _entry("winner-standard", "Ai thắng? (luật chuẩn)", "winner", 1, ["thế cờ", "cơ bản"], rule_id="STAGE_1_STANDARD"),
    _entry("winner-obstacles", "Ai thắng? (vật cản)", "winner", 2, ["thế cờ", "vật cản"], rule_id="COMBO_16"),
    _entry("winner-fog", "Ai thắng? (sương mù)", "winner", 3, ["thế cờ", "sương mù"], rule_id="COMBO_4"),
    _entry("nextcard-aggressive", "Bên hiếu chiến sẽ ra bài gì?", "nextcard", 1, ["đối thủ", "cơ bản"], rule_id="STAGE_1_STANDARD", target="aggressive", noise=0.05),
    _entry("nextcard-counter", "Bên phản đòn sẽ ra bài gì?", "nextcard", 2, ["đối thủ"], rule_id="STAGE_1_STANDARD", target="counter", noise=0.1),
    _entry("nextcard-hunter", "Bên săn quân đông nhất sẽ ra bài gì?", "nextcard", 3, ["đối thủ", "nâng cao"], rule_id="STAGE_1_STANDARD", target="hunter", noise=0.1),
    _entry("plies-standard", "Còn bao nhiêu nước? (luật chuẩn)", "plies_left", 3, ["thế cờ", "hồi quy"], rule_id="STAGE_1_STANDARD", cap=30),
    _entry("plies-short", "Còn bao nhiêu nước? (chỉ tính 20 nước cuối)", "plies_left", 2, ["thế cờ", "hồi quy"], rule_id="STAGE_1_STANDARD", cap=20),
    _entry("material-standard", "Chênh lệch số quân sau vài nước", "material", 2, ["thế cờ", "hồi quy"], rule_id="STAGE_1_STANDARD", horizon=6),
    _entry("material-fog", "Chênh lệch số quân (sương mù)", "material", 3, ["thế cờ", "hồi quy", "sương mù"], rule_id="COMBO_4", horizon=8),
    _entry("capture-standard", "Nước đi này có ăn quân không?", "capture_next", 1, ["luật", "cơ bản"], rule_id="STAGE_1_STANDARD"),
    _entry("capture-reverse", "Có ăn quân không? (đảo tương khắc)", "capture_next", 2, ["luật", "đảo khắc"], rule_id="COMBO_2"),
]


def _num(value, low, high, default, integer=False, errors=None, label=""):
    if value is None:
        return default
    try:
        v = float(value)
    except (TypeError, ValueError):
        errors.append(f"{label} phải là số.")
        return default
    if v < low or v > high:
        errors.append(f"{label} phải trong khoảng {low} đến {high}.")
        return default
    return int(v) if integer else v


def normalize_entry(raw, builtin=False):
    """Kiểm tra và chuẩn hóa một mục kho. Trả (entry, lỗi[]). Không nhận mã, chỉ nhận thông số nằm trong trần."""
    errors = []
    raw = raw if isinstance(raw, dict) else {}
    template = raw.get("template")
    if template not in T.TEMPLATES:
        errors.append("Mẫu đề không hợp lệ.")
        template = "winner"
    entry_id = str(raw.get("id") or "").strip().lower()
    if not ID_RE.match(entry_id):
        errors.append("Mã đề gồm 3–40 ký tự a-z, 0-9, gạch ngang hoặc gạch dưới.")
    name = str(raw.get("name") or "").strip()
    if not (3 <= len(name) <= 80):
        errors.append("Tên đề cần 3–80 ký tự.")
    statement = str(raw.get("statement") or "").strip()
    if len(statement) > 600:
        errors.append("Phần mô tả thêm tối đa 600 ký tự.")
    tags = [str(t).strip()[:20] for t in (raw.get("tags") or []) if str(t).strip()][:5]
    difficulty = int(_num(raw.get("difficulty"), 1, 3, 2, True, errors, "Độ khó"))
    src = raw.get("params") if isinstance(raw.get("params"), dict) else {}
    p = dict(T.DEFAULTS)
    rule = str(src.get("rule_id") or p["rule_id"])
    if not T.RULE_RE.match(rule):
        errors.append("Luật bàn cờ không hợp lệ (STAGE_…, RULE_… hoặc COMBO_0–31).")
    else:
        p["rule_id"] = rule
        if rule.startswith("COMBO_") and int(rule.split("_")[1]) > 31:
            errors.append("COMBO phải từ 0 đến 31.")
    mix = src.get("mix", p["mix"])
    if not isinstance(mix, list) or not mix or any(m not in pol.POLICIES for m in mix):
        errors.append("Hỗn hợp chính sách chỉ gồm: " + ", ".join(pol.POLICIES) + ".")
    else:
        p["mix"] = list(dict.fromkeys(mix))
    target = src.get("target", p["target"])
    if target not in pol.POLICIES:
        errors.append("Chính sách đối thủ không hợp lệ.")
    else:
        p["target"] = target
    p["noise"] = round(_num(src.get("noise"), 0.0, 0.4, p["noise"], False, errors, "Độ nhiễu"), 3)
    p["balance"] = round(_num(src.get("balance"), 0.2, 0.8, p["balance"], False, errors, "Tỉ lệ mẫu dương"), 3)
    for key, label in (("n_train", "Số mẫu huấn luyện"), ("n_public", "Số mẫu kiểm tra công khai"), ("n_private", "Số mẫu kiểm tra riêng tư"), ("time_s", "Thời gian mỗi đề (giây)"), ("per_game", "Số mẫu mỗi ván"), ("horizon", "Chân trời (nước)"), ("cap", "Trần số nước")):
        low, high = T.LIMITS[key]
        p[key] = _num(src.get(key), low, high, p[key], True, errors, label)
    entry = {"id": entry_id, "name": name, "template": template, "params": p, "statement": statement, "tags": tags, "difficulty": difficulty,
             "enabled": bool(raw.get("enabled", True)), "builtin": bool(builtin)}
    return entry, errors


def builtin_entries():
    out = []
    for raw in BUILTIN:
        entry, errors = normalize_entry(raw, builtin=True)
        assert not errors, (raw["id"], errors)
        out.append(entry)
    return out


def statement_for(item):
    p, template = item["params"], item["template"]
    meta = T.TEMPLATES[template]
    text = TEMPLATE_STATEMENT[template].format(mix=", ".join(p["mix"]), target=p["target"], noise=p["noise"], cap=p["cap"], horizon=p["horizon"])
    rule = RULE_NAMES.get(p["rule_id"], p["rule_id"])
    parts = [f"{meta['title']}. Luật bàn cờ: {rule}.", text, f"Thước đo: {METRIC_NAME[meta['metric']]}. Thời gian cho mỗi đề: {p['time_s']} giây.", CONTRACT]
    if item.get("statement"):
        parts.append(item["statement"])
    return "\n\n".join(parts)


def public_spec(item, n=None):
    """Phần của một mục kế hoạch được phép công khai: không có hạt giống."""
    meta = T.TEMPLATES[item["template"]]
    p = item["params"]
    return {
        "n": n if n is not None else item.get("n"), "id": item["entry_id"] if "entry_id" in item else item["id"], "name": item["name"], "template": item["template"],
        "difficulty": item["difficulty"], "rule_id": p["rule_id"], "kind": meta["kind"], "classes": meta["classes"], "metric": meta["metric"],
        "n_train": p["n_train"], "time_s": p["time_s"], "title": meta["title"], "statement": statement_for(item),
    }


def normalize_item(raw):
    """Chuẩn hóa một mục kế hoạch (đã lưu) trước khi dùng: chặn thông số vượt trần dù dữ liệu bị sửa tay."""
    raw = raw if isinstance(raw, dict) else {}
    entry, errors = normalize_entry({"id": raw.get("entry_id") or "item-000", "name": raw.get("name") or "đề", "template": raw.get("template"), "params": raw.get("params"),
                                     "statement": raw.get("statement", ""), "tags": raw.get("tags"), "difficulty": raw.get("difficulty", 2)})
    if errors:
        raise ValueError("Mục đề không hợp lệ: " + "; ".join(errors))
    seed = str(raw.get("seed") or "")[:80]
    if not seed:
        raise ValueError("Mục đề thiếu hạt giống.")
    return {"entry_id": entry["id"], "name": entry["name"], "template": entry["template"], "difficulty": entry["difficulty"], "seed": seed,
            "params": entry["params"], "statement": entry["statement"], "tags": entry["tags"], "n": int(raw.get("n") or 0)}


def all_entries(custom=None, disabled=None):
    """Đề dựng sẵn (bật/tắt theo `disabled`) cộng đề admin đã lưu (bỏ qua mục hỏng)."""
    disabled = set(disabled or [])
    entries = []
    for entry in builtin_entries():
        entry["enabled"] = entry["id"] not in disabled
        entries.append(entry)
    seen = {e["id"] for e in entries}
    for raw in custom or []:
        entry, errors = normalize_entry(raw)
        if not errors and entry["id"] not in seen:
            entries.append(entry)
            seen.add(entry["id"])
    return entries

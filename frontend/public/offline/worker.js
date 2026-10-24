/* Máy chấm offline trong trình duyệt: Pyodide chạy đúng engine 9×9 của server (board.py) trong Web Worker. */
/* global loadPyodide */
// Ưu tiên bản Pyodide lưu ngay trên web (tải lúc build); CDN chỉ là dự phòng vì mạng trường hay chặn CDN.
const SOURCES = [
  new URL('./pyodide/', self.location.href).href,
  'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/',
  'https://unpkg.com/pyodide@0.27.2/',
]
let PYODIDE = ''
const loadErrors = []

const SHIM = `
import ast, builtins, importlib, types, sys, json, random

SAFE_MODULES = {"random", "math", "collections", "itertools", "re", "json", "heapq", "functools", "typing"}
MAX_CODE_BYTES = 65536
VALID = ("ROCK", "PAPER", "SCISSORS", "JOKER")

def validate_ast(code):
    if len(code.encode("utf-8")) > MAX_CODE_BYTES:
        return "Mã nguồn vượt quá giới hạn 64 KB."
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        return f"Lỗi cú pháp Python: dòng {exc.lineno}: {exc.msg}"
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and node.attr.startswith("_"):
            return "Không cho phép truy cập thuộc tính nội bộ của Python."
        if isinstance(node, ast.Name) and node.id.startswith("_") and node.id not in ("__name__", "__main__", "__doc__"):
            return "Không cho phép sử dụng tên nội bộ của Python."
        if isinstance(node, (ast.Global, ast.Nonlocal)):
            return "Không cho phép thay đổi biến toàn cục trong sandbox."
    return None

_views = {}
def module_view(name):
    if name not in _views:
        module = importlib.import_module(name)
        names = getattr(module, "__all__", [n for n in vars(module) if not n.startswith("_")])
        if name == "typing": names = ("Any","Callable","Dict","List","Tuple","Set","FrozenSet","Optional","Union","Iterable","Iterator","Sequence","Mapping","MutableMapping","DefaultDict","Deque","NoReturn","Literal","Final","cast")
        if name == "functools": names = ("reduce","partial","lru_cache","cache","cmp_to_key")
        exposed = {n: getattr(module, n) for n in names if not n.startswith("_") and hasattr(module, n) and not isinstance(getattr(module, n), types.ModuleType)}
        view = types.SimpleNamespace(**exposed)
        view.__all__ = tuple(exposed)
        _views[name] = view
        if name == "collections": view.abc = module_view("collections.abc")
    return _views[name]

def safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    if level or (name not in SAFE_MODULES and name != "collections.abc") or any(n.startswith("_") for n in (fromlist or ())):
        raise ImportError("Import module bị cấm")
    view = module_view(name)
    return module_view("collections") if name == "collections.abc" and not fromlist else view

SAFE = {n: getattr(builtins, n) for n in ("range","len","min","max","abs","sum","int","float","str","bool","list","dict","set","tuple","sorted","reversed","enumerate","zip","next","iter","any","all","map","filter","isinstance","type")}
SAFE["__import__"] = safe_import
SAFE["print"] = lambda *a, **k: None
_compiled = {}

def run_bot(code, state):
    if code not in _compiled:
        problem = validate_ast(code)
        if problem: raise ValueError(problem)
        _compiled[code] = compile(code, "<bot>", "exec")
    # Như server: mỗi lượt chạy trong phạm vi mới, bot không giữ biến giữa các lượt.
    scope = {"__name__": "__bot__", "__doc__": None, "__builtins__": dict(SAFE), "random": module_view("random"), "math": module_view("math")}
    exec(_compiled[code], scope, scope)
    fn = scope.get("decide_move")
    if not callable(fn): raise ValueError("Thiếu hàm decide_move(game_state)")
    move = fn(json.loads(json.dumps(state)))
    if not isinstance(move, str) or move.upper() not in VALID: raise ValueError("Nước đi không hợp lệ: " + repr(move)[:40])
    return move.upper()

class BotRunner:
    @staticmethod
    def run_python_code(code_str, game_state, timeout=1.0):
        cards = game_state.get("remaining_cards", {})
        available = [k for k, v in cards.items() if v > 0]
        try:
            return run_bot(code_str, game_state), None
        except Exception as exc:
            return (available[0] if available else "ROCK"), f"Runtime Error: {exc}"
    @staticmethod
    def compile_cpp_code(code):
        return None, "Chạy offline chỉ hỗ trợ Python. C++ cần kết nối tới máy chấm."
`

const SCHEMAS = `
class _Any:
    def __init__(self, *a, **k): self.__dict__.update(k)
    def __getattr__(self, name): return name
GameRulesConfig = PlayerTurnState = RoundResult = _Any
class TournamentStage:
    STAGE_1_STANDARD = "STAGE_1_STANDARD"; STAGE_2_MUTATED = "STAGE_2_MUTATED"; STAGE_3_REVERSE_FOG = "STAGE_3_REVERSE_FOG"; STAGE_4_FINALS = "STAGE_4_FINALS"
class MoveType:
    ROCK = "ROCK"; PAPER = "PAPER"; SCISSORS = "SCISSORS"; JOKER = "JOKER"
`

const BOSSES = {
  RANDOM: ['Boss 1: Random Bot (Ngẫu nhiên)', `import random
def decide_move(game_state):
    cards = game_state.get("remaining_cards", {})
    available = [c for c, count in cards.items() if count > 0]
    return random.choice(available) if available else "ROCK"
`],
  AGGRESSIVE: ['Boss 2: Aggressive Bot (Hiếu chiến)', `import random
def decide_move(game_state):
    turn = game_state.get("turn_number", 1)
    cards = game_state.get("remaining_cards", {})
    available = [c for c, count in cards.items() if count > 0]
    if not available:
        return "ROCK"
    pref = "ROCK" if turn <= 3 else ("SCISSORS" if turn <= 6 else "PAPER")
    return pref if pref in available else random.choice(available)
`],
  ADAPTIVE: ['Boss 3: Adaptive Counter (Phản đòn)', `import random
def decide_move(game_state):
    cards = game_state.get("remaining_cards", {})
    available = [c for c, count in cards.items() if count > 0]
    if not available:
        return "ROCK"
    history = game_state.get("history", [])
    counter_map = {"ROCK": "PAPER", "PAPER": "SCISSORS", "SCISSORS": "ROCK"}
    if history:
        last = history[-1]
        opp = last.get("opponent_move") or last.get("their_move")
        if opp in counter_map and counter_map[opp] in available:
            return counter_map[opp]
    return random.choice(available)
`],
}

let ready = null
let engineVersion = ''

const msg = (error) => (error && error.message ? error.message : String(error))

// Bộ nhớ đệm của trình duyệt có thể giữ bản hỏng (trang HTML thay cho file JS/WASM) từ bản web cũ:
// xóa mọi file Pyodide đã lưu (ở mọi cache), không cần người dùng xóa dữ liệu trình duyệt.
async function purgePyodideCache() {
  if (typeof caches === 'undefined') return
  for (const name of await caches.keys()) {
    const cache = await caches.open(name)
    for (const req of await cache.keys()) {
      if (req.url.includes('pyodide')) await cache.delete(req)
    }
  }
}

// Tải pyodide.js bằng fetch (không dùng importScripts) để kiểm tra được nội dung và báo lỗi rõ ràng.
async function loadScript(base, fresh) {
  const url = base + 'pyodide.js' + (fresh ? '?r=' + Date.now() : '')
  let res
  try {
    res = await fetch(url, { cache: fresh ? 'reload' : 'default', credentials: 'omit' })
  } catch (error) {
    throw new Error('không kết nối được (' + msg(error) + ')')
  }
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const type = res.headers.get('content-type') || ''
  const text = await res.text()
  if (type.includes('text/html') || /^\s*</.test(text)) throw new Error('nhận được trang HTML thay vì file JS')
  ;(0, eval)(text)
  if (typeof self.loadPyodide !== 'function') throw new Error('file pyodide.js không hợp lệ')
}

async function startPyodide(fresh) {
  for (const base of SOURCES) {
    try {
      await loadScript(base, fresh)
    } catch (error) {
      loadErrors.push(base + (fresh ? ' [tải lại]' : '') + ': ' + msg(error))
      continue
    }
    try {
      const py = await self.loadPyodide({ indexURL: base })
      PYODIDE = base
      return py
    } catch (error) {
      loadErrors.push(base + (fresh ? ' [tải lại]' : '') + ' khởi động: ' + msg(error))
    }
  }
  return null
}

async function boot() {
  loadErrors.length = 0
  let py = await startPyodide(false)
  if (!py) {
    try { await purgePyodideCache() } catch (error) { loadErrors.push('xóa cache: ' + msg(error)) }
    py = await startPyodide(true)
  }
  if (!py) throw new Error('Không khởi động được máy chấm trên máy (' + loadErrors.join(' | ').slice(0, 900) + ')')
  const res = await fetch('./engine/manifest.json', { cache: 'no-cache' })
  if (!res.ok) throw new Error('Không tải được engine offline (HTTP ' + res.status + ')')
  const manifest = await res.json()
  engineVersion = manifest.version
  const fs = py.FS
  for (const dir of ['/arena', '/arena/app', '/arena/app/engine', '/arena/app/models', '/arena/app/sandbox']) { try { fs.mkdir(dir) } catch { /* đã có */ } }
  for (const f of ['/arena/app/__init__.py', '/arena/app/engine/__init__.py', '/arena/app/models/__init__.py', '/arena/app/sandbox/__init__.py']) fs.writeFile(f, '')
  fs.writeFile('/arena/app/models/schemas.py', SCHEMAS)
  fs.writeFile('/arena/app/sandbox/runner.py', SHIM)
  for (const file of manifest.files) fs.writeFile('/arena/app/engine/' + file, await (await fetch('./engine/' + file)).text())
  py.runPython('import sys; sys.path.insert(0, "/arena"); from app.engine.board import simulate_board; from app.sandbox.runner import validate_ast, run_bot')
  return py
}

self.onmessage = async (event) => {
  const { id, kind, payload } = event.data || {}
  try {
    ready = ready || boot().catch((error) => { ready = null; throw error })
    const py = await ready
    if (kind === 'prepare') { self.postMessage({ id, ok: true, result: { version: engineVersion } }); return }
    if ((payload.language || 'PYTHON') !== 'PYTHON') throw new Error('Chạy offline chỉ hỗ trợ Python. C++ cần kết nối tới máy chấm.')
    py.globals.set('job', py.toPy(payload))
    let result
    if (kind === 'validate') {
      result = py.runPython(`
import json, time
from app.engine.board_rules import board_rules
problem = validate_ast(job["code"])
out = {"is_valid": problem is None, "error_message": problem, "is_offline": True}
if problem is None:
    rules = board_rules(job.get("rule_id") or "STAGE_1_STANDARD")
    state = {"turn_number": 1, "remaining_cards": {"ROCK": 3, "PAPER": 3, "SCISSORS": 3}, "history": [], "rules": rules, "my_side": "team_a"}
    started = time.time()
    try:
        out["test_move"] = run_bot(job["code"], state)
        out["execution_time_ms"] = int((time.time() - started) * 1000)
    except Exception as exc:
        out["is_valid"] = False
        out["error_message"] = "Lỗi khi chạy thử: " + str(exc)
json.dumps(out)`)
    } else {
      const [name, bossCode] = BOSSES[payload.boss] || BOSSES.RANDOM
      py.globals.set('boss_code', bossCode)
      result = py.runPython(`
import json
r = simulate_board(job["code"], boss_code, "PYTHON", "PYTHON", 1, job.get("rule_id") or "STAGE_1_STANDARD")
winner = r.get("winner_side")
json.dumps({"status": "SUCCESS", "is_offline": True, "winner": winner, "win_reason": r.get("win_reason"), "board_steps": r.get("board_steps", []),
            "final_red_alive": r.get("final_red_alive"), "final_blue_alive": r.get("final_blue_alive"), "bot_errors": r.get("bot_errors", {}),
            "boss_name": ${JSON.stringify(name)}, "rule_id": job.get("rule_id"), "result": "WIN" if winner == "team_a" else "LOSS"})`)
    }
    self.postMessage({ id, ok: true, result: JSON.parse(result) })
  } catch (error) {
    if (/Pyodide|engine offline|NetworkError|Failed to fetch/i.test(String(error && error.message ? error.message : error))) ready = null
    self.postMessage({ id, ok: false, error: String(error && error.message ? error.message : error).split('\n').slice(-3).join(' ') })
  }
}

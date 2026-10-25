"""Tiến trình sandbox cho đề học máy của Giải AI: gọi `solve(task)` một lần cho mỗi đề, dùng lại một tiến trình cho nhiều đề.

Khác GameProcess: điểm vào là `solve`, mỗi lần gọi có hạn giờ riêng (đủ để huấn luyện), kết quả (danh sách dự đoán) có thể dài tới 512 KB,
bộ nhớ 256 MB, và import được `nnlite` (thư viện mạng nơ-ron do BTC kiểm duyệt, nạp sẵn trước khi bật cách ly).
"""
import json
import os
import queue
import subprocess
import sys
import threading
import time

from app.sandbox.game_process import SandboxUnavailableError
from app.sandbox.python_isolation import CHILD_ISOLATION
from app.sandbox.runner import _validate_python_ast

NNLITE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "aitasks", "nnlite.py")
MAX_LINE = 512 * 1024

CHILD = CHILD_ISOLATION + r'''
import sys,json,builtins,random,math,types,importlib
try:
    import resource
    resource.setrlimit(resource.RLIMIT_AS,(256*1024*1024,256*1024*1024))
    resource.setrlimit(resource.RLIMIT_FSIZE,(1024*1024,1024*1024))
    resource.setrlimit(resource.RLIMIT_NOFILE,(32,32))
except ImportError:
    pass
modules={"random","math","collections","itertools","re","json","heapq","functools","typing","nnlite"}
module_views={}
def module_view(name):
    if name not in module_views:
        module=importlib.import_module(name)
        names=getattr(module,"__all__",[n for n in vars(module) if not n.startswith("_")])
        if name=="typing":names=("Any","Callable","Dict","List","Tuple","Set","FrozenSet","Optional","Union","Iterable","Iterator","Sequence","Mapping","MutableMapping","DefaultDict","Deque","NoReturn","Literal","Final","cast")
        if name=="functools":names=("reduce","partial","lru_cache","cache","cmp_to_key")
        exposed={n:getattr(module,n) for n in names if not n.startswith("_") and hasattr(module,n) and not isinstance(getattr(module,n),types.ModuleType)}
        view=types.SimpleNamespace(**exposed)
        view.__all__=tuple(exposed)
        module_views[name]=view
        if name=="collections":view.abc=module_view("collections.abc")
    return module_views[name]
def safe_import(name,globals=None,locals=None,fromlist=(),level=0):
    if level or (name not in modules and name!="collections.abc") or any(n.startswith("_") for n in (fromlist or ())): raise ImportError("Import module bị cấm")
    view=module_view(name)
    return module_view("collections") if name=="collections.abc" and not fromlist else view
safe={name:getattr(builtins,name) for name in ("range","len","min","max","abs","sum","int","float","str","bool","list","dict","set","tuple","sorted","reversed","enumerate","zip","next","iter","any","all","map","filter","isinstance","type","round","pow","divmod","ord","chr","repr","Exception","ValueError","ZeroDivisionError","IndexError","KeyError","TypeError","OverflowError","StopIteration")}
safe["__import__"]=safe_import
safe["print"]=lambda *a,**k:None
try:
    payload=json.loads(sys.stdin.readline())
    for module_name in modules-{"nnlite"}:module_view(module_name)
    # nnlite là mã tin cậy do BTC kiểm duyệt: nạp bằng builtins đầy đủ TRƯỚC khi bật cách ly; mã đội chỉ nhận các tên công khai của nó.
    ns={"__name__":"nnlite"}
    exec(compile(payload["nnlite"],"nnlite","exec"),ns)
    nn={k:v for k,v in ns.items() if not k.startswith("_") and not isinstance(v,types.ModuleType)}
    nn_view=types.SimpleNamespace(**nn);nn_view.__all__=tuple(nn)
    module_views["nnlite"]=nn_view
    try:
        if sys.platform.startswith("linux"):
            install_python_isolation()
        elif payload.get("strict"):
            raise RuntimeError("Production Python sandbox requires Linux")
    except BaseException:
        print(json.dumps({"error":"Python isolation unavailable; refusing unsafe execution.","isolation_error":True}),flush=True)
        sys.exit(0)
    compiled=compile(payload["code"],"<bot>","exec")
    print(json.dumps({"ready":True}),flush=True)
    for line in sys.stdin:
        try:
            task=json.loads(line)
            scope={"__name__":"__bot__","__doc__":None,"__builtins__":dict(safe),"random":module_view("random"),"math":module_view("math")}
            exec(compiled,scope,scope)
            fn=scope.get("solve")
            if not callable(fn): raise ValueError("Thiếu hàm solve(task)")
            out=fn(task)
            print(json.dumps({"out":out}),flush=True)
        except BaseException as exc:
            print(json.dumps({"error":str(exc)[:500]}),flush=True)
except BaseException as exc:
    print(json.dumps({"error":str(exc)[:500]}),flush=True)
'''


class TaskProcess:
    def __init__(self, code):
        self.process = None
        self.reader = None
        self.responses = queue.Queue(maxsize=2)
        self.error = _validate_python_ast(code)
        if self.error:
            return
        env = {k: v for k, v in os.environ.items() if k.upper() in {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP"}}
        env["PYTHONIOENCODING"] = "utf-8"
        try:
            with open(NNLITE_PATH, encoding="utf-8") as handle:
                nnlite = handle.read()
            self.process = subprocess.Popen([sys.executable, "-I", "-S", "-u", "-c", CHILD], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                            text=True, encoding="utf-8", errors="replace", env=env, close_fds=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            self.reader = threading.Thread(target=self._read, daemon=True)
            self.reader.start()
            self.process.stdin.write(json.dumps({"code": code, "nnlite": nnlite, "strict": os.getenv("ENVIRONMENT", "").lower() == "production"}) + "\n")
            self.process.stdin.flush()
            ready = self.responses.get(timeout=float(os.getenv("SANDBOX_READY_TIMEOUT", "15")))
            if ready.get("isolation_error"):
                raise SandboxUnavailableError(ready["error"])
            if not ready.get("ready"):
                self.error = ready.get("error", "Mô hình không khởi tạo được.")
                self.close()
        except SandboxUnavailableError:
            self.close()
            raise
        except (OSError, queue.Empty, subprocess.SubprocessError, RuntimeError) as exc:
            self.close()
            raise SandboxUnavailableError("Cannot initialize an isolated task process; retry after worker recovery.") from exc

    def _read(self):
        try:
            while True:
                line = self.process.stdout.readline(MAX_LINE + 1)
                if not line:
                    self.responses.put({"error": "Tiến trình mô hình đã dừng."}, timeout=1)
                    return
                if not line.endswith("\n") or len(line) > MAX_LINE:
                    self.responses.put({"error": "Kết quả vượt giới hạn 512 KB."}, timeout=1)
                    return
                self.responses.put(json.loads(line), timeout=1)
        except Exception:
            try:
                self.responses.put({"error": "Lỗi giao thức sandbox."}, timeout=0.1)
            except queue.Full:
                pass

    def solve(self, task, timeout):
        """Trả (kết quả, lỗi). Quá hạn thì giết tiến trình (đã mất trạng thái) và báo Time Limit Exceeded."""
        if self.error:
            return None, self.error
        try:
            self.process.stdin.write(json.dumps(task, separators=(",", ":")) + "\n")
            self.process.stdin.flush()
            result = self.responses.get(timeout=timeout)
            return result.get("out"), result.get("error")
        except queue.Empty:
            self.close()
            return None, f"Time Limit Exceeded ({timeout:.1f}s)."
        except Exception as exc:
            self.close()
            return None, f"Lỗi sandbox: {exc}"

    def close(self):
        if self.process:
            if self.process.poll() is None:
                self.process.kill()
            try:
                self.process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                pass
            for stream in (self.process.stdin, self.process.stdout):
                try:
                    stream.close()
                except (OSError, ValueError):
                    pass
        if self.reader and self.reader is not threading.current_thread():
            self.reader.join(timeout=1)

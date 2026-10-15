"""One isolated Python interpreter per bot/game, fresh user scope per action."""
import json
import os
import queue
import subprocess
import sys
import threading

from app.sandbox.runner import _validate_python_ast

CHILD = r'''
import sys,json,builtins,random,math
try:
    import resource
    # The parent enforces a one-second deadline for every decide() and kills
    # the process on timeout. A cumulative CPU cap would incorrectly forfeit
    # a long game even when every individual move meets that deadline.
    resource.setrlimit(resource.RLIMIT_AS,(160*1024*1024,160*1024*1024))
    resource.setrlimit(resource.RLIMIT_FSIZE,(1024*1024,1024*1024))
    resource.setrlimit(resource.RLIMIT_NOFILE,(32,32))
except ImportError:
    pass
modules={"random","math","collections","itertools","re","json","heapq","functools","typing"}
def safe_import(name,globals=None,locals=None,fromlist=(),level=0):
    if name.split(".")[0] not in modules: raise ImportError("Import module bi cam")
    return builtins.__import__(name,globals,locals,fromlist,level)
safe={name:getattr(builtins,name) for name in ("range","len","min","max","abs","sum","int","float","str","bool","list","dict","set","tuple","sorted","reversed","enumerate","zip","next","iter","any","all","map","filter","isinstance","type")}
safe["__import__"]=safe_import
safe["print"]=lambda *a,**k:None
try:
    source=json.loads(sys.stdin.readline())["code"]
    compiled=compile(source,"<bot>","exec")
    print(json.dumps({"ready":True}),flush=True)
    for line in sys.stdin:
        try:
            state=json.loads(line)
            scope={"__builtins__":dict(safe),"random":random,"math":math}
            exec(compiled,scope,scope)
            fn=scope.get("decide_move")
            if not callable(fn): raise ValueError("Thieu decide_move")
            move=fn(state)
            if not isinstance(move,str) or move.upper() not in ("ROCK","PAPER","SCISSORS"): raise ValueError("Nuoc di khong hop le")
            print(json.dumps({"move":move.upper()}),flush=True)
        except BaseException as exc:
            print(json.dumps({"error":str(exc)[:2000]}),flush=True)
except BaseException as exc:
    print(json.dumps({"error":str(exc)[:2000]}),flush=True)
'''


class GameProcess:
    def __init__(self, code, *, command=None, initial_payload=None):
        self.process = None
        self.reader = None
        self.responses = queue.Queue(maxsize=2)
        self.error = _validate_python_ast(code) if command is None else None
        if self.error:
            return
        environment = {k:v for k,v in os.environ.items() if k.upper() in {'PATH','SYSTEMROOT','WINDIR','TEMP','TMP'}}
        environment['PYTHONIOENCODING']='utf-8'
        try:
            self.process = subprocess.Popen(command or [sys.executable,'-I','-S','-u','-c',CHILD],
                stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,
                text=True,encoding='utf-8',errors='replace',env=environment,close_fds=True,
                creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            self.reader=threading.Thread(target=self._read,daemon=True)
            self.reader.start()
            self.process.stdin.write(json.dumps(initial_payload if initial_payload is not None else {'code':code})+'\n')
            self.process.stdin.flush()
            ready=self.responses.get(timeout=5)
            if not ready.get('ready'):
                self.error=ready.get('error','Bot không khởi tạo được.')
                self.close()
        except Exception as exc:
            self.error=f'Lỗi khởi tạo sandbox: {exc}'
            self.close()

    def _read(self):
        try:
            while True:
                line=self.process.stdout.readline(4096)
                if not line:
                    self.responses.put({'error':'Tiến trình bot đã dừng.'},timeout=1)
                    return
                if not line.endswith('\n'):
                    self.responses.put({'error':'Bot vượt giới hạn đầu ra.'},timeout=1)
                    return
                self.responses.put(json.loads(line),timeout=1)
        except Exception:
            try:self.responses.put({'error':'Lỗi giao thức sandbox.'},timeout=0.1)
            except queue.Full:pass

    def decide(self,state,timeout=1):
        if self.error:return None,self.error
        try:
            self.process.stdin.write(json.dumps(state)+'\n')
            self.process.stdin.flush()
            result=self.responses.get(timeout=timeout)
            return result.get('move'),result.get('error')
        except queue.Empty:
            self.close()
            return None,'Bot quá thời gian (1 giây/nước).'
        except Exception as exc:
            self.close()
            return None,f'Lỗi sandbox: {exc}'

    def close(self):
        if self.process:
            if self.process.poll() is None:
                self.process.kill()
            try:self.process.wait(timeout=2)
            except subprocess.TimeoutExpired:pass
            for stream in (self.process.stdin,self.process.stdout):
                try:stream.close()
                except (OSError,ValueError):pass
        if self.reader and self.reader is not threading.current_thread():
            self.reader.join(timeout=1)

"""C++17 compiled to WASI; production never executes submitted native binaries."""
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
from app.sandbox.game_process import GameProcess

COMPILER_SLOT=threading.BoundedSemaphore(1)


class WasiGameProcess(GameProcess):
    """Cache compiled WASM per game; every move creates a fresh isolated store."""
    def __init__(self,path):
        self.work=tempfile.TemporaryDirectory(prefix='arena-wasi-game-')
        super().__init__('',command=[sys.executable,'-I','-u',str(Path(__file__).with_name('cpp_wasi_child.py')),'--server'],
                         initial_payload={'module':path,'work':self.work.name})

    def close(self):
        super().close()
        self.work.cleanup()


def _run(command, timeout, **kwargs):
    process = subprocess.Popen(command, start_new_session=os.name == 'posix', **kwargs)
    try:
        return process.communicate(timeout=timeout), process.returncode
    except subprocess.TimeoutExpired:
        if os.name == 'posix':
            os.killpg(process.pid, signal.SIGKILL)
        else:
            process.kill()
        process.communicate()
        raise


def compile_wasi(source):
    compiler = os.environ.get('WASI_CXX', '/opt/wasi-sdk/bin/clang++')
    if not Path(compiler).is_file():
        return None, 'Máy chủ chưa cài bộ biên dịch C++ WASI.'
    if not COMPILER_SLOT.acquire(timeout=20):
        return None, 'Bộ biên dịch đang bận. Vui lòng nộp lại sau.'
    try:
        with tempfile.TemporaryDirectory(prefix='arena-cpp-') as work:
            root = Path(work)
            (root/'bot.cpp').write_text(source, encoding='utf-8')
            with (root/'compiler.log').open('wb') as log:
                _, status = _run([sys.executable, '-I', str(Path(__file__).with_name('cpp_compile_child.py')), work, compiler],
                                 15, stdout=log, stderr=log, cwd=work,
                                 env={'PATH':'/usr/bin:/bin', 'TMPDIR':work, 'LANG':'C.UTF-8'})
            if status:
                return None, 'Lỗi biên dịch C++: ' + (root/'compiler.log').read_text(errors='replace')[-3000:]
            with tempfile.NamedTemporaryFile(suffix='.wasm', delete=False) as output:
                result = output.name
            shutil.copyfile(root/'bot.wasm', result)
            return result, None
    except subprocess.TimeoutExpired:
        return None, 'Biên dịch C++ quá thời gian 15 giây.'
    except Exception as error:
        return None, f'Lỗi biên dịch C++: {error}'
    finally:
        COMPILER_SLOT.release()


def run_wasi(path, state, timeout):
    process = None
    try:
        # Use the same startup handshake as real matches: compiling the WASM
        # module is separate from the deadline for executing a bot move.
        process = WasiGameProcess(path)
        return process.decide(state, timeout=timeout)
    except Exception as error:
        return None, f'Lỗi sandbox C++: {error}'
    finally:
        if process is not None:
            process.close()

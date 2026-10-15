"""One bounded WASI invocation with no preopened directories or inherited secrets."""
import json
from pathlib import Path
import sys
import wasmtime


def load_module(path):
    config=wasmtime.Config()
    config.consume_fuel=True
    config.parallel_compilation=False
    config.memory_reservation=64*1024*1024
    config.memory_guard_size=0
    engine=wasmtime.Engine(config)
    return engine,wasmtime.Module.from_file(engine,path)


def run_module(engine,module,work):
    output=bytearray()
    overflow=False
    def collect(data):
        nonlocal overflow
        if len(output)+len(data)>4096:
            overflow=True
            return -1
        output.extend(data)
        return len(data)
    with wasmtime.Store(engine) as store:
        store.set_limits(memory_size=64*1024*1024,table_elements=10000,instances=1,memories=1)
        store.set_fuel(20_000_000)
        wasi=wasmtime.WasiConfig()
        wasi.argv=['bot']
        wasi.stdin_file=str(Path(work)/'state.json')
        wasi.stdout_custom=collect
        wasi.stderr_custom=lambda data: len(data)
        store.set_wasi(wasi)
        linker=wasmtime.Linker(engine)
        linker.define_wasi()
        instance=linker.instantiate(store,module)
        try:
            instance.exports(store)['_start'](store)
        except wasmtime.ExitTrap as error:
            if error.code!=0: raise
        if overflow: raise ValueError('Output vượt quá 4 KB.')
        move=output.decode('utf-8').strip().upper()
        if move not in ('ROCK','PAPER','SCISSORS'): raise ValueError('Chỉ in ROCK, PAPER hoặc SCISSORS ra STDOUT.')
        return move


if __name__=='__main__':
    try:
        if sys.argv[1:] == ['--server']:
            payload=json.loads(sys.stdin.readline())
            engine,module=load_module(payload['module'])
            work=payload['work']
            print(json.dumps({'ready':True}),flush=True)
            for line in sys.stdin:
                try:
                    state=json.loads(line)
                    (Path(work)/'state.json').write_text(json.dumps(state)+'\n',encoding='utf-8')
                    print(json.dumps({'move':run_module(engine,module,work)}),flush=True)
                except Exception as error:
                    print(json.dumps({'error':str(error)[-1500:]}),flush=True)
        else:
            path,work=sys.argv[1:]
            engine,module=load_module(path)
            print(json.dumps({'move':run_module(engine,module,work)}))
    except Exception as error: print(json.dumps({'error':str(error)[-1500:]}),flush=True)

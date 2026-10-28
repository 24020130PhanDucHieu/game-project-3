"""Controlled worker benchmark: synthetic games only, no persisted submissions.

Run on an idle worker host as root to read its token/cgroup. Requires explicit
--confirm-idle. Worker capacity must already be 2. Does not change configuration.
Stop scheduling if available memory <128 MiB, swap-out >16 MiB or OOM is observed.
"""
import argparse
import concurrent.futures
import json
import os
from pathlib import Path
import statistics
import subprocess
import threading
import time
import urllib.error
import urllib.request

CHOOSE = """
    cards = state.get('remaining_cards', {})
    moves = [k for k in ('ROCK','PAPER','SCISSORS') if cards.get(k,0)>0]
    return moves[state.get('ply_number',1)%len(moves)] if moves else 'ROCK'
"""
LIGHT = 'def decide_move(state):\n' + CHOOSE
COMPUTE = """def decide_move(state):
    value = 0
    for i in range(120000):
        value = (value + i*i) % 1000003
""" + CHOOSE
MEMORY = """def decide_move(state):
    workspace = list(range(1400000))
    value = workspace[-1]
""" + CHOOSE
CPP = '#include <stdio.h>\nint main(){puts("ROCK");return 0;}'
PROFILES = [('light', LIGHT, 'PYTHON'), ('compute', COMPUTE, 'PYTHON'),
            ('memory', MEMORY, 'PYTHON'), ('cpp', CPP, 'CPP')]


def process_env():
    pid = subprocess.check_output(['systemctl','show','arena-worker','--property=MainPID','--value'],text=True).strip()
    return dict(x.decode().split('=',1) for x in Path('/proc/'+pid+'/environ').read_bytes().split(b'\0') if b'=' in x)


def fields(path):
    return {line.split()[0].rstrip(':'): int(line.split()[1])
            for line in Path(path).read_text().splitlines() if len(line.split())>=2}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',required=True)
    parser.add_argument('--confirm-idle',action='store_true')
    parser.add_argument('--output',required=True)
    parser.add_argument('--repeats',type=int,default=3)
    parser.add_argument('--profile',choices=['mixed','memory'],default='mixed')
    args=parser.parse_args()
    if not args.confirm_idle: parser.error('--confirm-idle required')
    if not 1<=args.repeats<=4: parser.error('--repeats must be 1..4')
    env=process_env()
    if env.get('WORKER_CAPACITY')!='2': raise RuntimeError('Set capacity 2 before comparison')
    cg=Path('/sys/fs/cgroup')/subprocess.check_output(['systemctl','show','arena-worker','--property=ControlGroup','--value'],text=True).strip().lstrip('/')
    headers={'Content-Type':'application/json','X-Worker-Token':env.get('WORKER_TOKEN','')}
    stop=threading.Event()

    def game(task):
        name,code,language,seed=task
        if stop.is_set():return {'profile':name,'ok':False,'error':'guard-stopped','seconds':0}
        payload={'action':'qualifier-game','params':{'code_a':code,'code_b':code,'language_a':language,'language_b':language,'seed':seed,'first':1}}
        start=time.monotonic()
        try:
            request=urllib.request.Request(args.url+'/mutate-tournament',data=json.dumps(payload).encode(),headers=headers)
            with urllib.request.urlopen(request,timeout=90) as response: body=json.load(response)
            errors={k:v for k,v in body.get('bot_errors',{}).items() if v}
            ok=body.get('winner_side') in ('team_a','team_b') and not errors
            return {'profile':name,'ok':ok,'error':errors or None,'seconds':round(time.monotonic()-start,4),'winner':body.get('winner_side')}
        except Exception as exc:
            return {'profile':name,'ok':False,'error':type(exc).__name__,'seconds':round(time.monotonic()-start,4)}

    def run_phase(concurrency, phase):
        done=threading.Event(); samples=[]; probes=[]
        vm0=fields('/proc/vmstat');events0=fields(cg/'memory.events');cpu0=fields(cg/'cpu.stat')
        def sample():
            while not done.is_set():
                mem=fields('/proc/meminfo');vm=fields('/proc/vmstat');events=fields(cg/'memory.events')
                row={'worker_mib':int((cg/'memory.current').read_text())/1048576,
                     'available_mib':mem['MemAvailable']/1024,
                     'swap_out_mib':(vm['pswpout']-vm0['pswpout'])*os.sysconf('SC_PAGE_SIZE')/1048576,
                     'oom_delta':events.get('oom_kill',0)-events0.get('oom_kill',0)}
                samples.append(row)
                if row['available_mib']<128 or row['swap_out_mib']>16 or row['oom_delta']>0:stop.set()
                done.wait(.15)
        def probe():
            while not done.is_set():
                start=time.monotonic()
                try:
                    with urllib.request.urlopen('https://arena.13.250.49.111.sslip.io/ready',timeout=3) as r:
                        r.read();probes.append((r.status,round((time.monotonic()-start)*1000)))
                except Exception:probes.append((0,3000))
                done.wait(1)
        sampler=threading.Thread(target=sample);health=threading.Thread(target=probe)
        sampler.start();health.start()
        profiles=PROFILES if args.profile=='mixed' else [p for p in PROFILES if p[0]=='memory']
        tasks=[(name,code,language,f'capacity-fixture-{i}') for i in range(args.repeats) for name,code,language in profiles]
        start=time.monotonic()
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
                results=list(executor.map(game,tasks))
        finally:done.set();sampler.join();health.join()
        elapsed=time.monotonic()-start
        cpu1=fields(cg/'cpu.stat')
        report={'phase':phase,'profile':args.profile,'concurrency':concurrency,'jobs':len(tasks),'elapsed_s':round(elapsed,3),
                'jobs_per_minute':round(len(tasks)*60/elapsed,2),'errors':sum(not r['ok'] for r in results),
                'peak_worker_mib':round(max(s['worker_mib'] for s in samples),1),
                'min_available_mib':round(min(s['available_mib'] for s in samples),1),
                'swap_out_mib':round(max(s['swap_out_mib'] for s in samples),2),
                'oom_kills':max(s['oom_delta'] for s in samples),
                'worker_cpu_seconds':round((cpu1['usage_usec']-cpu0['usage_usec'])/1e6,3),
                'api_probes':len(probes),'api_errors':sum(code!=200 for code,ms in probes),
                'api_max_ms':max((ms for code,ms in probes),default=None),
                'guard_stopped':stop.is_set(),'results':results}
        print(json.dumps(report),flush=True)
        return report

    for name,code,language in PROFILES:
        warmup=game((name,code,language,'capacity-fixture-warmup'))
        if not warmup['ok']:raise RuntimeError('Warmup failed')
    reports=[]
    # ABBA reduces warmup/order bias without changing the running service.
    for phase,concurrency in enumerate([1,2,2,1],1):
        reports.append(run_phase(concurrency,phase))
        Path(args.output).write_text(json.dumps(reports,indent=2))
        if stop.is_set():break
        time.sleep(2)
    if any(r['errors'] or r['guard_stopped'] for r in reports):raise SystemExit(2)


if __name__=='__main__':main()

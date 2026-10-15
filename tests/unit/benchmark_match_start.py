"""Compare isolated-per-turn and reusable-per-game Python execution, same seed."""
import statistics
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'bot-runner'))
from app.engine.board import simulate_board

code = "def decide_move(s):\n    return next(m for m,n in s['remaining_cards'].items() if n > 0)"
results = {}
for reuse in (False, True):
    times = []
    for _ in range(3):
        start = time.perf_counter()
        result = simulate_board(code, code, tie_seed='performance-fixture', reuse_sandbox=reuse)
        times.append(time.perf_counter()-start)
        assert not any(result['bot_errors'].values()), result['bot_errors']
        if False in results:
            assert result == results[False][1], 'Optimization changed game outcome/steps'
    results[reuse] = (statistics.median(times), result)
    print(f'reuse={reuse}: median={statistics.median(times):.3f}s steps={len(result["board_steps"])}', flush=True)
print(f'Speedup: {results[False][0]/results[True][0]:.2f}x', flush=True)

import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'bot-runner'))
from app.aicup import opponents as ops
from app.aicup import hidden  # noqa: F401  (đăng ký các nhóm ẩn)
from app.aicup.suite import run_suite, play_duel, Session, run_public_check, build_dataset

RANDOM = "import random\ndef decide_move(s):\n    return random.choice(['ROCK','PAPER','SCISSORS'])\n"
MARKOV = """import random
BEAT={'ROCK':'PAPER','PAPER':'SCISSORS','SCISSORS':'ROCK'}
def decide_move(s):
    h=s.get('history',[])
    if len(h)<4: return random.choice(['ROCK','PAPER','SCISSORS'])
    opp=[e['opponent_move'] for e in h]; me=[e['my_move'] for e in h]
    table={}
    for i in range(1,len(h)):
        table.setdefault((opp[i-1],me[i-1]),{}).setdefault(opp[i],0)
        table[(opp[i-1],me[i-1])][opp[i]]+=1
    c=table.get((opp[-1],me[-1]))
    if not c:
        c={}
        for m in opp: c[m]=c.get(m,0)+1
    return BEAT[max(c,key=lambda m:c[m])]
"""
FAST = dict(total=60, instances=1, board_games=0)
CYCLER = "def decide_move(s):\n    return ['ROCK','PAPER','SCISSORS'][len(s['history']) % 3]\n"


class OpponentTests(unittest.TestCase):
    def test_opponents_are_reproducible_from_seed(self):
        for kind in ops.FAMILIES:
            a, b = ops.make(kind, ops.derive('s', kind, 0), 80), ops.make(kind, ops.derive('s', kind, 0), 80)
            own_a, own_b, bot = [], [], []
            for t in range(80):
                own_a.append(a.play(own_a, bot)); own_b.append(b.play(own_b, bot)); bot.append(t % 3)
            self.assertEqual(own_a, own_b, kind)

    def test_different_seeds_give_different_parameters(self):
        patterns = {ops.make('cycle', ops.derive('x', i), 50).describe()['pattern'] for i in range(20)}
        self.assertGreater(len(patterns), 3)

    def test_cycle_is_exploitable_and_has_period(self):
        o = ops.make('cycle', 7, 60)
        moves = []
        for _ in range(60):
            moves.append(o.play(moves, []))
        n = len(o.pattern)
        self.assertEqual(moves[:n], moves[n:2 * n])


class SuiteTests(unittest.TestCase):
    def test_random_bot_scores_near_half(self):
        r = run_suite(RANDOM, 'sec', 1, 1, total=150, instances=2, board_games=0)
        self.assertTrue(44 < r['public_score'] < 56, r['public_score'])
        self.assertTrue(44 < r['reading_score'] < 56, r['reading_score'])

    def test_learning_bot_beats_random_on_both_splits(self):
        r = run_suite(MARKOV, 'sec', 1, 1, total=150, instances=2, board_games=0)
        base = run_suite(RANDOM, 'sec', 1, 1, total=150, instances=2, board_games=0)
        self.assertGreater(r['public_score'], base['public_score'] + 10)
        self.assertGreater(r['reading_score'], base['reading_score'] + 10)

    def test_same_bot_same_seed_is_reproducible(self):
        code = "def decide_move(s):\n    return ['ROCK','PAPER','SCISSORS'][len(s['history']) % 3]\n"
        self.assertEqual(run_suite(code, 'a', 2, 3, **FAST)['families_private'], run_suite(code, 'a', 2, 3, **FAST)['families_private'])

    def test_hidden_seed_changes_private_but_not_public(self):
        code = "def decide_move(s):\n    return ['ROCK','PAPER','SCISSORS'][len(s['history']) % 3]\n"
        a, b = run_suite(code, 'a', 9, 1, **FAST), run_suite(code, 'a', 9, 2, **FAST)
        self.assertEqual(a['families_public'], b['families_public'])
        self.assertNotEqual(a['families_private'], b['families_private'])

    def test_broken_bots_score_zero_and_do_not_crash(self):
        for code in ("def decide_move(s):\n    return 'NOPE'\n", "def decide_move(s):\n    raise ValueError('x')\n", "import os\ndef decide_move(s): return 'ROCK'\n"):
            r = run_suite(code, 'a', 1, 1, **FAST)
            self.assertEqual(r['public_score'], 0.0)
            self.assertTrue(r.get('error') or r['errors'])

    def test_slow_bot_loses_match_and_next_match_recovers(self):
        slow = "def decide_move(s):\n    if len(s['history'])==3:\n        while True: pass\n    return 'ROCK'\n"
        s = Session(slow)
        try:
            op = ops.make('bias', 1, 20)
            score, error = play_duel(s, op, 20, 0.2, 10 ** 12)
            self.assertEqual(score, 0.0)
            self.assertIn('Time Limit', error)
            self.assertIsNone(s.init_error)
            _, again = s.decide({'history': [], 'remaining_cards': {}}, 1.0)
            self.assertIsNone(again)
        finally:
            s.close()

    def test_board_part_reports_bosses(self):
        r = run_suite(MARKOV, 'sec', 1, 1, total=40, instances=1, board_games=3)
        self.assertEqual(r['board']['games'], 3)
        self.assertEqual(set(r['board']['bosses']), {'RANDOM', 'AGGRESSIVE', 'ADAPTIVE'})


class OfflineAndDatasetTests(unittest.TestCase):
    def test_public_check_matches_server_public_score(self):
        code = CYCLER

        def run(source, state):
            ns = {}
            exec(source, ns)
            return ns['decide_move'](state), None
        local = run_public_check(code, 77, run, total=60, instances=2)
        server = run_suite(code, 'x', 77, 1, total=60, instances=2, board_games=0)
        self.assertEqual(local['families_public'], server['families_public'])
        self.assertEqual(local['public_score'], server['public_score'])

    def test_public_module_does_not_contain_hidden_families(self):
        import subprocess
        out = subprocess.run([sys.executable, '-I', '-c', "import sys; sys.path.insert(0, %r); from app.aicup import suite, opponents; print(sorted(opponents.FAMILIES))" % str(Path(__file__).resolve().parents[2] / 'bot-runner')], capture_output=True, text=True)
        self.assertEqual(out.stdout.strip(), "['beat_last', 'bias', 'cycle', 'markov1']", out.stderr)

    def test_dataset_is_deterministic_and_has_no_scoring_instances(self):
        a, b = build_dataset('pub-1', 3, 40), build_dataset('pub-1', 3, 40)
        self.assertEqual(a, b)
        self.assertEqual([f['kind'] for f in a['families']], list(ops.PUBLIC_KINDS))
        self.assertTrue(all(len(m['bot']) == 40 == len(m['opponent']) for f in a['families'] for m in f['matches']))
        # Bộ dữ liệu dùng hạt giống riêng: đối thủ trong dữ liệu khác đối thủ được chấm điểm.
        scored = ops.make('cycle', ops.derive('pub-1', 'cycle', 0), 40).describe()['pattern']
        trained = [m['opponent'] for f in a['families'] if f['kind'] == 'cycle' for m in f['matches']]
        self.assertFalse(any(t.startswith(scored) for t in trained))


if __name__ == '__main__':
    unittest.main()

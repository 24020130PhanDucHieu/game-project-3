import copy
import json
import math
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'bot-runner'))
from app.aitasks import catalog, data as D, metrics as M, nnlite, policies, roll, runner, templates as T
from app.aitasks.probe import probe
from app.aitasks.reference import REFERENCE_CODE
from app.engine.board import simulate_board


def item_of(entry_id, seed='unit:1'):
    entry = next(e for e in catalog.builtin_entries() if e['id'] == entry_id)
    return {'entry_id': entry['id'], 'name': entry['name'], 'template': entry['template'], 'difficulty': entry['difficulty'], 'seed': seed,
            'params': copy.deepcopy(entry['params']), 'statement': '', 'tags': [], 'n': 0}


class NnliteTests(unittest.TestCase):
    def test_backward_matches_numeric_gradient(self):
        rng = random.Random(1)
        net = nnlite.MLP([4, 5, 3], activation='tanh', seed=3)
        x, label = [rng.gauss(0, 1) for _ in range(4)], 2
        net.zero_grad()
        _, grad = nnlite.cross_entropy(net.forward(x), label)
        net.backward(grad)
        worst = 0.0
        for layer in net.layers:
            for j in range(len(layer.W)):
                for k in range(len(layer.W[j])):
                    old, h = layer.W[j][k], 1e-5
                    layer.W[j][k] = old + h
                    up = nnlite.cross_entropy(net.forward(x), label)[0]
                    layer.W[j][k] = old - h
                    down = nnlite.cross_entropy(net.forward(x), label)[0]
                    layer.W[j][k] = old
                    worst = max(worst, abs((up - down) / (2 * h) - layer.gW[j][k]))
        self.assertLess(worst, 1e-6)

    def test_regression_gradient_and_xor_training(self):
        net = nnlite.MLP([2, 8, 2], activation='tanh', seed=1)
        X, y = [[0, 0], [0, 1], [1, 0], [1, 1]] * 20, [0, 1, 1, 0] * 20
        history = net.fit(X, y, epochs=80, lr=0.05, batch=8)
        self.assertLess(history[-1], history[0] / 10)
        self.assertEqual(net.predict(X), y)
        reg = nnlite.MLP([1, 8, 1], task='reg', activation='tanh', seed=2)
        xs = [[v / 10] for v in range(-10, 11)]
        reg.fit(xs, [math.sin(2 * v[0]) for v in xs], epochs=150, lr=0.02, batch=4)
        err = sum(abs(p - math.sin(2 * v[0])) for p, v in zip(reg.predict(xs), xs)) / len(xs)
        self.assertLess(err, 0.15)

    def test_weights_round_trip_and_determinism(self):
        X = [[random.Random(i).gauss(0, 1) for _ in range(3)] for i in range(30)]
        y = [i % 2 for i in range(30)]
        a, b = nnlite.MLP([3, 4, 2], seed=5), nnlite.MLP([3, 4, 2], seed=5)
        a.fit(X, y, epochs=3, seed=1)
        b.fit(X, y, epochs=3, seed=1)
        self.assertEqual(a.export_weights(), b.export_weights())
        c = nnlite.MLP([3, 4, 2], seed=9)
        c.load_weights(a.export_weights())
        self.assertEqual(c.predict(X), a.predict(X))
        with self.assertRaises(ValueError):
            nnlite.MLP([3, 5, 2]).load_weights(a.export_weights())

    def test_time_limit_stops_training(self):
        X = [[random.Random(i).gauss(0, 1) for _ in range(40)] for i in range(300)]
        net = nnlite.MLP([40, 16, 2], seed=0)
        history = net.fit(X, [i % 2 for i in range(300)], epochs=10000, time_limit=0.3)
        self.assertLess(len(history), 10000)


class EngineAndDataTests(unittest.TestCase):
    def test_policy_path_matches_sandbox_path(self):
        code = "def decide_move(state):\n    return ['ROCK','PAPER','SCISSORS'][state['turn_number'] % 3]\n"
        fn = lambda state: ['ROCK', 'PAPER', 'SCISSORS'][state['turn_number'] % 3]
        seen = []
        a = simulate_board(code, code, tie_seed='eq', reuse_sandbox=True, record_replay=False)
        b = simulate_board('', '', tie_seed='eq', policies={'team_a': fn, 'team_b': fn}, record_replay=False, trace=lambda e: seen.append(e['ply']))
        self.assertEqual((a['winner_side'], a['final_red_alive'], a['final_blue_alive'], a['win_reason']), (b['winner_side'], b['final_red_alive'], b['final_blue_alive'], b['win_reason']))
        self.assertTrue(seen)

    def test_every_template_is_deterministic_and_compact(self):
        for name in T.TEMPLATES:
            params = dict(T.DEFAULTS)
            one, two = T.build_dataset(name, params, 's', 60), T.build_dataset(name, params, 's', 60)
            self.assertEqual(one, two, name)
            self.assertEqual(len(one['X']), 60)
            self.assertLess(len(json.dumps(one)) / 60, 260, name)
            self.assertNotEqual(T.build_dataset(name, params, 's2', 60), one, name)

    def test_encoding_hides_enemy_types_under_fog(self):
        fog = T.build_dataset('winner', dict(T.DEFAULTS, rule_id='COMBO_4'), 'f', 40)['X']
        self.assertTrue(all(s['e'] is None and s['g'] == '' and not any(ch in 'rpsj' for ch in s['b']) for s in fog))
        clear = T.build_dataset('winner', dict(T.DEFAULTS), 'c', 40)['X']
        self.assertTrue(all(s['e'] is not None and '?' not in s['b'] for s in clear))
        self.assertTrue(all(len(s['b']) == 81 for s in fog + clear))

    def test_labels_are_balanced_where_promised(self):
        capture = T.build_dataset('capture_next', dict(T.DEFAULTS), 'k', 200)['y']
        self.assertTrue(abs(sum(capture) - 100) <= 12)
        nextcard = T.build_dataset('nextcard', dict(T.DEFAULTS, target='aggressive', noise=0.0), 'n', 200)
        # chính sách hiếu chiến chọn lá theo lượt: nhãn suy ra được từ t
        by_turn = {}
        for s, y in zip(nextcard['X'], nextcard['y']):
            by_turn.setdefault(s['t'] <= 3, set()).add(y)
        self.assertEqual(by_turn.get(True, {0}), {0})

    def test_test_labels_do_not_come_from_public_seed(self):
        item = item_of('winner-standard')
        train, pub = D.train_set(item), D.public_set(item)
        self.assertNotEqual(train['X'][:5], pub['X'][:5])
        self.assertNotEqual(D.private_set(item, 1)['X'][:5], D.private_set(item, 2)['X'][:5])
        before = D.secret()
        self.assertEqual(D.hmac_seed('a', 1), D.hmac_seed('a', 1))
        self.assertNotEqual(D.hmac_seed('a', 1), D.hmac_seed('a', 2))
        self.assertEqual(before, D.secret())
        self.assertNotIn('seed', json.dumps(D.team_view(item)))

    def test_cache_stays_bounded(self):
        for i in range(D.CACHE_ITEMS + 6):
            D.train_set(item_of('winner-standard', f'cache:{i}'))
        self.assertLessEqual(len(D._cache), D.CACHE_ITEMS)


class FakeSession:
    def __init__(self, fn):
        self.fn, self.init_error = fn, None

    def solve(self, task, timeout):
        return self.fn(task), None


class GradingTests(unittest.TestCase):
    def test_predictions_map_back_to_original_samples_despite_shuffle(self):
        item = item_of('winner-standard')
        task, pub_y, priv_y, order = D.build_for_grading(item, 1)
        self.assertGreater(len(set(k for k, _ in order[:30])), 1)  # đầu vào đã trộn công khai/riêng tư
        truth = [(pub_y if kind == 'pub' else priv_y)[i] for kind, i in order]
        result = runner.grade_item(FakeSession(lambda t: truth), item, 1, 5)
        self.assertEqual((result['public'], result['private'], result['error']), (100.0, 100.0, None))
        flipped = runner.grade_item(FakeSession(lambda t: [1 - v for v in truth]), item, 1, 5)
        self.assertEqual((flipped['public'], flipped['private']), (0.0, 0.0))

    def test_bad_outputs_score_zero_with_reason(self):
        item = item_of('winner-standard')
        for out, text in ((lambda t: [0], 'đúng'), (lambda t: 'abc', 'danh sách'), (lambda t: [7] * len(t['test']['X']), 'lớp'), (lambda t: [float('nan')] * len(t['test']['X']), 'hữu hạn')):
            r = runner.grade_item(FakeSession(out), item, 1, 5)
            self.assertEqual((r['public'], r['private']), (0.0, 0.0))
            self.assertIn(text, r['error'])

    def test_reference_beats_naive_on_learnable_tasks(self):
        for entry_id in ('nextcard-aggressive', 'nextcard-counter', 'capture-standard', 'material-standard', 'winner-standard'):
            item = item_of(entry_id)
            ref = runner.run_items(REFERENCE_CODE, [item], 1)
            self.assertEqual(ref['errors'], [], entry_id)
            meta, ytr = T.TEMPLATES[item['template']], D.train_set(item)['y']
            pub = D.public_set(item)['y']
            naive = M.score(meta['metric'], pub, [max(set(ytr), key=ytr.count)] * len(pub)) if meta['kind'] == 'class' else 0.0
            self.assertGreater(ref['private_score'], naive + 10, (entry_id, ref['private_score'], naive))

    def test_sandbox_rejects_bad_code_and_times_out_per_task(self):
        item = item_of('winner-standard')
        self.assertIn('Import', runner.run_items('import os\ndef solve(task): return []', [item], 1)['errors'][0])
        slow = runner.run_items('def solve(task):\n    while True: pass\n', [dict(item, params=dict(item['params'], time_s=2))] * 2, 1, budget=20)
        self.assertEqual([t['private'] for t in slow['tasks']], [0.0, 0.0])
        self.assertTrue(all('Time Limit' in t['error'] for t in slow['tasks']))  # tiến trình được dựng lại cho đề sau
        self.assertEqual(runner.run_items('def solve(task):\n    return 1/0\n', [item], 1)['tasks'][0]['public'], 0.0)
        self.assertIn('Thiếu hàm solve', runner.run_items('x = 1', [item], 1)['errors'][0])
        self.assertIn('Import', runner.run_items('import socket\ndef solve(task): return []', [item], 1)['errors'][0])

    def test_nnlite_importable_but_internals_are_not(self):
        item = item_of('winner-standard')
        ok = runner.run_items('import nnlite\ndef solve(task):\n    net = nnlite.MLP([2, 2, 2])\n    return [0] * len(task["test"]["X"])\n', [item], 1)
        self.assertEqual(ok['errors'], [])
        evil = runner.run_items('import nnlite\ndef solve(task):\n    return [nnlite.MLP.__init__.__globals__] \n', [item], 1)
        self.assertTrue(evil['errors'] or evil.get('error'))

    def test_validate_code(self):
        item = item_of('capture-standard')
        self.assertTrue(runner.validate_code(REFERENCE_CODE, item)['is_valid'])
        self.assertFalse(runner.validate_code('def solve(task): return [0]', item)['is_valid'])
        self.assertFalse(runner.validate_code('def decide_move(s): return "ROCK"', item)['is_valid'])

    def test_duel_picks_higher_private_score_and_runs_both(self):
        item = item_of('capture-standard')
        result = runner.duel(REFERENCE_CODE, 'def solve(task):\n    return [0] * len(task["test"]["X"])\n', item, 1)
        self.assertEqual(result['winner'], 'team_a')
        self.assertGreater(result['scores']['team_a'], result['scores']['team_b'])
        broken = runner.duel('def solve(task): return 5', 'def solve(task):\n    return [0] * len(task["test"]["X"])\n', item, 1)
        self.assertEqual(broken['winner'], 'team_b')
        self.assertTrue(broken['errors']['team_a'])


class BankTests(unittest.TestCase):
    def test_builtin_entries_are_valid_and_cover_every_template(self):
        entries = catalog.builtin_entries()
        self.assertGreaterEqual(len(entries), 12)
        self.assertEqual({e['template'] for e in entries}, set(T.TEMPLATES))
        self.assertEqual(len({e['id'] for e in entries}), len(entries))

    def test_custom_entries_are_validated_and_capped(self):
        good = {'id': 'my-task', 'name': 'Đề của tôi', 'template': 'winner', 'params': {'rule_id': 'COMBO_4', 'n_train': 300, 'mix': ['random', 'counter']}, 'difficulty': 2}
        entry, errors = catalog.normalize_entry(good)
        self.assertEqual(errors, [])
        self.assertEqual(entry['params']['mix'], ['random', 'counter'])
        for bad in ({'template': 'eval'}, {'params': {'n_train': 99999}}, {'params': {'rule_id': 'ls -la'}}, {'params': {'mix': ['hack']}}, {'params': {'time_s': 600}}, {'id': 'X'}, {'name': 'a'}, {'params': {'noise': 0.9}}):
            _, errs = catalog.normalize_entry(dict(good, **bad) if 'params' not in bad else dict(good, params=dict(good['params'], **bad['params'])))
            self.assertTrue(errs, bad)

    def test_roll_is_deterministic_diverse_and_respects_filters(self):
        entries = catalog.builtin_entries()
        a, b = roll.roll(entries, 6, 'seed-1'), roll.roll(entries, 6, 'seed-1')
        self.assertEqual(a, b)
        self.assertNotEqual([x['seed'] for x in a], [x['seed'] for x in roll.roll(entries, 6, 'seed-2')])
        self.assertGreaterEqual(len({x['template'] for x in a}), 4)
        self.assertEqual([x['difficulty'] for x in a], sorted(x['difficulty'] for x in a))
        only = roll.roll(entries, 3, 's', tags=['luật'])
        self.assertTrue(all('luật' in x['tags'] for x in only))
        disabled = catalog.all_entries(None, ['winner-standard'])
        self.assertTrue(all(x['entry_id'] != 'winner-standard' for x in roll.roll(disabled, 12, 'z')))
        with self.assertRaises(ValueError):
            roll.roll(entries, 2, 's', tags=['không-có'])

    def test_public_plan_never_contains_seeds(self):
        plan = roll.roll(catalog.builtin_entries(), 5, 'secret-seed')
        public = json.dumps(roll.public_plan(plan), ensure_ascii=False)
        for item in plan:
            self.assertNotIn(item['seed'], public)
        self.assertNotIn('seed', public)
        self.assertIn('solve(task)', public)

    def test_normalize_item_blocks_oversized_params(self):
        plan = roll.roll(catalog.builtin_entries(), 1, 'x')[0]
        plan['params']['n_train'] = 10 ** 6
        with self.assertRaises(ValueError):
            catalog.normalize_item(plan)

    def test_probe_reports_speed_size_and_scores(self):
        result = probe(dict(catalog.builtin_entries()[10], id='probe-test'))
        self.assertTrue(result['ok'])
        self.assertLess(result['gen_ms'], 6000)
        self.assertLess(result['size_kb'], 450)
        self.assertGreater(result['reference']['private'], result['naive'] + 10)
        bad = probe({'id': 'nope', 'name': 'x', 'template': 'winner'})
        self.assertFalse(bad['ok'])


class TemplateFilesTests(unittest.TestCase):
    def test_frontend_templates_are_in_sync_with_python(self):
        import importlib.util
        root = Path(__file__).resolve().parents[2]
        spec = importlib.util.spec_from_file_location('gen_task_templates', root / 'scripts' / 'gen_task_templates.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        on_disk = module.TARGET.read_text(encoding='utf-8').replace(chr(13) + chr(10), chr(10))
        self.assertEqual(on_disk, module.render(), 'Chạy lại: python scripts/gen_task_templates.py')

    def test_sample_templates_run_in_sandbox_and_beat_naive_where_expected(self):
        from app.aitasks.reference import NAIVE_CODE, SCRATCH_CODE
        item = item_of('capture-standard')
        scratch, naive = runner.run_items(SCRATCH_CODE, [item], 1), runner.run_items(NAIVE_CODE, [item], 1)
        self.assertEqual(scratch['errors'] + naive['errors'], [])
        self.assertGreater(scratch['private_score'], naive['private_score'] + 15)

    def test_task_check_in_browser_matches_server_scoring_path(self):
        from app.aitasks import taskcheck
        item = item_of('capture-standard')
        view = D.team_view(item)

        def run(code, task):
            import types
            sys.modules['nnlite'] = nnlite
            scope = {}
            exec(code, scope)
            return scope['solve'](task)
        result = taskcheck.check(REFERENCE_CODE, view, run)
        self.assertIsNone(result['error'])
        self.assertGreater(result['score'], 80)
        self.assertEqual(result['n_val'] + result['n_train'], len(view['train']['X']))
        bad = taskcheck.check('def solve(task): return [0]', view, lambda code, task: [0])
        self.assertIn('đúng', bad['error'])

    def test_public_spec_has_plain_language_fields_for_every_builtin(self):
        from app.aitasks import catalog
        for entry in catalog.builtin_entries():
            spec = catalog.public_spec(dict(entry, entry_id=entry['id']), 1)
            self.assertTrue(spec['plain'] and spec['metric_plain'] and spec['label_help'], entry['id'])
            self.assertNotIn('{', spec['plain'] + spec['metric_plain'] + ''.join(spec['label_help']), 'còn chỗ trống chưa điền: ' + entry['id'])
            self.assertNotIn('counter', spec['plain'])
            self.assertEqual(spec['chance'], 0.0 if spec['kind'] == 'reg' else round(100.0 / len(spec['classes']), 1))
            self.assertIn('statement', spec)  # giữ tương thích với bản cũ

    def test_diverged_regression_does_not_crash_grading(self):
        from app.aitasks import metrics
        preds, problem = metrics.clean_predictions('reg', [1e300, -1e300, 5.0], 3)
        self.assertIsNone(problem)
        self.assertEqual(metrics.score('r2', [1.0, 2.0, 3.0], preds), 0.0)
        self.assertEqual(metrics.score('r2', [1.0, 2.0, 3.0], [1e308, -1e308, 1e308]), 0.0)

    def test_task_check_returns_visual_data_and_progress(self):
        from app.aitasks import taskcheck
        item = item_of('capture-standard')
        view = D.team_view(item)
        seen = []

        def run(code, task):
            sys.modules['nnlite'] = nnlite
            scope = {}
            exec(code, scope)
            return scope['solve'](task)
        result = taskcheck.check(REFERENCE_CODE, view, run, progress=lambda epoch, loss: seen.append((epoch, loss)))
        n_val = result['n_val']
        self.assertEqual(len(result['val_idx']), n_val)
        self.assertEqual(len(result['y_true']), n_val)
        self.assertEqual(len(result['preds']), n_val)
        self.assertEqual(result['y_true'], [view['train']['y'][i] for i in result['val_idx']])
        self.assertGreater(len(result['fit_log']), 1)
        self.assertLess(result['fit_log'][-1], result['fit_log'][0], 'mất mát phải giảm khi huấn luyện')
        self.assertTrue(seen, 'phải có tin tiến độ trong lúc huấn luyện')
        self.assertIsNone(nnlite.PROGRESS[0], 'móc tiến độ phải được gỡ sau khi chấm')
        plain = taskcheck.check('def solve(task): return [0] * len(task["test"]["X"])', view, lambda code, task: [0] * len(task['test']['X']))
        self.assertEqual(plain['fit_log'], [])


if __name__ == '__main__':
    unittest.main()

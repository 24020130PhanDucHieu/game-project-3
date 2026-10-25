import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'bot-runner'))
import main as worker
from app.aitasks import catalog
from app.aitasks.reference import NAIVE_CODE, REFERENCE_CODE


def plan_item(entry_id, n, seed):
    entry = next(e for e in catalog.builtin_entries() if e['id'] == entry_id)
    item = {'entry_id': entry['id'], 'name': entry['name'], 'template': entry['template'], 'difficulty': entry['difficulty'], 'seed': seed,
            'params': copy.deepcopy(entry['params']), 'statement': '', 'tags': [], 'n': n}
    item['params'].update(n_train=250, n_public=60, n_private=200, time_s=6)
    return item


def make_tournament(locked=True):
    db = worker.StatelessDatabase()
    tourn = db.create_tournament('Giải chính AI thử', 4)
    tid = tourn['tournament_id']
    tourn['track'], tourn['round_mode'] = 'AI', 'TASK'
    for i in range(4):
        db.add_team_to_tournament(tid, f'Đội {i}', f'S{i}', 'x')
    db.auto_schedule_tournament(tid)
    entries = ['capture-standard', 'nextcard-aggressive', 'capture-reverse', 'nextcard-counter', 'capture-standard']
    levels = {str(level): [{'item': plan_item(entries[n], n, f'L{level}-{n}')} for n in range(5)] for level in (1, 2)}
    tourn['ai_task_plan'] = {'locked': locked, 'levels': levels}
    return db, tid, tourn


def first_match(tourn):
    mid = next(k for k, m in sorted(tourn['matches'].items()) if int(m['round_level']) == 1 and m.get('team_a') and m.get('team_b'))
    for side in ('team_a', 'team_b'):
        tourn['matches'][mid][side]['authenticated'] = True
    return mid


class TaskRoundTests(unittest.TestCase):
    def test_bo5_task_match_is_won_by_the_better_model_and_record_has_no_board(self):
        db, tid, tourn = make_tournament()
        mid = first_match(tourn)
        match = tourn['matches'][mid]
        good, bad = db.update_match_code(tid, mid, 'team_a', REFERENCE_CODE, 'PYTHON'), db.update_match_code(tid, mid, 'team_b', NAIVE_CODE, 'PYTHON')
        self.assertTrue(good['is_valid'] and bad['is_valid'], (good['validation'], bad['validation']))
        self.assertEqual(match['round_status'], 'READY_FOR_BATTLE')
        while match['status'] != 'COMPLETED':
            result = db.play_match_round(tid, mid)
            record = result['round_record']
            self.assertEqual(record['round_kind'], 'TASK')
            self.assertEqual(record['board_steps'], [])
            self.assertIn(record['winner'], ('team_a', 'team_b'))
            self.assertNotIn('seed', str(record['task']).lower().replace('tie_break_seed', ''))
            self.assertEqual(set(record['scores']), {'team_a', 'team_b'})
            if match['status'] != 'COMPLETED':
                db.advance_to_next_round(tid, mid)
                db.update_match_code(tid, mid, 'team_a', REFERENCE_CODE, 'PYTHON')
                db.update_match_code(tid, mid, 'team_b', NAIVE_CODE, 'PYTHON')
        self.assertEqual(match['winner'], 'team_a')
        self.assertGreaterEqual(match['team_a']['rounds_won'], 3)
        self.assertEqual(len(match['rounds_history']), match['team_a']['rounds_won'] + match['team_b']['rounds_won'])
        advanced = tourn['matches'][match['next_match_id']][match['next_slot']]
        self.assertEqual(advanced['team_name'], match['winner_name'])

    def test_requires_locked_plan_and_solve_entry_point(self):
        db, tid, tourn = make_tournament(locked=False)
        mid = first_match(tourn)
        with self.assertRaises(ValueError):
            db.update_match_code(tid, mid, 'team_a', NAIVE_CODE, 'PYTHON')
        tourn['ai_task_plan']['locked'] = True
        old_bot = db.update_match_code(tid, mid, 'team_a', "def decide_move(s):\n    return 'ROCK'\n", 'PYTHON')
        self.assertFalse(old_bot['is_valid'])
        self.assertIn('solve', old_bot['validation_error'])
        cpp = db.update_match_code(tid, mid, 'team_b', 'int main(){}', 'CPP')
        self.assertFalse(cpp['is_valid'])
        self.assertEqual(tourn['matches'][mid]['round_status'], 'AWAITING_SUBMISSIONS')

    def test_a_broken_model_loses_the_round_but_the_round_still_completes(self):
        db, tid, tourn = make_tournament()
        mid = first_match(tourn)
        db.update_match_code(tid, mid, 'team_a', NAIVE_CODE, 'PYTHON')
        db.update_match_code(tid, mid, 'team_b', NAIVE_CODE, 'PYTHON')
        tourn['matches'][mid]['team_b']['current_code'] = 'def solve(task):\n    return [0]\n'  # trả sai độ dài ở lúc chấm
        record = db.play_match_round(tid, mid)['round_record']
        self.assertEqual(record['winner'], 'team_a')
        self.assertTrue(record['task_errors']['team_b'])
        self.assertEqual(record['scores']['team_b'], 0.0)

    def test_equal_scores_are_broken_by_a_stored_draw(self):
        db, tid, tourn = make_tournament()
        mid = first_match(tourn)
        for side in ('team_a', 'team_b'):
            db.update_match_code(tid, mid, side, NAIVE_CODE, 'PYTHON')
        outcomes = set()
        for variant in range(6):
            tourn['matches'][mid]['tie_break_seed'] = f'draw-{variant}'
            tourn['matches'][mid]['battle_running'] = False
            tourn['matches'][mid]['status'] = 'IN_PROGRESS'
            tourn['matches'][mid]['rounds_history'] = []
            tourn['matches'][mid]['team_a']['rounds_won'] = tourn['matches'][mid]['team_b']['rounds_won'] = 0
            tourn['matches'][mid]['current_round_idx'] = 1
            record = db.play_match_round(tid, mid)['round_record']
            self.assertEqual(record['scores']['team_a'], record['scores']['team_b'])
            self.assertTrue(record['tie'])
            outcomes.add(record['winner'])
        self.assertEqual(outcomes, {'team_a', 'team_b'})

    def test_demo_fill_uses_a_solve_template_in_task_mode(self):
        db, tid, tourn = make_tournament()
        mid = first_match(tourn)
        result = db.quick_fill_demo_bots(tid, mid)
        self.assertEqual(result['status'], 'SUCCESS', result)
        self.assertIn('def solve', tourn['matches'][mid]['team_a']['current_code'])

    def test_board_tournaments_are_untouched(self):
        db = worker.StatelessDatabase()
        tid = db.create_tournament('Giải thường', 4)['tournament_id']
        for i in range(4):
            db.add_team_to_tournament(tid, f'T{i}', f'N{i}', 'x')
        db.auto_schedule_tournament(tid)
        mid = first_match(db.tournaments[tid])
        code = "def decide_move(state):\n    return 'ROCK'\n"
        self.assertTrue(db.update_match_code(tid, mid, 'team_a', code, 'PYTHON')['is_valid'])
        self.assertTrue(db.update_match_code(tid, mid, 'team_b', code, 'PYTHON')['is_valid'])
        record = db.play_match_round(tid, mid)['round_record']
        self.assertNotEqual(record.get('round_kind'), 'TASK')
        self.assertTrue(record['board_steps'])


if __name__ == '__main__':
    unittest.main()

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'bot-runner'))
from app.engine.board import simulate_board
from app.repository.database import Database


class BoardRulesTests(unittest.TestCase):
    def test_one_action_each_step_and_fresh_second_state(self):
        calls = []
        def decide(code, state):
            calls.append(state)
            return 'ROCK', None
        with patch('app.engine.board.BotRunner.run_python_code', side_effect=decide):
            result = simulate_board('a', 'b', tie_seed='fixed')
        steps = result['board_steps']
        self.assertEqual(calls[0]['active_side'], 'team_a')
        self.assertEqual(calls[1]['active_side'], 'team_b')
        self.assertEqual(calls[1]['opponent_pieces'], [p for p in steps[1]['red_pieces'] if p['alive']])
        for index, step in enumerate(steps[1:], 1):
            self.assertEqual(step['active_side'], 'team_a' if index % 2 else 'team_b')
            old = steps[index - 1]
            positions_changed = sum((p['row'], p['col']) != (q['row'], q['col']) for color in ('red_pieces', 'blue_pieces') for p, q in zip(old[color], step[color]))
            self.assertLessEqual(positions_changed, 1)
        self.assertIn(result['winner_side'], ('team_a', 'team_b'))
        self.assertFalse(any((s.get('clash_event') or {}).get('winner') == 'draw' for s in steps))

    def test_starting_side_alternates_and_reverse_fog_is_consistent(self):
        states = []
        def decide(code, state):
            states.append(state)
            return 'PAPER', None
        with patch('app.engine.board.BotRunner.run_python_code', side_effect=decide):
            result = simulate_board('a', 'b', round_num=2, stage_rule='STAGE_3_REVERSE_FOG', tie_seed='fixed')
        self.assertEqual(result['first_side'], 'team_b')
        self.assertTrue(states[0]['reverse_rule'])
        self.assertTrue(states[1]['reverse_rule'])
        self.assertTrue(all('type' not in piece for state in states for piece in state['opponent_pieces']))

    def test_runtime_error_forfeits_without_random_fallback(self):
        with patch('app.engine.board.BotRunner.run_python_code', return_value=('ROCK', 'timeout')):
            result = simulate_board('a', 'b', tie_seed='fixed')
        self.assertEqual(result['winner_side'], 'team_b')
        self.assertEqual(len(result['board_steps']), 2)
        self.assertEqual(result['bot_errors']['team_a'], 'timeout')

    def test_repeated_seed_produces_same_result_and_no_draw(self):
        for move in ('ROCK', 'PAPER', 'SCISSORS'):
            with patch('app.engine.board.BotRunner.run_python_code', return_value=(move, None)):
                a = simulate_board('a', 'b', tie_seed='fixed')
                b = simulate_board('a', 'b', tie_seed='fixed')
            self.assertEqual(a, b)
            self.assertIn(a['winner_side'], ('team_a', 'team_b'))

    def test_bo5_finishes_at_three_and_advances_without_extra_round(self):
        db = object.__new__(Database)
        db.save_tournaments_to_file = lambda: None
        matches = Database.build_bracket_matches(4)
        match = matches['m_lvl1_1']
        for side in ('team_a', 'team_b'):
            match[side] = dict(team_name=side, code_valid=True, current_code='code', current_lang='PYTHON', rounds_won=0, hp=100)
        db.tournaments = {'cup': dict(matches=matches, stage_rule='STAGE_1_STANDARD')}
        result = dict(winner_side='team_a', win_reason='win', board_steps=[], final_red_alive=9, final_blue_alive=8,
                      pref_move_a='ROCK', pref_move_b='ROCK', bot_errors={'team_a': None, 'team_b': None}, first_side='team_a', tie_break_seed='fixed')
        with patch.object(Database, 'simulate_9x9_board_match', return_value=result):
            for number in (1, 2, 3):
                match['current_round_idx'] = number
                response = db.play_match_round('cup', match['match_id'])
                self.assertEqual(response['is_completed'], number == 3)
        self.assertEqual(match['max_rounds'], 5)
        self.assertEqual(matches['m_gf']['team_a']['team_name'], 'team_a')
        self.assertFalse(matches['m_gf']['team_a']['code_valid'])
        self.assertEqual(db.play_match_round('cup', match['match_id'])['status'], 'ALREADY_FINISHED')

    def test_five_decisive_rounds_finish_three_two(self):
        db = object.__new__(Database)
        db.save_tournaments_to_file = lambda: None
        matches = Database.build_bracket_matches(4)
        match = matches['m_lvl1_1']
        for side in ('team_a', 'team_b'):
            match[side] = dict(team_name=side, code_valid=True, current_code='code', current_lang='PYTHON', rounds_won=0, hp=100)
        db.tournaments = {'cup': dict(matches=matches, stage_rule='STAGE_1_STANDARD')}
        result = dict(win_reason='win', board_steps=[], final_red_alive=9, final_blue_alive=8,
                      pref_move_a='ROCK', pref_move_b='ROCK', bot_errors={'team_a': None, 'team_b': None}, first_side='team_a', tie_break_seed='fixed')
        for number in range(1, 6):
            match['current_round_idx'] = number
            result['winner_side'] = 'team_a' if number % 2 else 'team_b'
            with patch.object(Database, 'simulate_9x9_board_match', return_value=result):
                response = db.play_match_round('cup', match['match_id'])
            self.assertEqual(response['is_completed'], number == 5)
        self.assertEqual((match['team_a']['rounds_won'], match['team_b']['rounds_won']), (3, 2))

    def test_legacy_bo6_migration_keeps_history_and_completed_matches(self):
        db = object.__new__(Database)
        matches = Database.build_bracket_matches(4)
        match = matches['m_lvl1_1']
        match['max_rounds'] = 6
        history = [{'winner': 'team_a'} for _ in range(3)]
        match['rounds_history'] = history
        for side in ('team_a', 'team_b'):
            match[side] = dict(team_name=side, rounds_won=0, hp=100)
        other = matches['m_lvl1_2']
        other.update(status='COMPLETED', max_rounds=6, winner_name='Historic Winner')
        db.tournaments = {'cup': dict(matches=matches)}
        db.upgrade_tournament_rules('cup')
        self.assertEqual(match['max_rounds'], 5)
        self.assertEqual(match['status'], 'COMPLETED')
        self.assertEqual(match['rounds_history'], history)
        self.assertEqual(other['max_rounds'], 6)
        self.assertEqual(other['winner_name'], 'Historic Winner')


if __name__ == '__main__':
    unittest.main()

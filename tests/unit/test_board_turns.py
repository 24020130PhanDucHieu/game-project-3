import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'bot-runner'))
from app.engine.board import simulate_board
from app.repository.database import Database


class BoardRulesTests(unittest.TestCase):
    def test_validation_state_matches_first_real_turn_for_every_rule(self):
        from app.sandbox.runner import BotRunner
        rules = ('STAGE_1_STANDARD', 'STAGE_2_MUTATED', 'RULE_REVERSE', 'RULE_FOG',
                 'RULE_MUTATED_FOG', 'STAGE_3_REVERSE_FOG', 'STAGE_4_FINALS')
        for rule in rules:
            with self.subTest(rule=rule):
                captured = []
                def decide(code, state, **kwargs):
                    captured.append(state)
                    return 'ROCK', None
                with patch('app.sandbox.runner._execute_python_isolated', side_effect=decide):
                    self.assertTrue(BotRunner.validate_bot_code('code', 'PYTHON', rule)['is_valid'])
                sample = captured.pop()
                with patch('app.engine.board.BotRunner.run_python_code', side_effect=decide):
                    simulate_board('a', 'b', stage_rule=rule)
                self.assertEqual(sample, captured[0])
        code = '''def decide_move(state):
    own = state["my_pieces"]
    enemy = state["opponent_pieces"]
    assert len(own) == len(enemy) == 9
    assert state["target"] == [8, 0] and state["ply_number"] == 1
    assert all("type" not in p for p in enemy) == state["rules"]["fog"]
    return own[0]["type"]
'''
        for rule in rules:
            self.assertTrue(BotRunner.validate_bot_code(code, 'PYTHON', rule)['is_valid'], rule)

    def test_actual_clashes_follow_each_rule_and_defender_wins_same_type(self):
        rules = ('STAGE_1_STANDARD', 'STAGE_2_MUTATED', 'RULE_REVERSE', 'RULE_FOG',
                 'RULE_MUTATED_FOG', 'STAGE_3_REVERSE_FOG', 'STAGE_4_FINALS')
        standard_wins = {('ROCK','SCISSORS'), ('SCISSORS','PAPER'), ('PAPER','ROCK')}
        clashes = equal_clashes = 0
        for rule in rules:
            for first_round in (1, 2):
                for a in ('ROCK', 'PAPER', 'SCISSORS'):
                    for b in ('ROCK', 'PAPER', 'SCISSORS'):
                        with self.subTest(rule=rule, round=first_round, moves=(a,b)):
                            def decide(code, state):
                                self.assertLess(state['ply_number'], 1000)
                                if state['rules']['fog']:
                                    self.assertTrue(all('type' not in p for p in state['opponent_pieces']))
                                    self.assertTrue(all('opponent_move' not in h and 'their_move' not in h for h in state['history']))
                                return (a if code == 'a' else b), None
                            with patch('app.engine.board.BotRunner.run_python_code', side_effect=decide):
                                result = simulate_board('a','b',round_num=first_round,stage_rule=rule)
                            for step in result['board_steps']:
                                clash = step.get('clash_event') or {}
                                if clash.get('type') != 'CLASH':
                                    continue
                                clashes += 1
                                winner, loser = clash['winner_type'], clash['loser_type']
                                reverse = (rule == 'RULE_REVERSE' or rule == 'STAGE_3_REVERSE_FOG' and step['cycle'] % 2 == 1
                                           or rule == 'STAGE_4_FINALS' and step['cycle'] % 3 == 0)
                                if winner == loser:
                                    equal_clashes += 1
                                    self.assertEqual(clash['winner'], 'blue' if step['active_side'] == 'team_a' else 'red')
                                else:
                                    self.assertEqual((winner, loser) in standard_wins, not reverse)
                            final = result['board_steps'][-1]
                            red_won = result['winner_side'] == 'team_a'
                            own = final['red_pieces' if red_won else 'blue_pieces']
                            enemy = final['blue_pieces' if red_won else 'red_pieces']
                            target = (8, 0) if red_won else (0, 8)
                            self.assertTrue(not any(p['alive'] for p in enemy) or any(p['alive'] and (p['col'],p['row']) == target for p in own))
        self.assertGreater(clashes, 0)
        self.assertGreater(equal_clashes, 0)

    def test_new_presets_reach_bot_state_and_initial_board(self):
        for rule in ('STAGE_1_STANDARD', 'STAGE_2_MUTATED', 'RULE_REVERSE', 'RULE_FOG', 'RULE_MUTATED_FOG', 'STAGE_3_REVERSE_FOG', 'STAGE_4_FINALS'):
            states = []
            def decide(code, state):
                states.append(state)
                return 'ROCK', None
            with patch('app.engine.board.BotRunner.run_python_code', side_effect=decide):
                result = simulate_board('a', 'b', stage_rule=rule)
            self.assertEqual(states[0]['rules']['id'], rule)
            self.assertEqual(states[0]['reverse_rule'], rule in ('RULE_REVERSE', 'STAGE_3_REVERSE_FOG'))
            self.assertEqual('type' not in states[0]['opponent_pieces'][0], rule in ('RULE_FOG', 'RULE_MUTATED_FOG', 'STAGE_3_REVERSE_FOG', 'STAGE_4_FINALS'))
            expected = ({'ROCK':5,'PAPER':2,'SCISSORS':2} if rule in ('STAGE_2_MUTATED', 'RULE_MUTATED_FOG') else
                        {'ROCK':2,'PAPER':4,'SCISSORS':3} if rule == 'STAGE_4_FINALS' else
                        {'ROCK':3,'PAPER':3,'SCISSORS':3})
            self.assertEqual(states[0]['remaining_cards'], expected)
            for side in ('red_pieces', 'blue_pieces'):
                initial = result['board_steps'][0][side]
                self.assertEqual({kind:sum(p['type']==kind for p in initial) for kind in expected}, expected)
            self.assertEqual(result['rules']['id'], rule)

    def test_match_uses_stage_rule_and_records_it(self):
        from app.engine.board_rules import match_rule
        tournament = {'stage_rule':'STAGE_1_STANDARD', 'stage_rules':{'2':{'rule_id':'RULE_FOG'}}}
        self.assertEqual(match_rule(tournament, {'round_level':2}), 'RULE_FOG')
        self.assertEqual(match_rule(tournament, {'round_level':1}), 'STAGE_1_STANDARD')

    def test_repository_applies_selected_rule_to_each_heat_and_replay(self):
        rules = ('STAGE_1_STANDARD', 'STAGE_2_MUTATED', 'RULE_REVERSE', 'RULE_FOG',
                 'RULE_MUTATED_FOG', 'STAGE_3_REVERSE_FOG', 'STAGE_4_FINALS')
        for rule in rules:
            with self.subTest(rule=rule):
                db = object.__new__(Database)
                db.save_tournaments_to_file = lambda: None
                matches = Database.build_bracket_matches(4)
                match = matches['m_lvl1_1']
                for side in ('team_a', 'team_b'):
                    match[side] = dict(team_name=side, code_valid=True, current_code='code',
                                       current_lang='PYTHON', rounds_won=0, hp=100)
                db.tournaments = {'cup': dict(matches=matches, stage_rule='STAGE_4_FINALS',
                                              stage_rules={'1':{'rule_id':rule, 'publish_at':0}})}
                states = []
                def decide(code, state):
                    states.append(state)
                    return 'ROCK', None
                with patch('app.engine.board.BotRunner.run_python_code', side_effect=decide):
                    for number in (1, 2):
                        match['current_round_idx'] = number
                        db.play_match_round('cup', match['match_id'])
                        record = match['rounds_history'][-1]
                        self.assertEqual(record['stage_rule'], rule)
                        self.assertEqual(record['rules']['id'], rule)
                        self.assertTrue(all(s['rules']['id'] == rule for s in states))
                        self.assertEqual(record['first_side'], 'team_a' if number == 1 else 'team_b')
                        states.clear()

    def test_dry_run_supplies_selected_rules(self):
        from app.sandbox.runner import BotRunner
        code = "def decide_move(state):\n    return 'PAPER' if state['rules']['reverse'] else 'ROCK'"
        checked = BotRunner.validate_bot_code(code, 'PYTHON', 'RULE_REVERSE')
        self.assertTrue(checked['is_valid'])
        self.assertEqual(checked['test_move'], 'PAPER')

    def test_no_turn_limit_and_only_board_objectives_end_valid_games(self):
        longest = 0
        for rule in ('STAGE_1_STANDARD', 'STAGE_2_MUTATED', 'STAGE_3_REVERSE_FOG', 'STAGE_4_FINALS'):
            for move_a in ('ROCK', 'PAPER', 'SCISSORS'):
                for move_b in ('ROCK', 'PAPER', 'SCISSORS'):
                    with self.subTest(rule=rule, moves=(move_a, move_b)):
                        def decide(code, state):
                            self.assertLess(state['ply_number'], 1000, 'Game failed to reach a board objective')
                            return (move_a if code == 'a' else move_b), None
                        with patch('app.engine.board.BotRunner.run_python_code', side_effect=decide):
                            result = simulate_board('a', 'b', stage_rule=rule)
                        final = result['board_steps'][-1]
                        winner = result['winner_side']
                        own = final['red_pieces'] if winner == 'team_a' else final['blue_pieces']
                        enemy = final['blue_pieces'] if winner == 'team_a' else final['red_pieces']
                        target = (8, 0) if winner == 'team_a' else (0, 8)
                        self.assertTrue(not any(p['alive'] for p in enemy) or
                                        any(p['alive'] and (p['col'], p['row']) == target for p in own))
                        longest = max(longest, len(result['board_steps']) - 1)
        self.assertGreater(longest, 32)

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

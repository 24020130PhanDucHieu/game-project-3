"""Demo submission follows stage validation and cannot overwrite a finished heat."""
import copy
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'bot-runner'))
from app.repository.database import Database


class DemoFillTests(unittest.TestCase):
    def setUp(self):
        self.db=object.__new__(Database)
        self.db.save_tournaments_to_file=lambda:None
        self.match={'match_id':'m','round_level':1,'current_round_idx':2,'round_status':'AWAITING_SUBMISSIONS',
                    'team_a':{'team_name':'A','student_id':'1','current_code':'valid','current_lang':'PYTHON'},
                    'team_b':{'team_name':'B','student_id':'2','current_code':'bad','current_lang':'PYTHON'}}
        self.db.tournaments={'cup':{'matches':{'m':self.match},'stage_rules':{'1':{'rule_id':'COMBO_7'}}}}

    def test_rejects_intermission_running_and_completed_without_changes(self):
        for state in ('ROUND_FINISHED','BATTLE_RUNNING','COMPLETED'):
            self.match['round_status']=state
            self.match['status']='COMPLETED' if state=='COMPLETED' else 'PENDING'
            before=copy.deepcopy(self.match)
            with self.assertRaises(ValueError):self.db.quick_fill_demo_bots('cup','m')
            self.assertEqual(self.match,before)

    def test_uses_stage_rule_and_records_real_validation(self):
        def validate(code,language,rule):
            self.assertEqual(rule,'COMBO_7')
            return {'is_valid':code!='bad','error_message':'invalid fixture' if code=='bad' else None}
        with patch('app.sandbox.runner.BotRunner.validate_bot_code',side_effect=validate):
            result=self.db.quick_fill_demo_bots('cup','m')
        self.assertEqual(result['status'],'INVALID_CODE')
        self.assertFalse(self.match['all_teams_ready'])
        self.assertEqual(self.match['round_status'],'AWAITING_SUBMISSIONS')
        records=self.match['submissions_history']
        self.assertEqual([r['is_valid'] for r in records],[True,False])
        self.assertEqual(records[1]['error_message'],'invalid fixture')
        self.assertTrue(all(r['stage_rule']=='COMBO_7' and r['round_number']==2 for r in records))

    def test_empty_cpp_slot_uses_python_template_with_python_language(self):
        self.match['team_b'].update(current_code='',current_lang='CPP')
        with patch('app.sandbox.runner.BotRunner.validate_bot_code',return_value={'is_valid':True,'error_message':None}) as validate:
            result=self.db.quick_fill_demo_bots('cup','m')
        self.assertEqual(validate.call_args_list[1].args[1],'PYTHON')
        self.assertEqual(result['status'],'SUCCESS')
        self.assertTrue(self.match['all_teams_ready'])

if __name__=='__main__':unittest.main()

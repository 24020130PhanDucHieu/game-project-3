"""Run on Linux with WASI SDK installed, including production isolation checks."""
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'bot-runner'))
from app.sandbox.runner import BotRunner
from app.engine.board import simulate_board


@unittest.skipUnless(sys.platform.startswith('linux') and Path('/opt/wasi-sdk/bin/clang++').is_file(),
                     'WASI compiler isolation requires Linux with /opt/wasi-sdk installed; run this suite in WSL/production image.')
class CppWasiTests(unittest.TestCase):

    def setUp(self):
        self.environment=patch.dict(os.environ,{'ENVIRONMENT':'production'})
        self.environment.start()
    def tearDown(self): self.environment.stop()

    def compile(self,source):
        executable,error=BotRunner.compile_cpp_code(source)
        self.assertIsNone(error,error)
        self.addCleanup(lambda: os.path.exists(executable) and os.remove(executable))
        return executable

    def test_template_and_real_match(self):
        source=(Path(__file__).resolve().parents[2]/'examples/bots_sdk/bot_template.cpp').read_text(encoding='utf-8')
        valid=BotRunner.validate_bot_code(source,'CPP','COMBO_7')
        self.assertTrue(valid['is_valid'],valid)
        result=simulate_board(source,source,lang_a='CPP',lang_b='CPP',stage_rule='COMBO_7')
        self.assertEqual(result['bot_errors'],{'team_a':None,'team_b':None})
        self.assertGreater(len(result['board_steps']),3)

    def test_runtime_cannot_read_host_file_or_secrets(self):
        executable=self.compile('''#include <fstream>
#include <iostream>
#include <cstdlib>
int main(){ std::ifstream f("/etc/passwd"); if(f.good() || getenv("ADMIN_PASSWORD")) return 7; std::cout<<"ROCK"; }
''')
        with patch.dict(os.environ,{'ADMIN_PASSWORD':'must-not-leak'}):
            move,error=BotRunner.run_cpp_binary(executable,{})
        self.assertIsNone(error,error)
        self.assertEqual(move,'ROCK')

    def test_all_combinations_reach_cpp_and_fog_hides_only_enemy(self):
        for bits in range(8):
            source='''#include <iostream>
#include <string>
int main(){std::string s;std::getline(std::cin,s);
if(s.find("COMBO_BITS")==std::string::npos) return 2;
if(s.find("\\\"reverse_rule\\\": REVERSE")==std::string::npos) return 3;
auto own=s.substr(s.find("\\\"my_pieces\\\""),s.find("\\\"opponent_pieces\\\"")-s.find("\\\"my_pieces\\\""));
auto enemy=s.substr(s.find("\\\"opponent_pieces\\\""),s.find("\\\"target\\\"")-s.find("\\\"opponent_pieces\\\""));
if(own.find("\\\"type\\\"")==std::string::npos) return 4;
if((enemy.find("\\\"type\\\"")==std::string::npos)!=FOG) return 5;
std::cout<<"ROCK";}
'''.replace('COMBO_BITS',f'COMBO_{bits}').replace('REVERSE','true' if bits&2 else 'false').replace('FOG','true' if bits&4 else 'false')
            result=simulate_board(source,source,lang_a='CPP',lang_b='CPP',stage_rule=f'COMBO_{bits}',tie_seed='cpp-combos')
            self.assertEqual(result['bot_errors'],{'team_a':None,'team_b':None},(bits,result['bot_errors']))

    def test_wasi_game_process_resets_memory_each_move(self):
        from app.sandbox.cpp_wasi import WasiGameProcess
        executable=self.compile('#include <iostream>\nint n=0; int main(){std::cout<<(++n==1?"ROCK":"PAPER");}')
        process=WasiGameProcess(executable)
        try:
            self.assertIsNone(process.error,process.error)
            for _ in range(3): self.assertEqual(process.decide({}),('ROCK',None))
        finally: process.close()
        self.assertIsNotNone(process.process.poll())

    def test_compiler_cannot_include_host_files(self):
        executable,error=BotRunner.compile_cpp_code('#include "/etc/passwd"\nint main(){}')
        self.assertIsNone(executable)
        self.assertIn('Permission denied',error)

    def test_timeout_invalid_output_and_flood(self):
        for source in ['int main(){volatile int n=0;while(true){n++;}}',
                       '#include <iostream>\nint main(){std::cout<<"invalid";}',
                       '#include <iostream>\nint main(){for(int i=0;i<100000;i++)std::cout<<"X";}']:
            executable=self.compile(source)
            _,error=BotRunner.run_cpp_binary(executable,{})
            self.assertIsNotNone(error)


if __name__=='__main__': unittest.main()

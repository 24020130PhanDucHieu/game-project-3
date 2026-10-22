"""Real browser coverage for team profile, fog perspective and correcting settings."""
import tempfile
import time
from playwright.sync_api import sync_playwright,expect
import test_reliability as arena


def run():
    api=arena.api
    admin=api('POST','/api/admin/login',{'username':'admin','password':arena.PASSWORD})['session_token']
    cup=api('POST','/api/tournaments/create',{'name':'Profile and corrections','num_teams':4},admin)['tournament']
    tid=cup['tournament_id']
    for index in range(4):
        api('POST',f'/api/tournaments/{tid}/teams',{'student_id':str(28760000+index),'team_name':f'Profile Team {index}','university':'UET'},admin)
    cup=api('POST',f'/api/tournaments/{tid}/auto-schedule',token=admin)['tournament']
    mid,match=next((key,value) for key,value in cup['matches'].items() if value.get('team_a') and value.get('team_b'))
    errors=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='chrome',headless=True)
        try:
            page=arena.open_page(browser,errors,[])
            expect(page.locator('#nav-btn-profile')).not_to_be_visible()
            arena.login_page(page,'admin',arena.PASSWORD)
            expect(page.locator('#nav-btn-profile')).not_to_be_visible()
            arena.tab(page,'tab-bracket')
            page.locator('#btn-stage-rules').click()
            row=page.locator('#stage-rules-fields fieldset').first
            row.locator('input[value="4"]').check()
            page.locator('#btn-save-stage-rules').click()
            expect(page.locator('#dialog-stage-rules')).not_to_be_visible()
            page.locator('#btn-stage-rules').click()
            expect(row.locator('input[value="4"]')).to_be_disabled()
            page.locator('#btn-edit-stage-rules').click()
            row.locator('input[value="1"]').check()
            page.locator('#btn-save-stage-rules').click()
            expect(page.locator('#dialog-stage-rules')).not_to_be_visible()
            assert api('GET',f'/api/tournaments/{tid}')['stage_rules']['1']['rule_id']=='COMBO_5'
            page.evaluate('openStageSchedule()')
            times=page.locator('#stage-schedule-fields fieldset').first
            start=time.strftime('%Y-%m-%dT%H:%M',time.localtime(time.time()-600))
            end=time.strftime('%Y-%m-%dT%H:%M',time.localtime(time.time()+3600))
            times.locator('[data-time=starts_at]').fill(start)
            times.locator('[data-time=ends_at]').fill(end)
            page.locator('#btn-save-stage-schedule').click()
            expect(page.locator('#dialog-stage-schedule')).not_to_be_visible()
            page.evaluate('openStageSchedule()')
            expect(times.locator('[data-time=ends_at]')).to_be_disabled()
            page.locator('#btn-edit-stage-schedule').click()
            new_end=time.strftime('%Y-%m-%dT%H:%M',time.localtime(time.time()+7200))
            times.locator('[data-time=ends_at]').fill(new_end)
            expect(page.locator('#dialog-stage-schedule').get_by_role('button',name='Hoàn tác',exact=True)).to_have_count(0)
            page.evaluate('document.getElementById("dialog-stage-schedule").close(); openStageSchedule()')
            expect(times.locator('[data-time=ends_at]')).to_have_value(end)
            page.locator('#btn-edit-stage-schedule').click()
            times.locator('[data-time=ends_at]').fill(new_end)
            page.locator('#btn-save-stage-schedule').click()
            expect(page.locator('#dialog-stage-schedule')).not_to_be_visible()
            for side,color,opponent in [('team_a','red','blue'),('team_b','blue','red')]:
                sid=match[side]['student_id']
                team=arena.open_page(browser,errors,[])
                arena.login_page(team,sid,'k69'+sid)
                arena.tab(team,'tab-profile')
                expect(team.locator('#profile-team-name')).to_have_text(match[side]['team_name'])
                expect(team.locator('#profile-details')).to_contain_text(sid)
                for width in (1440,390):
                    team.set_viewport_size({'width':width,'height':900})
                    assert team.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
                    team.locator('#tab-profile').screenshot(path=str(arena.ROOT/'tests'/f'profile-{side}-{width}.png'))
                team.reload();team.evaluate('() => window.arenaReady')
                expect(team.locator('#tab-profile')).to_have_class('tab-pane active')
                arena.choose_match(team,mid)
                expect(team.locator(f'#chessboard-9x9 .piece-{color} .piece-unknown')).to_have_count(0)
                expect(team.locator(f'#chessboard-9x9 .piece-{opponent} .piece-unknown')).to_have_count(9)
                # Real C++ submission on the development gateway; WASI gets separate Linux tests.
                team.locator('#studio-sel-lang').select_option('CPP')
                arena.submit_ui(team,'#include <iostream>\nint main(){std::cout<<"ROCK";}')
                team.context.close()
            api('POST',f'/api/tournaments/{tid}/matches/{mid}/play-round',token=admin)
            played=api('GET',f'/api/tournaments/{tid}')['matches'][mid]
            winner=played['rounds_history'][0]['winner']
            sid=played[winner]['student_id']
            winner_page=arena.open_page(browser,errors,[])
            arena.login_page(winner_page,sid,'k69'+sid)
            arena.tab(winner_page,'tab-profile')
            def stat(label):
                return winner_page.locator('.profile-stat').filter(has=winner_page.locator('span',has_text=label)).locator('strong')
            expect(stat('Hiệp thắng')).to_have_text('1')
            expect(stat('Trận Bo5 thắng')).to_have_text('0')
            expect(stat('ELO bảng xếp hạng')).to_have_text('1200')
            expect(winner_page.locator('#profile-matches')).to_contain_text('Đang đấu Bo5')
            # Rendering identical snapshots must preserve every piece node.
            stable=page.evaluate('''steps => {
              renderRealtimeChessboard(steps[0].red_pieces,steps[0].blue_pieces);
              const board=document.getElementById('realtime-chessboard-9x9');
              const original=Array.from(board.querySelectorAll('.board-piece'));
              renderRealtimeChessboard(steps[0].red_pieces,steps[0].blue_pieces);
              return original.length===18 && original.every(node=>node.isConnected);
            }''',played['rounds_history'][0]['board_steps'])
            assert stable
            # Complete the real Bo5, then assert the winning team's profile and ranking.
            while played['status']!='COMPLETED':
                deadline=time.monotonic()+20
                while played['round_status']=='ROUND_FINISHED' and time.monotonic()<deadline:
                    time.sleep(0.2)
                    played=api('GET',f'/api/tournaments/{tid}')['matches'][mid]
                assert played['round_status']=='AWAITING_SUBMISSIONS',played['round_status']
                api('POST',f'/api/tournaments/{tid}/matches/{mid}/demo-fill',token=admin)
                api('POST',f'/api/tournaments/{tid}/matches/{mid}/play-round',token=admin)
                played=api('GET',f'/api/tournaments/{tid}')['matches'][mid]
            final_sid=played[played['winner']]['student_id']
            if final_sid!=sid:
                winner_page.context.close()
                winner_page=arena.open_page(browser,errors,[])
                arena.login_page(winner_page,final_sid,'k69'+final_sid)
                arena.tab(winner_page,'tab-profile')
            winner_page.evaluate('refreshTeamProfile()')
            expect(stat('Trận Bo5 thắng')).to_have_text('1')
            expect(stat('Hiệp thắng')).to_have_text('3')
            ranking=api('GET','/api/ranking')
            elo=next(row['elo_score'] for row in ranking if row['student_id']==final_sid)
            expect(stat('ELO bảng xếp hạng')).to_have_text(str(elo))
            winner_page.context.close()
            api('PUT',f'/api/tournaments/{tid}/stage-rules',{'correction':True,'rules':[{'level':1,'rule_id':'COMBO_4','publish_at':0}]},admin,expected=400)
            page.set_viewport_size({'width':390,'height':900})
            for kind,opener in [('rules','openStageRules'),('schedule','openStageSchedule')]:
                page.evaluate(f'{opener}()')
                dialog=page.locator(f'#dialog-stage-{kind}')
                assert dialog.evaluate('el => el.scrollWidth <= el.clientWidth+1')
                dialog.screenshot(path=str(arena.ROOT/'tests'/f'profile-{kind}-390.png'))
                page.evaluate(f'document.getElementById("dialog-stage-{kind}").close()')
            assert not errors,errors
            print('PASS profile heat/Bo5 wins + ELO, stable live nodes, desktop/mobile/F5, fog, rule correction, schedule edit, C++ submissions',flush=True)
        finally: browser.close()


if __name__=='__main__':
    (arena.ROOT / 'data').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='arena-profile-', dir=arena.ROOT / 'data') as directory:
        with arena.LocalArena(directory): run()

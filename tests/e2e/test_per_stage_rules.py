"""Real browser + gateway + engine: per-stage rules, publication and replay."""
import tempfile
import time
from playwright.sync_api import sync_playwright, expect
import test_reliability as arena


def run(server):
    api = arena.api
    admin = api('POST','/api/admin/login',{'username':'admin','password':arena.PASSWORD})['session_token']
    cup = api('POST','/api/tournaments/create',{'name':'Stage Rules 32','num_teams':32},admin)['tournament']
    tid = cup['tournament_id']
    for i in range(32):
        api('POST',f'/api/tournaments/{tid}/teams',{'student_id':str(29000000+i),'team_name':f'Rules Team {i}','university':'Test'},admin)
    cup = api('POST',f'/api/tournaments/{tid}/auto-schedule',token=admin)['tournament']
    mid = next(k for k,m in cup['matches'].items() if m['round_level']==1)
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome',headless=True)
        try:
            page = arena.open_page(browser,errors,[])
            arena.login_page(page,'admin',arena.PASSWORD)
            arena.tab(page,'tab-bracket')
            page.locator('#btn-stage-rules').click()
            expect(page.locator('#dialog-stage-rules')).to_be_visible()
            rows = page.locator('#stage-rules-fields fieldset')
            assert rows.count()==5
            assert rows.first.locator('select option').evaluate_all('(options) => options.filter(o => o.value).map(o => o.value)') == ['STAGE_1_STANDARD','STAGE_2_MUTATED','RULE_REVERSE','RULE_FOG']
            for retired in ('RULE_MUTATED_FOG','STAGE_3_REVERSE_FOG','STAGE_4_FINALS'):
                api('PUT',f'/api/tournaments/{tid}/stage-rules',{'rules':[{'level':1,'rule_id':retired,'publish_at':0}]},admin,expected=400)
            rect = page.locator('#dialog-stage-rules').bounding_box()
            assert abs(rect['x']+rect['width']/2-720)<3
            for i in range(5):
                rows.nth(i).locator('input').fill(time.strftime('%Y-%m-%dT%H:%M',time.localtime(time.time()+900)))
            rows.first.locator('select').select_option('RULE_REVERSE')
            page.locator('#btn-save-stage-rules').click()
            expect(page.locator('#dialog-stage-rules')).not_to_be_visible()
            public = api('GET',f'/api/tournaments/{tid}')
            assert '2' not in public['stage_rules'], 'Unselected stage was accidentally configured'
            assert public['stage_rules']['1']['hidden'] and 'rule_id' not in public['stage_rules']['1']
            api('PUT',f'/api/tournaments/{tid}/stage-rules',{'rules':[{'level':1,'rule_id':'RULE_FOG','publish_at':0}]},expected=401)
            api('POST',f'/api/tournaments/{tid}/matches/{mid}/code',{'side':'team_a','code_content':arena.CODE},admin,expected=400)
            api('POST',f'/api/tournaments/{tid}/matches/{mid}/play-round',token=admin,expected=400)
            page.locator('#btn-stage-rules').click()
            page.locator('#stage-rules-fields fieldset').first.locator('input').fill('')
            page.locator('#btn-save-stage-rules').click()
            expect(page.locator('#dialog-stage-rules')).not_to_be_visible()
            page.reload(); page.wait_for_function('window.arenaReady !== undefined'); page.evaluate('() => window.arenaReady')
            arena.tab(page,'tab-bracket');page.locator('#btn-stage-rules').click()
            expect(page.locator('#stage-rules-fields fieldset').first.locator('select')).to_be_disabled()
            page.locator('#dialog-stage-rules button[aria-label]').click()
            preview = page.evaluate('''() => {
                const old = currentTournamentData.stage_rules['1'];
                currentTournamentData.stage_rules['1'] = {rule_id:'STAGE_2_MUTATED', publish_at:0};
                const match = Object.values(currentTournamentData.matches).find(m => m.round_level === 1);
                document.getElementById('playback-step-indicator').textContent = '33 / 33';
                renderVisualBattleArena(match);
                if (document.getElementById('playback-step-indicator').textContent.includes('33')) throw new Error('Stale replay counter');
                const counts = ['chessboard-9x9','realtime-chessboard-9x9'].map(id =>
                    ['red','blue'].map(side => ['ROCK','PAPER','SCISSORS'].map(type =>
                        document.querySelectorAll(`#${id} .piece-${side}[title*="${type}"]`).length)));
                currentTournamentData.stage_rules['1'] = old;
                return counts;
            }''')
            assert preview == [[[5,2,2],[5,2,2]],[[5,2,2],[5,2,2]]], preview
            fog_note = page.evaluate('''() => {
                const old = currentTournamentData.stage_rules['1'];
                const active = currentActiveMatchId;
                currentActiveMatchId = Object.keys(currentTournamentData.matches).find(id => currentTournamentData.matches[id].round_level === 1);
                currentTournamentData.stage_rules['1'] = {rule_id:'RULE_MUTATED_FOG',publish_at:0};
                renderMatchRule();
                const note = document.getElementById('studio-rule-summary').textContent;
                currentTournamentData.stage_rules['1'] = old;
                currentActiveMatchId = active;
                renderMatchRule();
                return note;
            }''')
            assert 'dữ liệu bot nhận được' in fog_note
            assert api('GET',f'/api/tournaments/{tid}')['stage_rules']['1']['rule_id']=='RULE_REVERSE'
            api('PUT',f'/api/tournaments/{tid}/stage-rules',{'rules':[{'level':1,'rule_id':'RULE_FOG','publish_at':0}]},admin,expected=400)
            for number in (1,2):
                for side in ('team_a','team_b'):
                    api('POST',f'/api/tournaments/{tid}/matches/{mid}/code',{'side':side,'code_content':arena.CODE,'round_number':number,'explanation':'Adapted for reversed clashes'},admin)
                api('POST',f'/api/tournaments/{tid}/matches/{mid}/play-round',token=admin)
                data=api('GET',f'/api/tournaments/{tid}',token=admin)
                record=data['matches'][mid]['rounds_history'][-1]
                assert record['stage_rule']=='RULE_REVERSE' and record['rules']['reverse']
                assert data['matches'][mid]['submissions_history'][-1]['explanation']=='Adapted for reversed clashes'
                if number==1:
                    api('POST',f'/api/tournaments/{tid}/matches/{mid}/next-round',token=admin)
                    data=api('GET',f'/api/tournaments/{tid}',token=admin)
                    assert not data['matches'][mid]['team_a']['code_valid']
            server.restart_gateway()
            data=api('GET',f'/api/tournaments/{tid}',token=admin)
            assert data['stage_rules']['1']['rule_id']=='RULE_REVERSE'
            assert len(data['matches'][mid]['rounds_history'])==2
            page.reload();page.wait_for_function('window.arenaReady !== undefined');page.evaluate('() => window.arenaReady')
            page.set_viewport_size({'width':390,'height':844})
            arena.tab(page,'tab-bracket');page.evaluate('openStageRules()')
            rect=page.locator('#dialog-stage-rules').bounding_box()
            assert rect['x']>=0 and rect['x']+rect['width']<=390
            assert not errors,errors
        finally:
            browser.close()
    print('PASS 32-team stage-rule dialog, publish privacy, permissions, locks, real reversed games, fresh per-heat submissions, notes, replay and restart',flush=True)


if __name__=='__main__':
    with tempfile.TemporaryDirectory(prefix='arena-stage-rules-') as directory:
        with arena.LocalArena(directory) as server:
            run(server)

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
            assert rows.first.locator('input[type=checkbox]').count()==3
            for retired in ('RULE_MUTATED_FOG','STAGE_3_REVERSE_FOG','STAGE_4_FINALS'):
                api('PUT',f'/api/tournaments/{tid}/stage-rules',{'rules':[{'level':1,'rule_id':retired,'publish_at':0}]},admin,expected=400)
            rect = page.locator('#dialog-stage-rules').bounding_box()
            assert abs(rect['x']+rect['width']/2-720)<3
            rows.first.locator('input[type=datetime-local]').fill(time.strftime('%Y-%m-%dT%H:%M',time.localtime(time.time()+900)))
            for checkbox in rows.first.locator('input[type=checkbox]').all(): checkbox.check()
            page.locator('#btn-save-stage-rules').click()
            expect(page.locator('#dialog-stage-rules')).not_to_be_visible()
            public = api('GET',f'/api/tournaments/{tid}')
            assert '2' not in public['stage_rules'], 'Unselected stage was accidentally configured'
            assert public['stage_rules']['1']['hidden'] and 'rule_id' not in public['stage_rules']['1']
            api('PUT',f'/api/tournaments/{tid}/stage-rules',{'rules':[{'level':1,'rule_id':'RULE_FOG','publish_at':0}]},expected=401)
            api('POST',f'/api/tournaments/{tid}/matches/{mid}/code',{'side':'team_a','code_content':arena.CODE},admin,expected=400)
            api('POST',f'/api/tournaments/{tid}/matches/{mid}/play-round',token=admin,expected=400)
            page.locator('#btn-stage-rules').click()
            page.locator('#stage-rules-fields fieldset').first.locator('input[type=datetime-local]').fill('')
            page.locator('#btn-save-stage-rules').click()
            expect(page.locator('#dialog-stage-rules')).not_to_be_visible()
            page.reload(); page.wait_for_function('window.arenaReady !== undefined'); page.evaluate('() => window.arenaReady')
            arena.tab(page,'tab-bracket');page.locator('#btn-stage-rules').click()
            for checkbox in page.locator('#stage-rules-fields fieldset').first.locator('input[type=checkbox]').all():
                expect(checkbox).to_be_disabled()
                expect(checkbox).to_be_checked()
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
            assert 'dấu ?' in fog_note
            assert api('GET',f'/api/tournaments/{tid}')['stage_rules']['1']['rule_id']=='COMBO_7'
            api('PUT',f'/api/tournaments/{tid}/stage-rules',{'rules':[{'level':1,'rule_id':'RULE_FOG','publish_at':0}]},admin,expected=400)
            for number in (1,2):
                for side in ('team_a','team_b'):
                    api('POST',f'/api/tournaments/{tid}/matches/{mid}/code',{'side':side,'code_content':arena.CODE,'round_number':number,'explanation':'Adapted for reversed clashes'},admin)
                api('POST',f'/api/tournaments/{tid}/matches/{mid}/play-round',token=admin)
                data=api('GET',f'/api/tournaments/{tid}',token=admin)
                record=data['matches'][mid]['rounds_history'][-1]
                assert record['stage_rule']=='COMBO_7' and record['rules']['reverse'] and record['rules']['fog'] and record['rules']['shuffle']
                assert record['board_steps'] and not any(item.get('error') for item in record['bot_logs'])
                assert data['matches'][mid]['submissions_history'][-1]['explanation']=='Adapted for reversed clashes'
                if number==1:
                    api('POST',f'/api/tournaments/{tid}/matches/{mid}/next-round',token=admin)
                    data=api('GET',f'/api/tournaments/{tid}',token=admin)
                    assert not data['matches'][mid]['team_a']['code_valid']
            server.restart_gateway()
            data=api('GET',f'/api/tournaments/{tid}',token=admin)
            assert data['stage_rules']['1']['rule_id']=='COMBO_7'
            assert len(data['matches'][mid]['rounds_history'])==2
            # All checkbox combinations persist independently without publishing other stages.
            for bits in range(8):
                api('PUT',f'/api/tournaments/{tid}/stage-rules',{'rules':[{'level':2,'rule_id':f'COMBO_{bits}','publish_at':time.time()+900}]},admin)
                assert api('GET',f'/api/tournaments/{tid}',token=admin)['stage_rules']['2']['rule_id']==f'COMBO_{bits}'
            match=data['matches'][mid]
            for side,color,enemy in [('team_a','red','blue'),('team_b','blue','red')]:
                sid=match[side]['student_id']
                team=arena.open_page(browser,errors,[])
                arena.login_page(team,sid,'k69'+sid)
                arena.choose_match(team,mid)
                team.wait_for_function("currentMatchData.round_status !== 'ROUND_FINISHED'",timeout=10000)
                expect(team.locator('#match-playback-bar')).not_to_be_visible()
                expect(team.locator('#board-card-title-label')).to_contain_text('LIVE')
                team.evaluate('saveArenaViewState({inlineRound:1,inlineStep:0});renderVisualBattleArena(currentMatchData)')
                visible=team.evaluate('''() => {
                    const record=currentMatchData.rounds_history.at(-1);
                    return {index:inlinePlaybackCurrentIdx,expected:record.board_steps.length-1,
                        seed:record.tie_break_seed,
                        own:record.board_steps[0][currentStudioSide==='team_a'?'red_pieces':'blue_pieces'].map(p=>p.type),
                        enemy:record.board_steps[0][currentStudioSide==='team_a'?'blue_pieces':'red_pieces'].map(p=>p.type)};
                }''')
                assert visible['index']==visible['expected'] and visible.get('seed') is None,visible
                assert all(p!='UNKNOWN' for p in visible['own']) and visible['enemy']==['UNKNOWN']*9
                assert team.locator(f'#chessboard-9x9 .piece-{enemy}').count()==team.locator(f'#chessboard-9x9 .piece-{enemy} .piece-unknown').count()
                # History replay remains separate from live board.
                team.evaluate('openReplayModal(currentActiveMatchId,1)')
                team.locator('#replay-step-slider').press('Home')
                expect(team.locator('#replay-chessboard-9x9 .piece-unknown')).to_have_count(9)
                team.locator('#btn-close-replay-x').click()
                for width in (1440,390):
                    team.set_viewport_size({'width':width,'height':1000})
                    layout=team.locator('.studio-card-header').evaluate('''el => {
                        const title=el.querySelector('h3').getBoundingClientRect();
                        const badge=el.querySelector('.ide-status-tag').getBoundingClientRect();
                        return {overlap:title.right>badge.left && title.bottom>badge.top && title.top<badge.bottom,
                            overflow:document.documentElement.scrollWidth>innerWidth+1};
                    }''')
                    assert not layout['overlap'] and not layout['overflow'],layout
                    team.locator('.match-arena-2col-layout').screenshot(path=str(arena.ROOT/'tests'/f'combo-{side}-{width}.png'))
                team.context.close()
            page.reload();page.wait_for_function('window.arenaReady !== undefined');page.evaluate('() => window.arenaReady')
            page.set_viewport_size({'width':390,'height':844})
            arena.tab(page,'tab-bracket');page.evaluate('openStageRules()')
            rect=page.locator('#dialog-stage-rules').bounding_box()
            assert rect['x']>=0 and rect['x']+rect['width']<=390
            assert not errors,errors
        finally:
            browser.close()
    print('PASS 32-team checkbox dialog, publish privacy, permissions, locks, combined real games, fresh per-heat submissions, notes, replay and restart',flush=True)


if __name__=='__main__':
    with tempfile.TemporaryDirectory(prefix='arena-stage-rules-') as directory:
        with arena.LocalArena(directory) as server:
            run(server)

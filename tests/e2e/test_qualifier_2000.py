"""Actual 2,000-bot qualifier against Go + Python sandbox, isolated JSON fixtures.

Fixture generation bypasses bulk account registration, not bot execution. Every
locked bot executes through the production qualifier-game worker and sandbox.
Two pairing rounds produce 2,000 real games; a gateway restart checks resumption.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import secrets
import tempfile
import sys
import time
from concurrent.futures import ThreadPoolExecutor

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from playwright.sync_api import sync_playwright, expect
import test_reliability as arena

CODE = "def decide_move(game_state):\n    return 'ROCK'\n"

def assert_centered(page, selector):
    rect = page.locator(selector).bounding_box()
    viewport = page.viewport_size
    assert abs(rect['x'] + rect['width']/2 - viewport['width']/2) < 3, rect
    assert abs(rect['y'] + rect['height']/2 - viewport['height']/2) < 3, rect


def run_ui(server, admin):
    api = arena.api
    event = api('POST', '/api/qualifiers', {'name': 'UI Qualifier', 'deadline': time.time()+3600, 'rounds': 2, 'top_k': 8}, admin)
    qid = event['id']
    assert api('GET', f'/api/qualifiers/{qid}/teams', token=admin)['total'] == 0
    tokens = []
    for n in range(8):
        sid = str(26000001+n)
        api('POST', '/api/teams/register', {'student_id': sid, 'team_name': f'UI Team {n}', 'password': 'qualifier123'}, expected=201)
        token = api('POST', '/api/teams/login', {'username': sid, 'password': 'qualifier123'})['session_token']
        tokens.append(token)
        if n:
            api('POST', f'/api/qualifiers/{qid}/register', token=token)
            api('POST', f'/api/qualifiers/{qid}/submissions', {'code': CODE, 'language': 'PYTHON'}, token)
    api('POST', f'/api/qualifiers/{qid}/submissions', {'code':CODE,'language':'PYTHON'}, tokens[0], expected=400)
    api('POST', f'/api/qualifiers/{qid}/actions/test-bots', {'count':8}, tokens[0], expected=403)
    assert api('GET', f'/api/qualifiers/{qid}/teams', token=admin)['total'] == 7
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        team = arena.open_page(browser, errors, [])
        # Login without any tournament or match selection.
        team.locator('#btn-user-auth-action').click()
        team.locator('#inp-login-user').fill('26000001')
        team.locator('#inp-login-pass').fill('qualifier123')
        team.locator('#btn-login-submit').click()
        team.wait_for_function("currentAppRole === 'TEAM'")
        arena.tab(team, 'tab-qualifier')
        expect(team.locator('#qualifier-team-card')).not_to_be_visible()
        team.locator('#qualifier-register').click()
        expect(team.locator('#qualifier-events-dialog')).to_be_visible()
        assert_centered(team, '#qualifier-events-dialog')
        team.locator('#qualifier-events-list button').first.click()
        team.wait_for_function("qualifierData !== null")
        team.locator('#qualifier-register').click()
        expect(team.locator('#qualifier-team-card')).to_be_visible(timeout=10000)
        team.locator('#qualifier-file').set_input_files({'name':'qualifier_bot.py','mimeType':'text/x-python','buffer':CODE.encode()})
        expect(team.locator('#qualifier-code')).to_have_value(CODE)
        team.locator('#qualifier-check').click()
        expect(team.locator('#qualifier-check')).to_be_enabled()
        team.locator('#qualifier-submit').click()
        expect(team.locator('#qualifier-my-status')).to_contain_text('Có bản hợp lệ')
        good = api('GET', f'/api/qualifiers/{qid}', token=tokens[0])['participant']['valid_id']
        invalid = api('POST', f'/api/qualifiers/{qid}/submissions', {'code': 'syntax ??', 'language': 'PYTHON'}, tokens[0])
        assert invalid['valid'] is False
        assert api('GET', f'/api/qualifiers/{qid}', token=tokens[0])['participant']['valid_id'] == good
        public = api('GET', f'/api/qualifiers/{qid}?student_id=26000001')
        assert 'participant' not in public and 'history' not in public
        api('GET', f'/api/qualifiers/{qid}/teams', token=tokens[0], expected=403)
        arena.tab(team, 'tab-ranking')
        arena.tab(team, 'tab-qualifier')
        expect(team.locator('#qualifier-code')).to_have_value(CODE)
        team.reload()
        team.wait_for_function("currentAppRole === 'TEAM' && qualifierData !== null")
        expect(team.locator('#qualifier-code')).to_have_value(CODE)
        organizer = arena.open_page(browser, errors, [])
        organizer.locator('#btn-user-auth-action').click()
        organizer.locator('#inp-login-user').fill('admin')
        organizer.locator('#inp-login-pass').fill(arena.PASSWORD)
        organizer.locator('#btn-login-submit').click()
        organizer.wait_for_function("currentAppRole === 'ADMIN'")
        arena.tab(organizer, 'tab-qualifier')
        expect(organizer.locator('#qualifier-teams')).to_contain_text('UI Team 0')
        organizer.locator('#qualifier-search').fill('26000001')
        expect(organizer.locator('#qualifier-teams tr')).to_have_count(1)
        organizer.reload()
        organizer.wait_for_function("currentAppRole === 'ADMIN' && qualifierData !== null")
        expect(organizer.locator('#qualifier-search')).to_have_value('26000001')
        organizer.locator('#qualifier-config').click()
        assert_centered(organizer, '#qualifier-config-dialog')
        organizer.set_viewport_size({'width':390,'height':844})
        assert_centered(organizer, '#qualifier-config-dialog')
        organizer.set_viewport_size({'width':1440,'height':1000})
        organizer.locator('#qualifier-config-name').fill('UI Qualifier Updated')
        organizer.locator('#qualifier-config-save').click()
        expect(organizer.locator('#qualifier-config-dialog')).not_to_be_visible()
        expect(organizer.locator('#qualifier-freeze')).to_be_enabled()
        organizer.on('dialog',lambda dialog:dialog.accept())
        organizer.locator('#qualifier-freeze').click()
        expect(organizer.locator('#qualifier-summary')).to_contain_text('Đã khóa bài')
        locked = api('GET', f'/api/qualifiers/{qid}', token=tokens[0])['participant']
        assert locked['locked_id'] == good
        api('POST', f'/api/qualifiers/{qid}/submissions', {'code': CODE, 'language': 'PYTHON'}, tokens[0], expected=400)
        organizer.locator('#qualifier-start').click()
        deadline = time.time()+120
        while time.time()<deadline:
            state=api('GET', f'/api/qualifiers/{qid}')['event']
            if state['status'] in ('FINISHED','PAUSED'): break
            time.sleep(1)
        assert state['status']=='FINISHED',state
        ranking=api('GET',f'/api/qualifiers/{qid}/ranking')['items']
        assert len(ranking)==8 and all(p['played']==2 for p in ranking)
        cup=api('POST','/api/tournaments/create',{'name':'UI Qualified Main','num_teams':8},admin)['tournament']
        expect(organizer.locator('#qualifier-promote')).to_be_enabled(timeout=15000)
        expect(organizer.locator('#qualifier-target option')).to_have_count(2,timeout=15000)
        organizer.locator('#qualifier-target').select_option(cup['tournament_id'])
        organizer.locator('#qualifier-promote').click()
        expect(organizer.locator('#qualifier-summary')).to_contain_text('Đã chốt vào giải chính',timeout=15000)
        main=api('GET',f"/api/tournaments/{cup['tournament_id']}")
        assert len(main['teams'])==8 and all(m['max_rounds']==5 for m in main['matches'].values())
        api('POST',f'/api/qualifiers/{qid}/actions/promote',{'tournament_id':cup['tournament_id']},admin)
        # Explicit test-bot creation does not enroll all site accounts.
        demo = api('POST','/api/qualifiers',{'name':'Test bots only','deadline':time.time()+3600,'rounds':1,'top_k':8},admin)
        assert api('GET',f"/api/qualifiers/{demo['id']}/teams",token=admin)['total']==0
        organizer.evaluate('(id)=>selectQualifier(id)',demo['id'])
        expect(organizer.locator('#qualifier-test-bots')).to_be_enabled(timeout=10000)
        organizer.locator('#qualifier-test-bots').click()
        assert_centered(organizer,'#qualifier-test-dialog')
        organizer.locator('#qualifier-test-count').fill('8')
        organizer.locator('#qualifier-test-save').click()
        expect(organizer.locator('#qualifier-test-dialog')).not_to_be_visible()
        bots=api('GET',f"/api/qualifiers/{demo['id']}/teams",token=admin)
        assert bots['total']==8 and all(p['test_bot'] for p in bots['items'])
        api('POST',f"/api/qualifiers/{demo['id']}/actions/freeze",{},admin)
        api('POST',f"/api/qualifiers/{demo['id']}/actions/start",{},admin)
        limit=time.time()+60
        while time.time()<limit:
            demo_state=api('GET',f"/api/qualifiers/{demo['id']}")['event']
            if demo_state['status'] in ('FINISHED','PAUSED'):break
            time.sleep(1)
        assert demo_state['status']=='FINISHED',demo_state
        # All five stages of a 32-team tournament accept schedules.
        cup32=api('POST','/api/tournaments/create',{'name':'Schedule 32','num_teams':32},admin)['tournament']
        organizer.evaluate('(id)=>{currentTournamentId=id;return loadActiveTournament(id)}',cup32['tournament_id'])
        organizer.evaluate('openStageSchedule()')
        assert_centered(organizer,'#dialog-stage-schedule')
        organizer.screenshot(path=str(arena.ROOT/'data'/'schedule-dialog-review.png'))
        assert organizer.locator('#stage-schedule-fields fieldset').count()==5
        start=int(time.time()/60)*60+600
        for i,row in enumerate(organizer.locator('#stage-schedule-fields fieldset').all()):
            for key,stamp in [('starts_at',start+i*1200),('ends_at',start+i*1200+600)]:
                field=row.locator(f'[data-time="{key}"]')
                expect(field).to_be_enabled()
                field.fill(organizer.evaluate('(t)=>localDatetime(t)',stamp))
        organizer.locator('#btn-save-stage-schedule').click()
        expect(organizer.locator('#dialog-stage-schedule')).not_to_be_visible()
        stored=api('GET',f"/api/tournaments/{cup32['tournament_id']}")
        assert len(stored['stage_schedule'])==5 and stored['stage_schedule']['1']['starts_at']==start
        organizer.evaluate("openAccountEnrollment({student_id:'26000001',team_name:'UI Team 0'})")
        assert_centered(organizer,'#dialog-enroll-account')
        organizer.locator('#dialog-enroll-account button[aria-label]').click()
        assert not errors,errors
        browser.close()
    print('PASS qualifier UI, direct submission, last-valid preservation, privacy, tab/F5 draft, freeze, 2 rounds, ranking and idempotent promotion',flush=True)


def write_record(directory, key, data):
    path=directory/(hashlib.sha256(key.encode()).hexdigest()+'.record')
    path.write_text(json.dumps({'key':key,'data':data},ensure_ascii=False),encoding='utf-8')


def run_2000(server,admin):
    api=arena.api
    event=api('POST','/api/qualifiers',{'name':'2,000 Real Bots Stress','deadline':time.time()+7200,'rounds':2,'top_k':32},admin)
    qid=event['id']
    account_file=server.directory/'accounts_store.json'
    accounts=json.loads(account_file.read_text(encoding='utf-8'))
    example=accounts['26000001']
    key=hashlib.sha256(b'arena-account-v1:verification-stable-key').digest()
    aes=AESGCM(key)
    store=server.directory/'qualifier_store'
    for n in range(2000):
        sid=str(27000001+n);nonce=secrets.token_bytes(12)
        accounts[sid]={'student_id':sid,'team_name':f'Stress Bot {n+1:04d}','password_hash':example['password_hash'],'password_encrypted':base64.b64encode(nonce+aes.encrypt(nonce,b'qualifier123',sid.encode())).decode(),'created_at':example['created_at'],'deleted':False}
        move=('ROCK','PAPER','SCISSORS')[n%3]
        code=f"# Stress bot {n+1}\ndef decide_move(game_state):\n    return '{move}'\n"
        sub_id=f'fixture-{sid}'
        write_record(store,f'participant:{qid}:{sid}',{'student_id':sid,'team_name':f'Stress Bot {n+1:04d}','code':code,'language':'PYTHON','valid_id':sub_id,'elo':1200,'wins':0,'played':0,'byes':0,'starts':0,'submitted_at':time.time()})
        write_record(store,f'submission:{qid}:{sid}:{sub_id}',{'id':sub_id,'code':code,'language':'PYTHON','valid':True,'at':time.time()})
    account_file.write_text(json.dumps(accounts),encoding='utf-8')
    server.env['QUALIFIER_WORKERS']='8'
    server.restart_gateway()
    assert api('GET',f'/api/qualifiers/{qid}/teams?page=40&filter=VALID',token=admin)['total']==2000
    assert len(api('GET',f'/api/qualifiers/{qid}/teams?page=40&filter=VALID',token=admin)['items'])==50
    assert api('GET',f'/api/qualifiers/{qid}/teams?q=27000001',token=admin)['total']==1
    started=time.monotonic()
    api('POST',f'/api/qualifiers/{qid}/actions/freeze',{},admin)
    assert api('GET',f'/api/qualifiers/{qid}')['event']['eligible']==2000
    api('POST',f'/api/qualifiers/{qid}/actions/start',{},admin)
    restarted=False;last_print=0;timeout=time.monotonic()+1800
    while time.monotonic()<timeout:
        state=api('GET',f'/api/qualifiers/{qid}')['event']
        if time.monotonic()-last_print>20:
            print(f"PROGRESS 2000 bots: {state['completed']}/{state['total']} games, round {state['current_round']}, {state['status']}",flush=True);last_print=time.monotonic()
        if not restarted and state['completed']>=10 and state['status']=='RUNNING':
            before=state['completed'];server.restart_gateway();after=api('GET',f'/api/qualifiers/{qid}')['event']['completed'];assert after>=before;restarted=True
            print('PASS gateway restart during active 2000-bot round; completed jobs retained',flush=True)
        if state['status'] in ('FINISHED','PAUSED'):break
        time.sleep(2)
    assert state['status']=='FINISHED',state
    assert restarted and state['completed']==2000 and state['applied_round']==2,state
    ranking=[]
    for page in range(1,41):ranking.extend(api('GET',f'/api/qualifiers/{qid}/ranking?page={page}')['items'])
    assert len(ranking)==2000 and len({p['student_id'] for p in ranking})==2000
    assert all(p['played']==2 and p['byes']==0 for p in ranking)
    assert sum(p['wins'] for p in ranking)==2000
    assert abs(sum(p['elo'] for p in ranking)-2400000)<0.0001
    jobs=[]
    for file in store.glob('*.record'):
        record=json.loads(file.read_text(encoding='utf-8'))
        if record['key'].startswith(f'job:{qid}:'):jobs.append(record['data'])
    assert len(jobs)==2000 and all(j['status']=='DONE' and j['winner'] in (j['a'],j['b']) for j in jobs)
    assert not any('bị xử thua' in j['reason'].lower() or 'biên dịch' in j['reason'].lower() for j in jobs), 'Valid fixture bots failed under load'
    assert len({tuple(sorted((j['a'],j['b']))) for j in jobs})==2000
    cup=api('POST','/api/tournaments/create',{'name':'Stress Main 32','num_teams':32},admin)['tournament']
    api('POST',f'/api/qualifiers/{qid}/actions/promote',{'tournament_id':cup['tournament_id']},admin)
    main=api('GET',f"/api/tournaments/{cup['tournament_id']}")
    assert {t['student_id'] for t in main['teams']}=={p['student_id'] for p in ranking[:32]}
    first=[m for m in main['matches'].values() if m['round_level']==1]
    assert len(first)==16 and all(m['team_a'] and m['team_b'] for m in first)
    report={'bots':2000,'pairing_rounds':2,'real_sandbox_games':2000,'gateway_restart':True,'unique_pairs':2000,'elo_total':sum(p['elo'] for p in ranking),'promoted':32,'seconds':round(time.monotonic()-started,2),'fixture_setup':'Seeded isolated account/submission records; games use real worker and Python sandbox.'}
    output=arena.ROOT/'data'/'qualifier-2000-report.json';output.parent.mkdir(exist_ok=True);output.write_text(json.dumps(report,indent=2),encoding='utf-8')
    print('PASS 2000 REAL BOTS '+json.dumps(report),flush=True)


if __name__=='__main__':
    with tempfile.TemporaryDirectory(prefix='arena-qualifier-') as directory:
        with arena.LocalArena(directory) as server:
            admin=arena.api('POST','/api/admin/login',{'username':'admin','password':arena.PASSWORD})['session_token']
            run_ui(server,admin)
            if '--ui-only' not in sys.argv:run_2000(server,admin)

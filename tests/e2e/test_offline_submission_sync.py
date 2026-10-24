"""Real browser -> offline outbox -> gateway -> sandbox -> stored history."""
import tempfile
import time
from playwright.sync_api import sync_playwright, expect
import test_reliability as arena


def run():
    admin=arena.api('POST','/api/admin/login',{'password':arena.PASSWORD})['session_token']
    event=arena.api('POST','/api/qualifiers',{'name':'Offline recovery','deadline':time.time()+600,'rounds':1,'top_k':8},admin)
    qid=event['id']
    arena.api('POST','/api/teams/register',{'email': 'e2e-team@example.com', 'student_id':'27778888','team_name':'Offline team','password':'offline123'},expected=201)
    token=arena.api('POST','/api/teams/login',{'username':'27778888','password':'offline123'})['session_token']
    arena.api('POST',f'/api/qualifiers/{qid}/register',token=token)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='chrome',headless=True)
        try:
            errors=[]
            page=arena.open_page(browser,errors,[])
            page.locator('#btn-user-auth-action').click()
            page.locator('#inp-login-user').fill('27778888')
            page.locator('#inp-login-pass').fill('offline123')
            page.locator('#btn-login-submit').click()
            page.wait_for_function("currentAppRole==='TEAM'")
            arena.tab(page,'tab-qualifier')
            page.evaluate('(id)=>selectQualifier(id)',qid)
            expect(page.locator('#qualifier-submit')).to_be_enabled()
            assert page.locator('#tab-qualifier .admin-only:visible').count()==0
            assert not page.locator('#qualifier-registration-card').is_visible()
            page.locator('#qualifier-code').fill(arena.CODE)
            page.context.set_offline(True)
            page.locator('#qualifier-submit').click()
            page.wait_for_function('arenaOutbox.rows().length===1')
            assert page.locator('.toast-title').filter(has_text='Nộp bài thành công').count() == 0
            before=arena.api('GET',f'/api/qualifiers/{qid}',token=token)
            assert not before.get('history'),before
            page.context.set_offline(False)
            page.wait_for_function('arenaOutbox.rows().length===0',timeout=30000)
            after=arena.api('GET',f'/api/qualifiers/{qid}',token=token)
            assert len(after['history'])==1,after
            deadline=time.monotonic()+30
            while after['history'][0].get('status')=='QUEUED' and time.monotonic()<deadline:
                time.sleep(.3)
                after=arena.api('GET',f'/api/qualifiers/{qid}',token=token)
            assert len(after['history'])==1 and after['history'][0]['valid'],after
            assert after['participant']['valid_id']==after['history'][0]['id']
            admin_detail=arena.api('GET',f'/api/qualifiers/{qid}?student_id=27778888',token=admin)
            assert admin_detail['history'][0]['code']==arena.CODE
            teams=arena.api('GET',f'/api/qualifiers/{qid}/teams',token=admin)
            assert teams['items'][0]['submitted_at']>0
            arena.api('GET',f'/api/qualifiers/{qid}/teams',token=token,expected=403)
            arena.api('POST','/api/teams/register',{'email': 'e2e-team@example.com', 'student_id':'27778889','team_name':'Other team','password':'offline123'},expected=201)
            other=arena.api('POST','/api/teams/login',{'username':'27778889','password':'offline123'})['session_token']
            private=arena.api('GET',f'/api/qualifiers/{qid}?student_id=27778888',token=other)
            assert not private.get('history'),'team cannot read another team code'
            page.evaluate("token=>{sessionStorage.setItem('arenaSessionToken',token);currentAppRole='ADMIN';updateRoleUI();}",admin)
            page.evaluate('(id)=>openQualifierSubmission(id,"27778888","Offline team")',qid)
            expect(page.locator('#qualifier-submission-code')).to_have_text(arena.CODE)
            page.evaluate("()=>{currentAppRole='TEAM';updateRoleUI();}")
            assert not page.locator('#qualifier-submission-dialog').is_visible()
            assert page.locator('#qualifier-submission-code').inner_text()==''
            assert not errors,errors
            print('PASS offline submit: no server write offline, automatic reconnect, one validated stored submission',flush=True)
        finally:browser.close()


if __name__=='__main__':
    (arena.ROOT/'data').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='arena-offline-sync-',dir=arena.ROOT/'data') as directory:
        with arena.LocalArena(directory):run()

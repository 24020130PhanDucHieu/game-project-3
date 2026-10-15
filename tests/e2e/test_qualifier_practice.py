"""Boss practice with no main tournament, no official result/submission changes."""
import tempfile
import time
from playwright.sync_api import sync_playwright, expect
import test_reliability as arena


def run():
    api = arena.api
    admin = api('POST','/api/admin/login',{'username':'admin','password':arena.PASSWORD})['session_token']
    event = api('POST','/api/qualifiers',{'name':'Practice only','deadline':time.time()+3600,'rounds':2,'top_k':8},admin)
    qid = event['id']
    api('POST','/api/teams/register',{'student_id':'27770001','team_name':'Practice team','password':'practice123'},expected=201)
    token = api('POST','/api/teams/login',{'username':'27770001','password':'practice123'})['session_token']
    api('POST',f'/api/qualifiers/{qid}/register',token=token)
    before = api('GET',f'/api/qualifiers/{qid}',token=token)
    payload = {'code_content':arena.CODE,'language':'PYTHON','side':'team_a'}
    api('POST','/api/bots/practice',payload,expected=401)
    api('POST','/api/bots/practice',{'code_content':''},token,expected=400)
    api('POST','/api/bots/practice',{'code_content':'x'*65537},token,expected=400)
    cpp=api('POST','/api/bots/practice',{'code_content':'#include <iostream>\nint main(){std::cout<<"ROCK";}','language':'CPP','boss':'ADAPTIVE'},token)
    assert cpp['board_steps'] and not any(cpp['simulation']['bot_errors'].values())
    errors=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='chrome',headless=True)
        try:
            page=arena.open_page(browser,errors,[])
            page.locator('#btn-user-auth-action').click()
            page.locator('#inp-login-user').fill('27770001')
            page.locator('#inp-login-pass').fill('practice123')
            page.locator('#btn-login-submit').click()
            page.wait_for_function("currentAppRole === 'TEAM'")
            arena.tab(page,'tab-qualifier')
            page.evaluate('(id) => selectQualifier(id)',qid)
            expect(page.locator('#qualifier-team-card')).to_be_visible()
            assert page.evaluate('!currentTournamentId')
            page.locator('#qualifier-code').fill(arena.CODE)
            for boss in ('RANDOM','AGGRESSIVE','ADAPTIVE'):
                page.locator('#qualifier-boss').select_option(boss)
                with page.expect_response(lambda r:'/api/bots/practice' in r.url) as response:
                    page.locator('#qualifier-practice').click()
                result=response.value.json()
                assert response.value.status==200 and result['board_steps']
                expect(page.locator('#modal-practice-arena')).to_be_visible()
                expect(page.locator('#qualifier-practice')).to_be_enabled()
                page.evaluate('closePracticeArenaModal()')
            page.set_viewport_size({'width':390,'height':900})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
            page.locator('#qualifier-code').fill('bad syntax !')
            page.locator('#qualifier-practice').click()
            expect(page.locator('#qualifier-practice')).to_be_enabled(timeout=15000)
            after=api('GET',f'/api/qualifiers/{qid}',token=token)
            for field in ('participant','history','results'):
                assert after.get(field)==before.get(field),field
            assert api('GET','/api/tournaments/list')==[]
            assert not errors,errors
            print('PASS qualifier Bosses without tournament, auth, size limits, mobile, no official writes',flush=True)
        finally: browser.close()

if __name__=='__main__':
    with tempfile.TemporaryDirectory(prefix='arena-practice-') as directory:
        with arena.LocalArena(directory): run()

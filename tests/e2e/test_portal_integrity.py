"""Disposable local gateway/worker: RBAC, recovery, corrections and real UI."""
import tempfile
from playwright.sync_api import sync_playwright, expect
import test_reliability as arena


def run():
    api = arena.api
    admin = api('POST', '/api/admin/login', {'username': 'admin', 'password': arena.PASSWORD})['session_token']
    cup = api('POST', '/api/tournaments/create', {'name': 'Portal integrity', 'num_teams': 4}, admin)['tournament']
    tid = cup['tournament_id']
    for index in range(4):
        api('POST', f'/api/tournaments/{tid}/teams', {'student_id': str(29970000 + index), 'team_name': f'Integrity {index}'}, admin)
    cup = api('POST', f'/api/tournaments/{tid}/auto-schedule', token=admin)['tournament']
    mid, match = next((key, value) for key, value in cup['matches'].items() if value.get('team_a') and value.get('team_b'))
    sid = match['team_a']['student_id']
    team = api('POST', '/api/teams/login', {'username': sid, 'password': 'k69' + sid})['session_token']
    profile = {'student_id': sid, 'team_name': 'Protected Team', 'preferred_language': 'PYTHON'}
    api('PUT', '/api/teams/profile', profile, expected=401)
    api('POST', f'/api/tournaments/{tid}/matches/{mid}/correction', {}, team, expected=403)
    response = api('POST', '/api/accounts/forgot-password', {'student_id': sid})
    assert 'reset_token' not in response
    profile['student_id'] = match['team_b']['student_id']
    profile['achievements'] = ['Forged champion']
    response = api('PUT', '/api/teams/profile', profile, team)
    assert response['profile']['student_id'] == sid
    assert 'Forged champion' not in (response['profile'].get('achievements') or [])
    arena.check('guest profile writes denied; team cannot correct results or award achievements; recovery token not public')

    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        try:
            page = arena.open_page(browser, errors, [])
            arena.login_page(page, 'admin', arena.PASSWORD)
            arena.choose_match(page, mid)
            participant = arena.open_page(browser, errors, [])
            arena.login_page(participant, sid, 'k69' + sid)
            arena.choose_match(participant, mid)
            page.evaluate('openMatchCorrection()')
            dialog = page.locator('#incident-dialog')
            expect(dialog).to_be_visible()
            for width in (1440, 390):
                page.set_viewport_size({'width': width, 'height': 900})
                assert dialog.evaluate('el => el.scrollWidth <= el.clientWidth + 1')
            dialog.locator('[name=scoreA]').fill('3')
            dialog.locator('[name=scoreB]').fill('1')
            dialog.locator('[name=reason]').fill('Verified by official after incident')
            dialog.locator('button[type=submit]').click()
            expect(dialog).to_have_count(0)
            state = api('GET', f'/api/tournaments/{tid}', token=admin)
            assert state['matches'][mid]['winner'] == 'team_a'
            participant.wait_for_function("currentMatchData?.status === 'COMPLETED' && currentMatchData.team_a.rounds_won === 3", timeout=5000)
            expect(participant.locator('#submission-window-notice')).to_be_visible()
            api('POST', f'/api/tournaments/{tid}/matches/{mid}/code',
                {'side': 'team_a', 'code_content': arena.CODE, 'language': 'PYTHON', 'round_number': 1}, team, expected=400)
            public = api('GET', f'/api/tournaments/{tid}')
            assert '_incident_checkpoint' not in public and 'correction_token' not in public
            page.evaluate('openMatchCorrection()')
            dialog = page.locator('#incident-dialog')
            expect(dialog).to_be_visible()
            dialog.locator('[name=reason]').fill('Restore original state before play')
            dialog.locator('[data-action=rollback]').click()
            expect(dialog).to_have_count(0)
            assert api('GET', f'/api/tournaments/{tid}')['matches'][mid]['status'] != 'COMPLETED'
            participant.wait_for_function("currentMatchData?.status !== 'COMPLETED' && currentMatchData?.round_status === 'AWAITING_SUBMISSIONS'", timeout=5000)
            arena.submit_ui(participant, arena.CODE)
            expect(page.locator('#sub-state-red')).to_have_text('Đã nộp code', timeout=5000)
            submitted = api('GET', f'/api/tournaments/{tid}', token=admin)['matches'][mid]
            assert len(submitted['submissions_history']) == 1
            assert not errors, errors
            arena.check('desktop/mobile incident dialog, progression, rollback, private checkpoint redaction, live Team sync and resumed submission')
        finally:
            browser.close()

    token = api('POST', '/api/accounts/forgot-password', {'student_id': sid}, admin)['reset_token']
    assert len(token) == 32
    api('POST', '/api/accounts/reset-password', {'student_id': sid, 'reset_token': token, 'new_password': 'NewPassword123!'})
    api('PUT', '/api/teams/profile', profile, team, expected=401)
    api('POST', '/api/accounts/reset-password', {'student_id': sid, 'reset_token': token, 'new_password': 'AnotherPassword123!'}, expected=400)
    api('POST', '/api/teams/login', {'username': sid, 'password': 'NewPassword123!'})
    arena.check('admin-assisted password recovery, one-time token, old session revocation, new login')


if __name__ == '__main__':
    (arena.ROOT / 'data').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='arena-integrity-', dir=arena.ROOT / 'data') as directory:
        with arena.LocalArena(directory):
            run()

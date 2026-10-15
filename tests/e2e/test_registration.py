"""Registration, organizer enrollment and deletion against isolated real services."""
import os
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright, expect
import test_reliability as arena


def run(server):
    api = arena.api
    admin = api('POST', '/api/admin/login', {'username': 'admin', 'password': arena.PASSWORD})['session_token']
    api('GET', '/api/admin/accounts', expected=401)
    api('POST', '/api/teams/register', {'student_id': 'admin', 'team_name': 'Invalid', 'password': 'password123'}, expected=400)
    sid, password = '24990001', 'My registered password!'
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        team = arena.open_page(browser, errors, [])
        team.get_by_role('button', name='Đăng ký đội thi', exact=True).first.click()
        team.locator('#register-sid').fill(sid)
        team.locator('#register-name').fill('Registered One')
        team.locator('#register-password').fill(password)
        team.locator('#btn-register-submit').click()
        expect(team.locator('#view-login')).to_be_visible()
        team.locator('#inp-login-pass').fill(password)
        team.locator('#btn-login-submit').click()
        team.wait_for_function("currentAppRole === 'TEAM'")
        team.reload()
        team.wait_for_function("currentAppRole === 'TEAM'")
        expect(team.locator('#user-display-name')).to_have_text('Registered One')
        team_token = team.evaluate("sessionStorage.getItem('arenaSessionToken')")
        api('GET', '/api/admin/accounts', token=team_token, expected=403)
        api('POST', '/api/teams/login', {'username': sid, 'password': 'k69' + sid}, expected=401)
        api('POST', '/api/teams/register', {'student_id': sid, 'team_name': 'Duplicate', 'password': 'password123'}, expected=409)
        cup = api('POST', '/api/tournaments/create', {'name': 'Registered Cup', 'num_teams': 4}, admin)['tournament']
        tid = cup['tournament_id']
        organizer = arena.open_page(browser, errors, [])
        arena.login_page(organizer, 'admin', arena.PASSWORD)
        row = organizer.locator('#tbody-team-credentials tr').filter(has_text=sid)
        expect(row).to_contain_text(password)
        row.get_by_role('button', name='Thêm vào giải đấu').click()
        expect(organizer.locator('#btn-enroll-submit')).to_be_enabled()
        organizer.locator('#enroll-tournament').select_option(tid)
        organizer.locator('#btn-enroll-submit').click()
        expect(organizer.locator('#dialog-enroll-account')).not_to_be_visible()
        assert api('GET', f'/api/tournaments/{tid}/teams')[0]['student_id'] == sid
        api('POST', f'/api/admin/accounts/{sid}/enroll', {'tournament_id': tid}, admin, expected=400)
        api('POST', f'/api/admin/accounts/{sid}/enroll', {'tournament_id': 'missing'}, admin, expected=400)
        for n in range(2, 5):
            other = str(24990000 + n)
            api('POST', '/api/teams/register', {'student_id': other, 'team_name': f'Registered {n}', 'password': 'password123'}, expected=201)
            api('POST', f'/api/admin/accounts/{other}/enroll', {'tournament_id': tid}, admin)
        api('POST', f'/api/tournaments/{tid}/auto-schedule', {}, admin)
        tournament = api('GET', f'/api/tournaments/{tid}')
        match_id = next(mid for mid, match in tournament['matches'].items() if any((match.get(side) or {}).get('student_id') == sid for side in ('team_a', 'team_b')))
        selected = api('POST', f'/api/tournaments/{tid}/matches/{match_id}/select', token=team_token)
        api('POST', f'/api/tournaments/{tid}/matches/{match_id}/login', {'username': sid, 'password': 'k69' + sid}, expected=401)
        api('POST', f'/api/tournaments/{tid}/matches/{match_id}/login', {'username': sid, 'password': password})
        server.restart_gateway()
        assert api('GET', '/api/session', token=selected['session_token'])['student_id'] == sid
        accounts = api('GET', '/api/admin/accounts', token=admin)
        assert next(a for a in accounts if a['student_id'] == sid)['password'] == password
        store = (server.directory / 'accounts_store.json').read_text(encoding='utf-8')
        assert password not in store
        organizer.reload()
        organizer.wait_for_function("currentAppRole === 'ADMIN'")
        row = organizer.locator('#tbody-team-credentials tr').filter(has_text=sid)
        row.get_by_role('button', name='Xóa', exact=True).click()
        organizer.locator('#app-action-dialog').get_by_role('button', name='Xóa tài khoản', exact=True).click()
        expect(row).to_have_count(0)
        api('GET', '/api/session', token=team_token, expected=401)
        api('GET', '/api/session', token=selected['session_token'], expected=401)
        api('POST', '/api/teams/login', {'username': sid, 'password': password}, expected=401)
        api('POST', '/api/teams/register', {'student_id': sid, 'team_name': 'Duplicate', 'password': 'password123'}, expected=409)
        assert not errors, errors
        browser.close()
    print('PASS registration UI, login without tournament, F5, admin privacy, custom password, duplicate prevention, enrollment, match access, restart, encrypted persistence and account deletion')


if __name__ == '__main__':
    with tempfile.TemporaryDirectory(prefix='arena-registration-') as directory:
        with arena.LocalArena(directory) as server:
            run(server)

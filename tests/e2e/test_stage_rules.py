"""Real UI schedule, durable clock guards and alternating board replay."""
import tempfile
import time

from playwright.sync_api import sync_playwright, expect
import test_reliability as arena


def run(server):
    api = arena.api
    admin = api('POST', '/api/admin/login', {'username': 'admin', 'password': arena.PASSWORD})['session_token']
    cup = api('POST', '/api/tournaments/create', {'name': 'Stage Schedule Cup', 'num_teams': 8}, admin)['tournament']
    tid = cup['tournament_id']
    api('PUT', f'/api/tournaments/{tid}/stage-schedule', {'windows': []}, expected=401)
    api('POST', f'/api/tournaments/{tid}/teams/quick-fill', {}, admin)
    api('POST', f'/api/tournaments/{tid}/auto-schedule', {}, admin)
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = arena.open_page(browser, errors, [])
        arena.login_page(page, 'admin', arena.PASSWORD)
        arena.tab(page, 'tab-bracket')
        page.locator('#btn-stage-schedule').click()
        expect(page.locator('#stage-schedule-fields fieldset')).to_have_count(3)
        for index, row in enumerate(page.locator('#stage-schedule-fields fieldset').all()):
            for key, hours in [('starts_at', index * 2 + 1), ('ends_at', index * 2 + 2)]:
                value = page.evaluate('(hours) => localDatetime(Date.now()/1000 + hours*3600)', hours)
                row.locator(f'[data-time="{key}"]').fill(value)
        page.locator('#btn-save-stage-schedule').click()
        expect(page.locator('#dialog-stage-schedule')).not_to_be_visible()
        before = api('GET', f'/api/tournaments/{tid}')['stage_schedule']
        page.reload()
        page.wait_for_function("currentAppRole === 'ADMIN' && currentTournamentData !== null")
        expect(page.locator('#stage-timeline')).to_contain_text('Chưa đến giờ mở vòng')
        page.locator('#btn-stage-schedule').click()
        expect(page.locator('#stage-schedule-fields [data-time="starts_at"]').first).not_to_have_value('')
        page.locator('#dialog-stage-schedule').get_by_role('button', name='Đóng hộp thoại').click()
        mid = 'm_lvl1_1'
        api('POST', f'/api/tournaments/{tid}/matches/{mid}/demo-fill', {}, admin)
        api('POST', f'/api/tournaments/{tid}/matches/{mid}/play-round', {}, admin, expected=400)
        api('PUT', f'/api/tournaments/{tid}/stage-schedule', {'windows': [{'level': 1, 'starts_at': 100, 'ends_at': 200}, {'level': 2, 'starts_at': 150, 'ends_at': 300}]}, admin, expected=400)
        server.restart_gateway()
        assert api('GET', f'/api/tournaments/{tid}')['stage_schedule'] == before
        now = time.time()
        windows = [{'level': 1, 'starts_at': now-60, 'ends_at': now+120},
                   {'level': 2, 'starts_at': now+180, 'ends_at': now+300},
                   {'level': 3, 'starts_at': now+360, 'ends_at': now+480}]
        api('PUT', f'/api/tournaments/{tid}/stage-schedule', {'windows': windows}, admin)
        result = api('POST', f'/api/tournaments/{tid}/matches/{mid}/play-round', {}, admin)
        assert result['winner'] in ('team_a', 'team_b')
        steps = result['board_steps']
        for index, step in enumerate(steps[1:], 1):
            assert step['active_side'] == ('team_a' if index % 2 else 'team_b')
            changes = sum((a['row'], a['col']) != (b['row'], b['col']) for color in ('red_pieces','blue_pieces') for a,b in zip(steps[index-1][color],step[color]))
            assert changes <= 1
        assert result['match']['max_rounds'] == 5
        # A played stage cannot shift its opening, but can extend its closing.
        invalid = [dict(w) for w in windows]
        invalid[0]['starts_at'] -= 10
        api('PUT', f'/api/tournaments/{tid}/stage-schedule', {'windows': invalid}, admin, expected=400)
        windows[0]['ends_at'] += 10
        api('PUT', f'/api/tournaments/{tid}/stage-schedule', {'windows': windows}, admin)
        assert not errors, errors
        browser.close()
    print('PASS stage schedule UI, permissions, overlap validation, F5/restart persistence, early-start guard, played-stage extension, alternating real bot actions, Bo5 and decisive result')


if __name__ == '__main__':
    with tempfile.TemporaryDirectory(prefix='arena-stage-rules-') as directory:
        with arena.LocalArena(directory) as server:
            run(server)

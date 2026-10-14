"""Check registration geometry and submit a real account at desktop/mobile sizes."""
import tempfile
from playwright.sync_api import sync_playwright, expect
import test_reliability as arena


with tempfile.TemporaryDirectory(prefix='arena-registration-') as directory:
    with arena.LocalArena(directory):
        with sync_playwright() as p:
            browser = p.chromium.launch(channel='chrome', headless=True)
            try:
                for width, height in ((1440, 1000), (390, 844)):
                    page = browser.new_page(viewport={'width': width, 'height': height})
                    page.goto(arena.BASE)
                    page.wait_for_function('typeof showRegistrationPage === "function"')
                    page.evaluate('showRegistrationPage()')
                    expect(page.locator('#view-register')).to_be_visible()
                    for field in ('sid', 'name', 'password'):
                        label = page.locator(f'label[for="register-{field}"]').bounding_box()
                        entry = page.locator(f'#register-{field}').bounding_box()
                        assert label['y'] + label['height'] <= entry['y'], (label, entry)
                        assert entry['x'] >= 0 and entry['x'] + entry['width'] <= width
                    buttons = page.locator('#form-register button').all()
                    for previous, following in zip(buttons, buttons[1:]):
                        a, b = previous.bounding_box(), following.bounding_box()
                        assert a['y'] + a['height'] < b['y']
                    assert page.locator('#btn-bracket-menu-opts').count() == 0
                    page.locator('#register-sid').fill(f'layout{width}')
                    page.locator('#register-name').fill(f'Layout Team {width}')
                    page.locator('#register-password').fill('layout-test-password')
                    with page.expect_response(lambda r: '/api/teams/register' in r.url) as response:
                        page.locator('#btn-register-submit').click()
                    assert response.value.ok, response.value.text()
                    page.close()
                    print(f'PASS registration layout and submission {width}x{height}', flush=True)
            finally:
                browser.close()

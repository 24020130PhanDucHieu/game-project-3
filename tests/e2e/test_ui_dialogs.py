"""Browser checks for sidebar bounds and in-app confirmation/input behavior."""
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import test_reliability as arena


with tempfile.TemporaryDirectory(prefix='arena-ui-dialogs-') as directory:
    with arena.LocalArena(directory):
        with sync_playwright() as p:
            browser = p.chromium.launch(channel='chrome', headless=True)
            try:
                page = browser.new_page(viewport={'width':1440, 'height':1000})
                native = []
                page.on('dialog', lambda dialog: (native.append(dialog.type), dialog.dismiss()))
                page.goto(arena.BASE)
                page.wait_for_function('window.arenaReady !== undefined')
                page.evaluate('() => window.arenaReady')
                for width in (280, 240, 215):
                    page.locator('#app-sidebar').evaluate('(el,w) => el.style.width = w+"px"', width)
                    for selector in ('.guest-card-actions', '.guest-card-actions button', '.guest-meta'):
                        for element in page.locator(selector).all():
                            assert element.evaluate('(el) => el.scrollWidth <= el.clientWidth + 1'), selector
                    buttons = page.locator('.guest-card-actions button')
                    a, b = buttons.nth(0).bounding_box(), buttons.nth(1).bounding_box()
                    assert a['y'] + a['height'] <= b['y']
                page.locator('#btn-user-auth-action').focus()
                page.evaluate('window.answer="pending"; void confirmAction("Xóa <img src=x onerror=alert(1)>?", {title:"Xóa giải đấu",confirmText:"Xóa giải",danger:true}).then(v=>window.answer=v)')
                modal = page.locator('#app-action-dialog')
                expect(modal).to_be_visible()
                assert modal.locator('img').count() == 0
                page.keyboard.press('Escape')
                page.wait_for_function('window.answer === false')
                expect(page.locator('#btn-user-auth-action')).to_be_focused()
                page.evaluate('window.answer="pending"; void confirmAction("Xác nhận thao tác?").then(v=>window.answer=v)')
                modal.locator('.app-action-cancel').click()
                page.wait_for_function('window.answer === false')
                page.evaluate('window.answer=null; void confirmAction("Đồng ý thực hiện?").then(v=>window.answer=v)')
                modal.locator('.app-action-submit').click()
                page.wait_for_function('window.answer === true')
                page.evaluate('window.answer="pending"; void promptAction("Nhập địa chỉ máy chủ", "https://example.com").then(v=>window.answer=v)')
                expect(modal.locator('input')).to_have_value('https://example.com')
                modal.locator('input').fill('https://new.example.com')
                page.keyboard.press('Enter')
                page.wait_for_function('window.answer === "https://new.example.com"')
                page.evaluate('window.answer="pending"; void promptAction("Địa chỉ").then(v=>window.answer=v)')
                modal.locator('.app-action-close').click()
                page.wait_for_function('window.answer === null')
                page.set_viewport_size({'width':390, 'height':844})
                page.evaluate('void confirmAction("Tên giải rất dài " .repeat(30), {title:"Xóa giải đấu",confirmText:"Xóa giải",danger:true})')
                box = modal.bounding_box()
                assert box['x'] >= 0 and box['x'] + box['width'] <= 390
                assert modal.evaluate('(el) => el.scrollWidth <= el.clientWidth')
                Path('data/ui-review').mkdir(parents=True, exist_ok=True)
                page.screenshot(path='data/ui-review/confirmation-mobile.png')
                page.keyboard.press('Escape')
                page.set_viewport_size({'width':1440, 'height':1000})
                page.locator('#sidebar-user-card').screenshot(path='data/ui-review/guest-card.png')
                assert not native, native
                print('PASS sidebar bounds, confirmation accept/cancel/Escape, input, focus, escaped content and mobile dialog', flush=True)
            finally:
                browser.close()

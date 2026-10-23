"""Exercise the released Next.js page against a disposable real Go API."""
import tempfile

from playwright.sync_api import expect, sync_playwright

import test_reliability as arena


def run():
    errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        try:
            page = browser.new_page(viewport={"width": 390, "height": 844})
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(arena.BASE)
            expect(page.get_by_role("heading", name="Tổng quan")).to_be_visible()
            assert page.locator('script[src*="/_next/"]').count() > 0
            assert page.locator("#arena-live-portal").count() == 0

            page.get_by_role("button", name="Đăng ký", exact=True).click()
            expect(page.get_by_role("heading", name="Đăng ký đội thi")).to_be_visible()
            registration = page.locator("form").first
            registration.locator("input").nth(0).fill("29971111")
            registration.locator("input").nth(1).fill("Next Portal Team")
            registration.locator("input").nth(2).fill("verification-password")
            with page.expect_response(lambda response: "/api/teams/register" in response.url) as registered:
                registration.get_by_role("button", name="Hoàn tất đăng ký").click()
            assert registered.value.ok, registered.value.text()

            expect(page.get_by_role("heading", name="Đăng nhập")).to_be_visible()
            page.locator("#inp-login-user").fill("29971111")
            page.locator("#inp-login-pass").fill("verification-password")
            with page.expect_response(lambda response: "/api/teams/login" in response.url) as logged_in:
                page.locator("form").first.get_by_role("button", name="Đăng nhập").click()
            assert logged_in.value.ok, logged_in.value.text()
            expect(page.get_by_role("button", name="Đăng xuất")).to_be_visible()
            expect(page.locator("header")).to_contain_text("TEAM")
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            assert not errors, errors
            print("PASS Next portal: real registration, login and mobile layout", flush=True)

            admin = browser.new_page()
            admin.on("pageerror", lambda error: errors.append(str(error)))
            admin.goto(arena.BASE)
            admin.get_by_role("button", name="Đăng nhập", exact=True).click()
            admin.locator("#inp-login-user").fill("ADMIN")
            admin.locator("#inp-login-pass").fill(arena.PASSWORD)
            with admin.expect_response(lambda response: "/api/admin/login" in response.url) as admin_login:
                admin.locator("form").first.get_by_role("button", name="Đăng nhập").click()
            assert admin_login.value.ok, admin_login.value.text()
            expect(admin.locator("header")).to_contain_text("ADMIN")
            expect(admin.get_by_role("button", name="Quản trị", exact=True)).to_be_visible()
            assert not errors, errors
            print("PASS Next portal: real admin login and role gated navigation", flush=True)
        finally:
            browser.close()


if __name__ == "__main__":
    (arena.ROOT / "data").mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="arena-next-", dir=arena.ROOT / "data") as directory:
        with arena.LocalArena(directory):
            run()

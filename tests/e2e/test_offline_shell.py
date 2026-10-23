"""Build frontend first; verifies an actual service-worker reload without network."""
import functools
import http.server
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'application/javascript', '.css': 'text/css'}
    def log_message(self, *args):
        pass


root = Path(__file__).resolve().parents[2] / 'frontend' / 'dist'
server = http.server.ThreadingHTTPServer(
    ('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(root)))
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        context = browser.new_context()
        # Isolate the test from production and external CDN services.
        context.route('https://**/*', lambda route: route.fulfill(
            status=200, content_type='application/json', body='[]'))
        page = context.new_page()
        page.goto(f'http://127.0.0.1:{server.server_port}', wait_until='domcontentloaded')
        page.evaluate("navigator.serviceWorker.register('/sw.js').then(()=>navigator.serviceWorker.ready)")
        page.wait_for_function('navigator.serviceWorker.controller !== null')
        context.set_offline(True)
        page.reload(wait_until='domcontentloaded')
        page.wait_for_function("typeof arenaOutbox !== 'undefined' && typeof arenaOutbox.submit === 'function'")
        assert page.locator('body').inner_text().strip()
        assert page.evaluate("typeof arenaOutbox.submit === 'function'")
        print('PASS Chromium: app reloads offline with submission module available')
        browser.close()
finally:
    server.shutdown()

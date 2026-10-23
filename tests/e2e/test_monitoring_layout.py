"""Isolated browser regression for monitoring data and responsive board geometry."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome")
    page = browser.new_page()
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))
    page.set_content((ROOT / "frontend-cu/templates/pages/admin.html").read_text(encoding="utf-8"))
    page.add_script_tag(content="var currentAppRole='ADMIN'; var API_BASE='https://example.test';")
    page.add_script_tag(content=(ROOT / "frontend-cu/static/js/admin/accounts.js").read_text(encoding="utf-8"))
    page.evaluate("""() => { window.fetch = async () => ({ok:true,json:async()=>({
      worker_pool:{status:'DEGRADED',ready:1,total:2,nodes:[{name:'Judge 1',status:'READY',host:'private',active:1,capacity:1,latency_ms:3}]},
      server:{cpu_cores:2,goroutines:10,memory_alloc_mb:8.5,uptime_seconds:60,gc_cycles:2},
      database:{status:'READY'},queue:{status:'READY',counts:{validation_QUEUED:3}},
      contest:{enrolled_teams:2,submitted_teams:1,total_registered_accounts:2,total_tournaments:1,unsubmitted_count:1,unsubmitted_teams:['<img src=x onerror=alert(1)>']}
    })}); }""")
    page.evaluate("fetchAdminMonitoringData()")
    assert "1/2" in page.locator("#monitor-worker-status").inner_text()
    assert "Cập nhật" in page.locator("#monitor-last-updated").inner_text()
    assert "42 ms" not in page.locator("#monitor-nodes").inner_text()
    assert "13.250.49.111" not in page.locator("#monitor-nodes").inner_text()
    assert page.locator("#monitor-unsubmitted-list img").count() == 0
    page.evaluate("() => { window.fetch = async () => {throw new Error('offline')}; }")
    page.evaluate("fetchAdminMonitoringData()")
    assert page.locator("#monitor-server-status").inner_text() == "Chưa xác minh"
    assert not errors, errors
    page.set_content('<div class="realtime-board-card"><div class="chessboard-9x9" id="realtime-chessboard-9x9">' + ''.join('<div class="board-cell"></div>' for _ in range(81)) + '</div></div>')
    for css in ["arena.css", "battle-presentation.css"]:
        page.add_style_tag(content=(ROOT / "frontend-cu/static/css" / css).read_text(encoding="utf-8"))
    for width in [390, 768, 1440]:
        page.set_viewport_size({"width":width,"height":900})
        board = page.locator("#realtime-chessboard-9x9").bounding_box()
        last = page.locator(".board-cell").last.bounding_box()
        assert abs(board['width']-board['height']) < 2
        assert abs(last['x']+last['width']-(board['x']+board['width']-6)) < 3
        assert abs(last['y']+last['height']-(board['y']+board['height']-6)) < 3
        assert board['x']+board['width'] <= width
    browser.close()
print('PASS: monitoring success/failure/XSS and board at 390/768/1440px')

# Frontend structure and icon update — 2026-10-12

## Source layout

- HTML: a 55-line layout template plus pages, reusable partials and modals. Largest page: 233 lines.
- JavaScript: 35 ordered application scripts and one compatibility template loader; largest file: 377 lines.
- CSS: 19 files, split by component/page; largest file: 340 lines.
- Shared local SVG symbols, colored team avatars, podium medals, navigation/action icons and final-round trophy.
- Go renders the templates directly. The Python builder generates `frontend/dist` for static hosting. A small root entry supports existing hosts still publishing `frontend/`.

## Checks completed

- Existing Go tests and server build passed.
- Syntax checks passed for the split application JavaScript. Each CSS file has balanced rule blocks.
- Existing Chrome reliability suite completed all 19 groups: Admin and two teams, login/F5, selecting matches, drafts/submissions/realtime, server restart, rounds, replay, source privacy, tournament deletion and a complete four-team tournament.
- Separate Chrome preview checked local SVG rendering, six navigation icons, three metric icons, colored ranking/bracket avatars, medal ranks, and screenshots at desktop/tablet/phone sizes. Overview cards fit within the phone viewport.
- Legacy static hosting entry successfully assembled templates, connected WebSocket, logged in Admin, selected a match and retained the session/match across F5.
- No JavaScript exceptions or failed JS/CSS asset requests in the preview checks.
- `python scripts/build_frontend.py` completed successfully; `git diff --check` passed.

The first reliability run encountered a Windows JSON-file rename lock near the final match. A second full run completed all scenarios. JSON storage logic was not changed as part of this frontend refactor.

All tournament mutations used temporary local fixtures. Preview names/scores are test data; no fake standings were added to the application. Production data was not modified during these checks.

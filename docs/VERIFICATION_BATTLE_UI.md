# Battle UI update — 2026-10-12

- Removed the duplicate scrolling journal inside the realtime board.
- Live Action now displays the current event, replay step and remaining pieces in a compact card.
- A single journal below the boards presents moves, bot execution and system events as separate rows, with escaped content and local SVG move chips.
- Board, replay and practice pieces use fist/palm/scissors symbols with accessible labels and a visible legend.
- Modals use one accessible X in the header; redundant footer close buttons and their listeners were removed.
- Studio toolbar uses compact “Nạp mẫu” and “Kiểm tra” controls, retaining the actual template loader and sandbox validation.
- Branding labels use BOT K69; the browser title is BOT ARENA K69. Existing tournament/team names in stored data are unchanged.
- Admin replay stays independent of the realtime board. Team live-board step indicators follow the displayed step until a replay is selected.

## Verification

- Existing 19-group Chrome reliability suite passed with the updated modal close selectors.
- Actual local battle preview checked move glyphs, structured log tabs, modal X, template loading and sandbox validation; no JavaScript exceptions.
- Captured desktop and phone studio previews and Admin battle/journal previews.
- Confirmed log text containing HTML is escaped while supported move tokens render as SVG chips.
- JavaScript syntax checks, static frontend build and diff whitespace checks passed.

All test mutations used isolated temporary local tournaments. Hosted tournament data was not modified.

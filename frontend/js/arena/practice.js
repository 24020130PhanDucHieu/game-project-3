// =============================================================================
// PRACTICE ARENA SIMULATOR - 9x9 TACTICAL BOARD AGAINST BOSS BOTS
// =============================================================================

export function initPracticeArena() {
  const gridContainer = document.getElementById('practice-chessboard');
  if (!gridContainer) return;

  // Render 9x9 grid
  let html = '';
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      html += `<div class="board-cell" data-row="${r}" data-col="${c}"></div>`;
    }
  }
  gridContainer.innerHTML = html;
}

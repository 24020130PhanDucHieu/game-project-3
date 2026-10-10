// =============================================================================
// MATCH REPLAY VIEWER MODULE
// =============================================================================

export function openReplayModal(matchData) {
  const modal = document.getElementById('modal-match-replay');
  if (!modal || !matchData) return;

  const title = modal.querySelector('#replay-match-title');
  if (title) title.textContent = `Xem lại trận đấu: ${matchData.match_id}`;

  const logsContainer = modal.querySelector('#replay-rounds-container');
  if (logsContainer) {
    const rounds = matchData.rounds || [];
    if (rounds.length === 0) {
      logsContainer.innerHTML = '<div class="empty-state">Trận đấu chưa có dữ liệu hiệp nào.</div>';
    } else {
      logsContainer.innerHTML = rounds.map((r, idx) => `
        <div class="replay-round-item">
          <div class="round-badge">Hiệp ${idx + 1}</div>
          <div class="round-moves">
            <span>Đội A: <strong>${r.team_a_move || 'Chưa ra'}</strong></span>
            <span>vs</span>
            <span>Đội B: <strong>${r.team_b_move || 'Chưa ra'}</strong></span>
          </div>
          <div class="round-outcome">Kết quả: ${r.result || 'Hòa'}</div>
        </div>
      `).join('');
    }
  }

  modal.classList.add('active');
}

// =============================================================================
// BRACKET VISUALIZER MODULE - N-TEAM TOURNAMENT TREE
// =============================================================================

export function renderTournamentBracket(tournamentData, onMatchClick) {
  const container = document.getElementById('bracket-tree-container');
  if (!container || !tournamentData) return;

  const matches = tournamentData.matches || [];
  if (matches.length === 0) {
    container.innerHTML = '<div class="empty-state">Chưa có lịch thi đấu. Nhấn "Quản Lý Đội" để bốc thăm tự động.</div>';
    return;
  }

  // Group matches by round
  const rounds = {};
  matches.forEach(m => {
    const r = m.round_number || 1;
    if (!rounds[r]) rounds[r] = [];
    rounds[r].push(m);
  });

  let html = '<div class="bracket-grid">';
  Object.keys(rounds).sort((a,b) => a-b).forEach(rNum => {
    html += `<div class="bracket-round-column">
      <div class="round-header">Vòng ${rNum}</div>
      <div class="round-matches-list">`;
    rounds[rNum].forEach(m => {
      const teamAName = m.team_a ? m.team_a.team_name : 'TBD';
      const teamBName = m.team_b ? m.team_b.team_name : 'TBD';
      const winner = m.winner ? `(Thắng: ${m.winner})` : '';
      html += `
        <div class="bracket-match-card" data-match-id="${m.match_id}">
          <div class="match-teams">
            <div class="team-row ${m.winner === (m.team_a && m.team_a.team_name) ? 'winner' : ''}">${teamAName}</div>
            <div class="team-row ${m.winner === (m.team_b && m.team_b.team_name) ? 'winner' : ''}">${teamBName}</div>
          </div>
          <div class="match-status-pill ${m.status.toLowerCase()}">${m.status} ${winner}</div>
        </div>`;
    });
    html += `</div></div>`;
  });
  html += '</div>';

  container.innerHTML = html;

  if (onMatchClick) {
    container.querySelectorAll('.bracket-match-card').forEach(card => {
      card.addEventListener('click', () => {
        const mId = card.getAttribute('data-match-id');
        onMatchClick(mId);
      });
    });
  }
}

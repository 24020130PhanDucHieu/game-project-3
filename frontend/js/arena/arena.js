// =============================================================================
// ARENA VISUAL DUEL ENGINE - LIVE HUD & HP MONITOR
// =============================================================================

import { PIECE_ICONS } from '../core/constants.js';

export function updateArenaHUD(match) {
  if (!match) return;

  const teamAName = document.getElementById('arena-team-a-name');
  const teamBName = document.getElementById('arena-team-b-name');
  const teamAHp = document.getElementById('arena-team-a-hp');
  const teamBHp = document.getElementById('arena-team-b-hp');
  const teamABar = document.getElementById('arena-team-a-hp-bar');
  const teamBBar = document.getElementById('arena-team-b-hp-bar');

  if (teamAName && match.team_a) teamAName.textContent = match.team_a.team_name;
  if (teamBName && match.team_b) teamBName.textContent = match.team_b.team_name;

  const hpA = match.team_a_hp !== undefined ? match.team_a_hp : 100;
  const hpB = match.team_b_hp !== undefined ? match.team_b_hp : 100;

  if (teamAHp) teamAHp.textContent = `${hpA} HP`;
  if (teamBHp) teamBHp.textContent = `${hpB} HP`;

  if (teamABar) teamABar.style.width = `${Math.max(0, hpA)}%`;
  if (teamBBar) teamBBar.style.width = `${Math.max(0, hpB)}%`;
}

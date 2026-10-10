// =============================================================================
// MATCH MODULE - 5-ROUND PROGRESSION & REFEREE CONTROLS
// =============================================================================

import { state } from '../core/state.js';
import { ApiClient } from '../api/client.js';

export async function playRound(tournamentId, matchId) {
  return await ApiClient.post(`/api/tournaments/${tournamentId}/matches/${matchId}/play-round`);
}

export async function advanceNextRound(tournamentId, matchId) {
  return await ApiClient.post(`/api/tournaments/${tournamentId}/matches/${matchId}/next-round`);
}

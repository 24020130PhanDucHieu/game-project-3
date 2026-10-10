// =============================================================================
// TOURNAMENT MODULE - LIFECYCLE, TEAMS & BRACKET MANAGEMENT
// =============================================================================

import { state, persistSessionState } from '../core/state.js';
import { ApiClient } from '../api/client.js';

export async function fetchTournamentsList() {
  return await ApiClient.get('/api/tournaments/list');
}

export async function fetchTournamentDetail(id) {
  const data = await ApiClient.get(`/api/tournaments/${id}`);
  state.currentTournamentId = id;
  state.currentTournamentData = data;
  persistSessionState();
  return data;
}

export async function createTournament(name, numTeams) {
  return await ApiClient.post('/api/tournaments/create', { name, num_teams: numTeams });
}

export async function quickFillTeams(tournamentId) {
  return await ApiClient.post(`/api/tournaments/${tournamentId}/teams/quick-fill`);
}

export async function autoSchedule(tournamentId) {
  return await ApiClient.post(`/api/tournaments/${tournamentId}/auto-schedule`);
}

// =============================================================================
// AUTH MODULE - TEAM MATCH LOGIN & CREDENTIAL VERIFICATION
// =============================================================================

import { state, persistSessionState } from '../core/state.js';
import { ApiClient } from '../api/client.js';

export async function loginToMatch(tournamentId, matchId, studentId, password) {
  try {
    const res = await ApiClient.post(`/api/tournaments/${tournamentId}/matches/${matchId}/login`, {
      student_id: studentId,
      password: password
    });

    state.currentActiveMatchId = matchId;
    persistSessionState();
    return res;
  } catch (err) {
    throw err;
  }
}

export function logoutFromMatch() {
  state.currentActiveMatchId = null;
  state.currentUserRole = null;
  state.currentStudioSide = null;
  sessionStorage.removeItem("activeMatchId");
  sessionStorage.removeItem("userRole");
  sessionStorage.removeItem("studioSide");
}

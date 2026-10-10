// =============================================================================
// GLOBAL APPLICATION STATE
// =============================================================================

export const state = {
  currentTournamentId: null,
  currentTournamentData: null,
  currentActiveMatchId: null,
  currentMatchData: null,
  currentStudioSide: null, // "team_a" hoặc "team_b"
  currentUserRole: null, // "ADMIN", "TEAM_A", "TEAM_B"
  pendingLoginMatchId: null,
  practiceSimTimer: null,
  practiceSimCancelToken: false,
  allTeamsCache: [],
  isMatchRunning: false,
};

export function restoreSessionState() {
  const savedTourn = sessionStorage.getItem("activeTournamentId");
  const savedMatch = sessionStorage.getItem("activeMatchId");
  const savedRole = sessionStorage.getItem("userRole");
  const savedSide = sessionStorage.getItem("studioSide");

  if (savedTourn) state.currentTournamentId = savedTourn;
  if (savedMatch) state.currentActiveMatchId = savedMatch;
  if (savedRole) state.currentUserRole = savedRole;
  if (savedSide) state.currentStudioSide = savedSide;
}

export function persistSessionState() {
  if (state.currentTournamentId) sessionStorage.setItem("activeTournamentId", state.currentTournamentId);
  if (state.currentActiveMatchId) sessionStorage.setItem("activeMatchId", state.currentActiveMatchId);
  if (state.currentUserRole) sessionStorage.setItem("userRole", state.currentUserRole);
  if (state.currentStudioSide) sessionStorage.setItem("studioSide", state.currentStudioSide);
}

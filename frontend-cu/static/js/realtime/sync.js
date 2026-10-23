// =============================================================================
// KÊNH ĐỒNG BỘ REALTIME ĐA TAB & TIÊU ĐIỂM CỬA SỔ (CROSS-TAB INSTANT SYNC)
// =============================================================================
let arenaSyncChannel = null;
function setupCrossTabSync() {
  try {
    arenaSyncChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("arena_cross_tab_sync") : null;
    if (arenaSyncChannel) {
      arenaSyncChannel.onmessage = (ev) => {
        if (ev.data && (ev.data.type === "CODE_SUBMITTED" || ev.data.type === "MATCH_UPDATED")) {
          if (currentTournamentId && !isMatchRunning) {
            loadActiveTournamentSilent(currentTournamentId);
          }
        }
      };
    }
  } catch (e) {}

  // Lắng nghe sự kiện storage (hoạt động xuyên tab trên cùng domain)
  window.addEventListener("storage", (e) => {
    if (e.key === "ARENA_CROSS_TAB_EVENT" && currentTournamentId && !isMatchRunning) {
      loadActiveTournamentSilent(currentTournamentId);
    }
  });

  // Khi chuyển tab (Admin <-> Thí sinh) hoặc khi cửa sổ nhận lại tiêu điểm (focus) -> Cập nhật tức thì
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && currentTournamentId && !isMatchRunning) {
      loadActiveTournamentSilent(currentTournamentId);
    }
  });
  window.addEventListener("focus", () => {
    if (currentTournamentId && !isMatchRunning) {
      loadActiveTournamentSilent(currentTournamentId);
    }
  });
}

function broadcastCrossTabSync(type = "CODE_SUBMITTED") {
  try {
    if (arenaSyncChannel) {
      arenaSyncChannel.postMessage({ type, timestamp: Date.now() });
    }
    localStorage.setItem("ARENA_CROSS_TAB_EVENT", Date.now().toString());
  } catch (err) {}
}


// =============================================================================
// 4. BÀN ĐẤU CHI TIẾT & ĐIỀU HÀNH TRẬN ĐẤU (ARENA VIEW)
// =============================================================================
function connectActiveMatchSocket(matchId) {
  const tournamentId = currentTournamentId;
  if (!tournamentId) return;
  if (matchSocket?.arenaTournamentId === tournamentId && [WebSocket.OPEN, WebSocket.CONNECTING].includes(matchSocket.readyState)) return;
  if (matchSocketRetry) clearTimeout(matchSocketRetry);
  if (matchSocket) { matchSocket.onclose = null; matchSocket.close(); }
  const base = new URL(API_BASE, window.location.href);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = `/ws/tournaments/${encodeURIComponent(tournamentId)}`; base.search = "";
  const socket = new WebSocket(base.toString()); socket.arenaTournamentId = tournamentId; matchSocket = socket;
  socket.onopen = () => loadActiveTournamentSilent(tournamentId);
  socket.onmessage = async event => {
    try {
      const payload = JSON.parse(event.data);
      if (["ROUND_RUNNING", "MATCH_UPDATED", "TOURNAMENT_UPDATED"].includes(payload.type) && currentTournamentId === payload.tournament_id) await loadActiveTournamentSilent(tournamentId);
    } catch (error) { console.warn("Invalid match event", error); }
  };
  socket.onclose = () => { if (matchSocket === socket && currentTournamentId === tournamentId) matchSocketRetry = setTimeout(() => connectActiveMatchSocket(currentActiveMatchId), 1500); };
  socket.onerror = () => socket.close();
}

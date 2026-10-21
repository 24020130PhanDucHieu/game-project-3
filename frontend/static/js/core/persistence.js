// KHỞI ĐỘNG ỨNG DỤNG KHI TẢI TRANG
// =============================================================================
async function restoreArenaSession() {
  if (!sessionStorage.getItem("arenaSessionToken")) return;
  try {
    const response = await fetch(`${API_BASE}/api/session`, { cache: "no-store" });
    if (!response.ok) return;
    const session = await response.json();
    currentAppRole = currentUserRole = session.role === "ADMIN" ? "ADMIN" : "TEAM";
    currentTeamStudentId = session.student_id || (currentAppRole === "ADMIN" ? "ADMIN" : "");
    currentTeamName = session.team_name || (currentAppRole === "ADMIN" ? "Ban Tổ Chức" : currentTeamName);
    if (currentAppRole === "TEAM") {
      if (!currentTournamentId) currentTournamentId = session.tournament_id;
      if (!currentActiveMatchId && currentTournamentId === session.tournament_id) currentActiveMatchId = session.match_id;
      currentStudioSide = session.side || currentStudioSide;
    }
    updateRoleUI();
  } catch { console.warn("Chưa kiểm tra được phiên. Giữ phiên để thử lại khi kết nối trở lại."); }
}
async function loadArenaCapabilities() {
  try {
    const response = await fetch(`${API_BASE}/api/capabilities`);
    if (!response.ok) return;
    const capabilities = await response.json();
    document.querySelectorAll('#studio-sel-lang option[value="CPP"]').forEach(option => {
      option.disabled = !capabilities.languages.includes("CPP");
      option.textContent = option.disabled ? "C++ 17 (máy chủ chưa hỗ trợ)" : "C++ 17 (.cpp)";
    });
  } catch {}
}
function arenaViewKey() { return `arena-view:${API_BASE}:${currentTeamStudentId || currentAppRole}:${currentTournamentId || "none"}:${currentActiveMatchId || "none"}`; }
function readArenaViewState() { try { return JSON.parse(localStorage.getItem(arenaViewKey()) || "{}"); } catch { return {}; } }
function saveArenaViewState(patch) { localStorage.setItem(arenaViewKey(), JSON.stringify({ ...readArenaViewState(), ...patch })); }
function restoreMatchViewState() {
  const state = readArenaViewState();
  if (state.logTab) {
    document.querySelectorAll(".log-tab-btn").forEach(button => {
      const active = button.dataset.logTab === state.logTab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll(".log-pane").forEach(pane => pane.classList.toggle("active", pane.id === state.logTab));
  }
}
function inlineReplayRecord(match) {
  const history = match?.rounds_history || [];
  const state = readArenaViewState();
  return history.find(round => round.round_number === state.inlineRound) || history[history.length - 1];
}
let currentEditorKey = "";
let liveRoundTimer = null;
let liveRoundKey = "";
function syncLiveRoundBoard(match) {
  const record = match.rounds_history?.[match.rounds_history.length - 1];
  const key = `${currentTournamentId}:${currentActiveMatchId}:${currentAppRole}:${match.round_status}:${match.battle_running}:${match.all_teams_ready}:${record?.round_number}:${match.intermission_ends_at}`;
  if (key === liveRoundKey) return;
  liveRoundKey = key;
  clearInterval(liveRoundTimer);
  let drawnIndex = -1;
  const draw = () => {
    const countdown = document.getElementById("countdown-num");
    if (countdown && match.intermission_ends_at) countdown.textContent = Math.max(0, Math.ceil(match.intermission_ends_at - Date.now() / 1000));
    if (!record?.board_steps?.length) { renderLiveAction(match, null, null); return; }
    const steps = record.board_steps;
    const intermissionDuration = 25;
    const progress = match.round_status === "ROUND_FINISHED" ? Math.max(0, Math.min(1, (Date.now() / 1000 - (match.intermission_ends_at - intermissionDuration)) / intermissionDuration)) : 1;
    const index = Math.min(steps.length - 1, Math.floor(progress * steps.length));
    if (index === drawnIndex) { if (progress === 1) clearInterval(liveRoundTimer); return; }
    drawnIndex = index;
    const step = steps[index];
    const stepTiles = step.mystery_tiles || record?.mystery_tiles;
    if (currentAppRole === "ADMIN") {
      if (typeof realtimePlaybackTimer === "undefined" || realtimePlaybackTimer === null) {
        renderRealtimeChessboard(step.red_pieces, step.blue_pieces, step.clash_event, stepTiles);
        const slider = document.getElementById("realtime-step-slider");
        if (slider) { slider.max = steps.length - 1; slider.value = index; }
        const label = document.getElementById("realtime-timeline-step-label");
        if (label) label.textContent = `Bước ${index + 1} / ${steps.length}`;
      }
    }
    if (currentAppRole === 'TEAM' || (currentAppRole !== "ADMIN" && !readArenaViewState().inlineRound)) {
      inlinePlaybackCurrentIdx = index;
      renderChessboard(step.red_pieces, step.blue_pieces, step.clash_event, stepTiles);
      const indicator = document.getElementById("playback-step-indicator");
      if (indicator) indicator.textContent = `Hiệp ${record.round_number}: Bước ${index + 1} / ${steps.length}`;
      setBattleCommentary(document.getElementById("arena-commentary-ticker"), step.log);
    }
    if (currentAppRole !== "ADMIN" || typeof realtimePlaybackTimer === "undefined" || realtimePlaybackTimer === null) {
      renderLiveAction(match, record, step, index);
      renderCategorizedLogs(record, index);
    }
    if (progress === 1) clearInterval(liveRoundTimer);
  };
  draw();
  if (match.round_status === "ROUND_FINISHED" && match.intermission_ends_at > Date.now() / 1000) liveRoundTimer = setInterval(draw, 100);
}
function studioDraftKey() { return `${arenaViewKey()}:draft:${currentStudioSide || "none"}`; }
function saveStudioDraft() {
  const editor = document.getElementById("studio-code-editor");
  const language = document.getElementById("studio-sel-lang");
  if (!editor || !language || currentEditorKey !== studioDraftKey()) return;
  localStorage.setItem(currentEditorKey, JSON.stringify({ code: editor.value, language: language.value, explanation:document.getElementById('studio-rule-note')?.value || '', scroll: editor.scrollTop, selectionStart: editor.selectionStart, selectionEnd: editor.selectionEnd }));
}
function tabScrollKey(tab) { return `arena-scroll:${API_BASE}:${currentTeamStudentId || currentAppRole}:${tab}`; }
function saveTabScroll() {
  const tab = document.querySelector(".tab-pane.active")?.id;
  if (tab) sessionStorage.setItem(tabScrollKey(tab), String(window.scrollY));
  saveStudioDraft();
}

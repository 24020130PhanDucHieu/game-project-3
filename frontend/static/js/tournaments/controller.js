// 2. QUẢN LÝ ĐA GIẢI ĐẤU (TOURNAMENT MANAGEMENT)
// =============================================================================
function setupTournamentControls() {
  const btnRefresh = document.getElementById("btn-refresh-tourn");
  const btnBackBracket = document.getElementById("btn-back-to-bracket");
  const btnVictoryBack = document.getElementById("btn-victory-back-tree");
  const btnTeamMgr = document.getElementById("btn-open-team-manager");

  if (btnRefresh) {
    btnRefresh.addEventListener("click", () => {
      if (currentTournamentId) loadActiveTournament(currentTournamentId);
    });
  }

  if (btnBackBracket) {
    btnBackBracket.addEventListener("click", () => {
      switchToBracketView();
    });
  }

  if (btnVictoryBack) {
    btnVictoryBack.addEventListener("click", () => {
      switchToBracketView();
      if (currentTournamentId) loadActiveTournament(currentTournamentId);
    });
  }

  if (btnTeamMgr) {
    btnTeamMgr.addEventListener("click", () => {
      openTeamManagerModal();
    });
  }

  const btnOpenTeamMgrBracket = document.getElementById("btn-open-team-mgr-bracket");
  if (btnOpenTeamMgrBracket) {
    btnOpenTeamMgrBracket.addEventListener("click", () => {
      if (currentAppRole !== "ADMIN") {
        notifyWarning("Quyền Hạn Ban Tổ Chức", "Chỉ Ban Tổ Chức (Admin) mới có quyền thêm, xóa và sắp xếp các đội thi đấu!");
        return;
      }
      openTeamManagerModal();
    });
  }

  const btnOpenCreateTourn = document.getElementById("btn-open-create-tourn");
  if (btnOpenCreateTourn) {
    btnOpenCreateTourn.addEventListener("click", () => {
      if (currentAppRole !== "ADMIN") {
        notifyWarning("Quyền Hạn Ban Tổ Chức", "Chỉ Ban Tổ Chức (Admin) mới có quyền tạo giải đấu mới!");
        return;
      }
      const modal = document.getElementById("modal-create-tournament");
      if (modal) modal.style.display = "flex";
    });
  }

  const btnJoinTourn = document.getElementById("btn-join-tournament");
  if (btnJoinTourn) {
    btnJoinTourn.addEventListener("click", handleJoinTournament);
  }
}

function setupAdminControls() {
  const btnOpenTeamMgr = document.getElementById("btn-admin-open-team-mgr");
  if (btnOpenTeamMgr) {
    btnOpenTeamMgr.addEventListener("click", openTeamManagerModal);
  }

  const btnCreateTourn = document.getElementById("btn-admin-create-tourn");
  if (btnCreateTourn) {
    btnCreateTourn.addEventListener("click", () => {
      const modal = document.getElementById("modal-create-tournament");
      if (modal) modal.style.display = "flex";
    });
  }

  const btnAdminGuestLogin = document.getElementById("btn-admin-guest-login");
  if (btnAdminGuestLogin) {
    btnAdminGuestLogin.addEventListener("click", () => {
      openRoleModal("ADMIN");
    });
  }
}

function renderTeamCredentialsTable() {
  return loadRegisteredAccounts();
}

function switchToBracketView() {
  switchToTab("public-arena-tab");
  switchPublicSubView("bracket");
}

async function loadTournamentsList() {

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/list`);
    if (!res.ok) throw new Error("Không tải được danh sách giải đấu.");
    const list = await res.json();

    if (!list || list.length === 0) {
      resetSelectedMatch();
      currentTournamentId = null;
      currentTournamentData = null;
      sessionStorage.removeItem("activeTournamentId");
      localStorage.removeItem("activeTournamentId");
      document.getElementById("bracket-tree-canvas").textContent = "Chưa có giải đấu. Ban tổ chức có thể tạo giải mới.";
      renderTeamCredentialsTable();
      return;
    }

    if (!currentTournamentId || !list.some(t => t.tournament_id === currentTournamentId)) {
      resetSelectedMatch();
      currentTournamentId = list[0].tournament_id;
    }
    sessionStorage.setItem("activeTournamentId", currentTournamentId);
    localStorage.setItem("activeTournamentId", currentTournamentId);
    await loadActiveTournament(currentTournamentId);
  } catch (err) {
    console.error("Lỗi tải danh sách giải đấu:", err);
  }
}

const tournamentRefreshRequests = new Map();
let lastAppliedTournamentFingerprint = "";
async function refreshTournamentSnapshot(tournamentId, showErrors = false) {
  if (!tournamentId) return null;
  const existing = tournamentRefreshRequests.get(tournamentId);
  if (existing) { existing.queued = true; return existing.promise; }
  const request = { queued: false, promise: null };
  request.promise = (async () => {
    let latest = null, passes = 0;
    do {
      passes++; request.queued = false;
      try {
        const response = await fetch(`${API_BASE}/api/tournaments/${encodeURIComponent(tournamentId)}`, { cache: "no-store" });
        if (tournamentId !== currentTournamentId) return null;
        if (response.status === 404) {
          resetSelectedMatch(); currentTournamentId = currentTournamentData = null;
          sessionStorage.removeItem("activeTournamentId"); localStorage.removeItem("activeTournamentId");
          document.getElementById("bracket-tree-canvas").textContent = "Giải đã được xóa. Hãy chọn giải khác.";
          if (document.querySelector(".tab-pane.active")?.id === "tab-match-arena") switchToTab("tab-bracket");
          setTimeout(() => loadTournamentsList(), 0);
          return null;
        }
        if (!response.ok) throw new Error("Không thể tải dữ liệu giải. Máy chủ đang mất kết nối; hãy thử lại.");
        latest = await response.json();
        if (tournamentId !== currentTournamentId) return null;
        const fingerprint = `${currentAppRole}:${currentTeamStudentId}:` + JSON.stringify(latest);
        currentTournamentData = latest; connectActiveMatchSocket(currentActiveMatchId);
        if (fingerprint !== lastAppliedTournamentFingerprint) {
          lastAppliedTournamentFingerprint = fingerprint; applyTournamentSnapshot(latest);
        }
      } catch (error) { if (showErrors) notifyError("Không tải được giải", error.message); return null; }
    } while (request.queued && passes < 2 && currentTournamentId === tournamentId);
    return latest;
  })();
  tournamentRefreshRequests.set(tournamentId, request);
  try { return await request.promise; }
  finally { tournamentRefreshRequests.delete(tournamentId); }
}
function applyTournamentSnapshot(data) {
  if (currentActiveMatchId && !data.matches?.[currentActiveMatchId]) resetSelectedMatch();
  if (currentAppRole === "ADMIN") renderTeamCredentialsTable();
  const teamCountEl = document.getElementById("tourn-teams-count");
  if (teamCountEl) teamCountEl.textContent = `${data.num_teams} Đội`;
  const badgeCount = document.getElementById("count-teams-badge");
  if (badgeCount) badgeCount.textContent = `${data.teams?.length || 0}/${data.num_teams}`;
  const champEl = document.getElementById("tourn-champ-name");
  if (champEl) champEl.textContent = data.champion || "Đang tranh tài...";
  const champPill = document.getElementById("tourn-champion-pill");
  if (champPill) champPill.style.display = data.champion ? "flex" : "none";
  const modalMgr = document.getElementById("modal-manage-teams");
  if (modalMgr && modalMgr.style.display !== "none") renderTeamManagerTable();
  renderBracketTree(data); renderDashboardOverview(); renderStageTimeline(data);
  const stages = { STAGE_1_STANDARD: "Luật Chuẩn", STAGE_2_MUTATED: "Luật Biến Đổi", STAGE_3_REVERSE_FOG: "Luật Sương Mù", STAGE_4_FINALS: "Luật Chung Kết" };
  const stageLabel = document.getElementById("sidebar-stage-text");
  if (stageLabel) stageLabel.textContent = `Hiệp ${data.matches?.[currentActiveMatchId]?.current_round_idx || 1} · ${stages[data.stage_rule] || stages.STAGE_1_STANDARD}`;
  if (currentActiveMatchId && data.matches?.[currentActiveMatchId] && sessionStorage.getItem("matchExplicitlySelected") === "true") renderMatchRoomData(data.matches[currentActiveMatchId]);
  if (document.querySelector(".tab-pane.active")?.id === "tab-ranking") loadLeaderboard();
}
async function loadActiveTournament(tournamentId) { return refreshTournamentSnapshot(tournamentId, true); }
async function loadActiveTournamentSilent(tournamentId) { return refreshTournamentSnapshot(tournamentId); }

// =============================================================================
// FRESHMAN BOT ARENA - JAVASCRIPT APP (VERTICAL SIDEBAR & 5-ROUND MATCH ENGINE)
// Hỗ trợ đa giải đấu, cây sơ đồ nhánh, màn hình nộp code riêng tư, trọng tài tự động
// =============================================================================

const API_BASE = localStorage.getItem("ARENA_API_URL") || (window.location.hostname.includes("workers.dev") || window.location.hostname.includes("pages.dev") ? "https://game-project-3.onrender.com" : (window.location.origin === "null" || window.location.protocol === "file:" ? "https://game-project-3.onrender.com" : window.location.origin));

// =============================================================================
// PRODUCTION-GRADE TOAST & IN-APP NOTIFICATION BANNER SYSTEM
// =============================================================================
function showToast(type, title, message = "", duration = 4000) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast-item toast-${type}`;

  const badgeText = type === "success" ? "THÀNH CÔNG" : (type === "error" ? "LỖI" : (type === "warning" ? "CẢNH BÁO" : "THÔNG BÁO"));

  toast.innerHTML = `
    <span class="toast-badge">${badgeText}</span>
    <div class="toast-body">
      <div class="toast-title">${escapeHtml(title)}</div>
      ${message ? `<div class="toast-desc">${escapeHtml(message)}</div>` : ''}
    </div>
    <button class="toast-close" title="Đóng">&times;</button>
  `;

  const btnClose = toast.querySelector(".toast-close");
  if (btnClose) {
    btnClose.addEventListener("click", () => removeToast(toast));
  }

  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => {
      removeToast(toast);
    }, duration);
  }
}

function removeToast(toast) {
  if (!toast || toast.classList.contains("toast-leave")) return;
  toast.classList.add("toast-leave");
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 250);
}

function notifySuccess(title, message = "") { showToast("success", title, message); }
function notifyError(title, message = "") { showToast("error", title, message); }
function notifyWarning(title, message = "") { showToast("warning", title, message); }
function notifyInfo(title, message = "") { showToast("info", title, message); }


// Các nhãn hiển thị quân bài chuẩn Oẳn tù tì (Không dùng emoji)
const PIECE_ICONS = {
  "ROCK": "BÚA",
  "PAPER": "BAO",
  "SCISSORS": "KÉO"
};

// Mẫu code mặc định chuẩn ICPC
const DEFAULT_PYTHON_CODE = `# -*- coding: utf-8 -*-
import random

def decide_move(game_state):
    """
    Chiến thuật Tân sinh viên K69 qua từng Round:
    game_state cung cấp:
    - my_hp: Lượng máu hiện tại (int)
    - remaining_cards: Thẻ còn lại {"ROCK": 3, "PAPER": 3, "SCISSORS": 3}
    - turn_number: Số thứ tự round đang đấu (1 -> 5)
    - history: Danh sách nước đi các round trước
    """
    cards = game_state.get("remaining_cards", {})
    available = [c for c, count in cards.items() if count > 0]
    if not available:
        return "ROCK"

    turn = game_state.get("turn_number", 1)
    # Chiến thuật thích ứng: Ví dụ ở round lẻ ưu tiên Búa
    if turn % 2 == 1 and "ROCK" in available:
        return "ROCK"
    
    return random.choice(available)
`;

const DEFAULT_CPP_CODE = `/**
 * Bot Mẫu C++ 17 ICPC Standard I/O
 */
#include <iostream>
#include <string>

int main() {
    std::ios_base::sync_with_stdio(false);
    std::cin.tie(NULL);

    std::string state;
    if (std::getline(std::cin, state)) {
        // Thuật toán đối phó round 1..5
        std::cout << "ROCK" << std::endl;
    } else {
        std::cout << "ROCK" << std::endl;
    }
    return 0;
}
`;

// Trạng thái ứng dụng
let currentTournamentId = null;
let currentTournamentData = null;
let currentActiveMatchId = null;
let currentMatchData = null;
let currentStudioSide = null; // "team_a" hoặc "team_b"
let currentUserRole = null; // "ADMIN", "TEAM_A", "TEAM_B"
let pendingLoginMatchId = null;
let practiceSimTimer = null;
let practiceSimCancelToken = false;
let allTeamsCache = [];
let isMatchRunning = false;

// =============================================================================
// KHỞI ĐỘNG ỨNG DỤNG KHI TẢI TRANG
// =============================================================================
function initApp() {
  // Khôi phục phiên làm việc trước đó nếu có reload tab
  const savedTourn = sessionStorage.getItem("activeTournamentId");
  const savedMatch = sessionStorage.getItem("activeMatchId");
  const savedRole = sessionStorage.getItem("userRole");
  const savedSide = sessionStorage.getItem("studioSide");

  if (savedTourn) currentTournamentId = savedTourn;
  if (savedMatch) currentActiveMatchId = savedMatch;
  if (savedRole) currentUserRole = savedRole;
  if (savedSide) currentStudioSide = savedSide;

  setupSidebarNavigation();
  setupTournamentControls();
  setupMatchRoomControls();
  setupStudioControls();
  setupModals();
  setupAdminRules();

  // Nút cấu hình máy chủ Backend cho Cloudflare Pages / Workers
  const btnSetBackend = document.getElementById("btn-set-backend");
  if (btnSetBackend) {
    const currentBackend = localStorage.getItem("ARENA_API_URL") || window.location.origin;
    if (localStorage.getItem("ARENA_API_URL")) {
      btnSetBackend.textContent = "Server: " + localStorage.getItem("ARENA_API_URL").replace(/^https?:\/\//, '').slice(0, 18) + "...";
    }
    btnSetBackend.addEventListener("click", () => {
      const current = localStorage.getItem("ARENA_API_URL") || "";
      const input = prompt("Nhập đường dẫn máy chủ Backend của bạn:\n(Ví dụ: link Cloudflare Tunnel https://xxx.trycloudflare.com hoặc link Render https://xxx.onrender.com)", current);
      if (input !== null) {
        const trimmed = input.trim().replace(/\/+$/, "");
        if (trimmed) {
          localStorage.setItem("ARENA_API_URL", trimmed);
        } else {
          localStorage.removeItem("ARENA_API_URL");
        }
        notifySuccess("Cập Nhật Máy Chủ", "Đã lưu địa chỉ máy chủ API. Đang tải lại trang...");
        window.location.reload();
      }
    });
  }

  // Tải danh sách giải đấu đầu tiên
  loadTournamentsList();

  // Tự động đồng bộ thời gian thực giữa các tab mỗi 1 giây (hỗ trợ Live Feed và Tỷ số)
  setInterval(() => {
    if (currentTournamentId && !isMatchRunning) {
      loadActiveTournamentSilent(currentTournamentId);
    }
  }, 1000);
}

if (document.readyState === 'loading') {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

// =============================================================================
// 1. ĐIỀU HƯỚNG SIDEBAR DỌC
// =============================================================================
function setupSidebarNavigation() {
  const navBtns = document.querySelectorAll(".nav-tab-btn");
  navBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      navBtns.forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach(pane => pane.classList.remove("active"));

      btn.classList.add("active");
      const targetPane = document.getElementById(btn.dataset.tab);
      if (targetPane) targetPane.classList.add("active");

      // Tự động tải dữ liệu theo từng tab
      const tabName = btn.dataset.tab;
      if (tabName === "tournament-tab") {
        if (!currentActiveMatchId) {
          switchToBracketView();
        }
        if (currentTournamentId) loadActiveTournament(currentTournamentId);
      } else if (tabName === "teams-tab") {
        loadTeamsOverview();
      } else if (tabName === "history-tab") {
        loadGlobalMatchHistory();
      } else if (tabName === "ranking-tab") {
        loadLeaderboard();
      } else if (tabName === "admin-tab") {
        loadCurrentRules();
      }
    });
  });
}

// =============================================================================
// 2. QUẢN LÝ ĐA GIẢI ĐẤU (TOURNAMENT MANAGEMENT)
// =============================================================================
function setupTournamentControls() {
  const selTourn = document.getElementById("select-active-tournament");
  const btnRefresh = document.getElementById("btn-refresh-tourn");
  const btnBackBracket = document.getElementById("btn-back-to-bracket");
  const btnVictoryBack = document.getElementById("btn-victory-back-tree");
  const btnTeamMgr = document.getElementById("btn-open-team-manager");

  selTourn.addEventListener("change", (e) => {
    currentTournamentId = e.target.value;
    sessionStorage.setItem("activeTournamentId", currentTournamentId);
    loadActiveTournament(currentTournamentId);
  });

  btnRefresh.addEventListener("click", () => {
    if (currentTournamentId) loadActiveTournament(currentTournamentId);
  });

  btnBackBracket.addEventListener("click", () => {
    switchToBracketView();
  });

  btnVictoryBack.addEventListener("click", () => {
    switchToBracketView();
    if (currentTournamentId) loadActiveTournament(currentTournamentId);
  });

  if (btnTeamMgr) {
    btnTeamMgr.addEventListener("click", () => {
      openTeamManagerModal();
    });
  }
}

function switchToBracketView() {
  document.getElementById("match-room-view").style.display = "none";
  document.getElementById("team-private-studio-view").style.display = "none";
  document.getElementById("tournament-tree-view").style.display = "block";
  currentActiveMatchId = null;
  currentStudioSide = null;
  sessionStorage.removeItem("activeMatchId");
  sessionStorage.removeItem("studioSide");
}

async function loadTournamentsList() {
  try {
    const res = await fetch(`${API_BASE}/api/tournaments/list`);
    const list = await res.json();
    const sel = document.getElementById("select-active-tournament");
    sel.innerHTML = "";

    if (!list || list.length === 0) {
      sel.innerHTML = `<option value="">Chưa có giải đấu nào</option>`;
      return;
    }

    list.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.tournament_id;
      opt.textContent = `${t.name} (${t.num_teams} Đội)`;
      sel.appendChild(opt);
    });

    if (!currentTournamentId || !list.some(t => t.tournament_id === currentTournamentId)) {
      currentTournamentId = list[0].tournament_id;
    }
    sel.value = currentTournamentId;
    sessionStorage.setItem("activeTournamentId", currentTournamentId);
    await loadActiveTournament(currentTournamentId);

    // Tự động khôi phục giao diện nếu đang ở phòng đấu hoặc phòng soạn code
    if (currentActiveMatchId && currentTournamentData && currentTournamentData.matches[currentActiveMatchId]) {
      if (currentUserRole === "ADMIN") {
        openMatchRoom(currentActiveMatchId);
      } else if (currentStudioSide) {
        openPrivateStudioDirect(currentStudioSide);
      }
    }
  } catch (err) {
    console.error("Lỗi tải danh sách giải đấu:", err);
  }
}

async function loadActiveTournament(tournamentId) {
  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}`);
    if (!res.ok) throw new Error("Không thể tải thông tin giải đấu");
    const data = await res.json();
    currentTournamentData = data;

    // Cập nhật thống kê giải đấu trên thanh điều hành
    const teamCountEl = document.getElementById("tourn-teams-count");
    if (teamCountEl) teamCountEl.textContent = `${data.num_teams} Đội`;
    const champEl = document.getElementById("tourn-champ-name");
    if (champEl) {
      if (data.champion) {
        champEl.textContent = data.champion;
        const champPill = document.getElementById("tourn-champion-pill");
        if (champPill) champPill.style.display = "flex";
      } else {
        champEl.textContent = "Đang tranh tài...";
      }
    }

    // Cập nhật badge số đội
    const badgeCount = document.getElementById("count-teams-badge");
    if (badgeCount) {
      const teamCount = data.teams ? data.teams.length : 0;
      badgeCount.textContent = `${teamCount}/${data.num_teams}`;
    }

    // Nếu modal quản lý đội đang mở, cập nhật lại bảng
    const modalMgr = document.getElementById("modal-manage-teams");
    if (modalMgr && modalMgr.style.display !== "none") {
      renderTeamManagerTable();
    }

    // Vẽ cây sơ đồ giải đấu
    renderBracketTree(data);

    // Nếu đang mở phòng đấu của giải này, cập nhật lại dữ liệu phòng
    if (currentActiveMatchId && data.matches[currentActiveMatchId]) {
      renderMatchRoomData(data.matches[currentActiveMatchId]);
    }
  } catch (err) {
    console.error("Lỗi nạp giải đấu:", err);
  }
}

async function loadActiveTournamentSilent(tournamentId) {
  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}`);
    if (!res.ok) return;
    const data = await res.json();
    currentTournamentData = data;

    const teamCountEl = document.getElementById("tourn-teams-count");
    if (teamCountEl) teamCountEl.textContent = `${data.num_teams} Đội`;
    const champEl = document.getElementById("tourn-champ-name");
    if (champEl) {
      if (data.champion) {
        champEl.textContent = data.champion;
        const champPill = document.getElementById("tourn-champion-pill");
        if (champPill) champPill.style.display = "flex";
      } else {
        champEl.textContent = "Đang tranh tài...";
      }
    }

    const badgeCount = document.getElementById("count-teams-badge");
    if (badgeCount) {
      const teamCount = data.teams ? data.teams.length : 0;
      badgeCount.textContent = `${teamCount}/${data.num_teams}`;
    }

    const modalMgr = document.getElementById("modal-manage-teams");
    if (modalMgr && modalMgr.style.display !== "none") {
      renderTeamManagerTable();
    }

    const treeView = document.getElementById("tournament-tree-view");
    if (treeView && treeView.style.display !== "none") {
      renderBracketTree(data);
    }

    const matchView = document.getElementById("match-room-view");
    if (matchView && matchView.style.display !== "none" && currentActiveMatchId && data.matches[currentActiveMatchId]) {
      renderMatchRoomDataSilent(data.matches[currentActiveMatchId]);
    }

    const teamsPane = document.getElementById("teams-tab");
    if (teamsPane && teamsPane.classList.contains("active")) {
      renderTeamsOverviewTable(data.teams || []);
    }
  } catch (err) {
    // Bỏ qua lỗi mạng chớp nhoáng
  }
}

// =============================================================================
// 3. VẼ CÂY SƠ ĐỒ GIẢI ĐẤU ĐA TẦNG (GENERIC N-TEAM BRACKET TREE)
// =============================================================================
function renderBracketTree(tourn) {
  const canvas = document.getElementById("bracket-tree-canvas");
  canvas.innerHTML = "";
  if (!tourn || !tourn.matches) return;

  const matches = tourn.matches;
  const matchesList = Object.values(matches);

  // Nhóm theo round_level nếu giải đấu được sinh tự động
  const hasLevels = matchesList.some(m => m.round_level !== undefined);

  if (hasLevels) {
    const levels = [...new Set(matchesList.map(m => m.round_level || 1))].sort((a, b) => a - b);
    levels.forEach(lvl => {
      const lvlMatches = matchesList.filter(m => (m.round_level || 1) === lvl);
      // Sắp xếp các trận trong vòng theo mã trận để cây phân nhánh thẳng hàng
      lvlMatches.sort((a, b) => a.match_id.localeCompare(b.match_id, undefined, { numeric: true }));

      const firstM = lvlMatches[0];
      let colTitle = `Vòng ${lvl}`;
      if (firstM && firstM.round_name) {
        if (firstM.round_name.startsWith("Vòng") || firstM.round_name.includes("Kết")) {
          colTitle = firstM.round_name;
        } else {
          colTitle = `Vòng ${firstM.round_name}`;
        }
      }
      canvas.appendChild(createBracketColumn(colTitle, lvlMatches));
    });
  } else {
    // Tương thích ngược với các giải đấu cũ 8 đội hoặc 4 đội
    if (tourn.num_teams === 8) {
      const qfMatches = ["m_qf_1", "m_qf_2", "m_qf_3", "m_qf_4"].map(id => matches[id]).filter(Boolean);
      const sfMatches = ["m_sf_1", "m_sf_2"].map(id => matches[id]).filter(Boolean);
      const gfMatches = ["m_gf"].map(id => matches[id]).filter(Boolean);
      if (qfMatches.length) canvas.appendChild(createBracketColumn("Vòng Tứ Kết", qfMatches));
      if (sfMatches.length) canvas.appendChild(createBracketColumn("Vòng Bán Kết", sfMatches));
      if (gfMatches.length) canvas.appendChild(createBracketColumn("Chung Kết Tổng", gfMatches));
    } else {
      const sfMatches = ["m_sf_1", "m_sf_2"].map(id => matches[id]).filter(Boolean);
      const gfMatches = ["m_gf"].map(id => matches[id]).filter(Boolean);
      if (sfMatches.length) canvas.appendChild(createBracketColumn("Vòng Bán Kết", sfMatches));
      if (gfMatches.length) canvas.appendChild(createBracketColumn("Chung Kết Tổng", gfMatches));
    }
  }

  // Cột Quán Quân
  canvas.appendChild(createChampionColumn(tourn.champion));
}

function createBracketColumn(title, matchArr) {
  const col = document.createElement("div");
  col.className = "bracket-column";

  const titleEl = document.createElement("div");
  titleEl.className = "bracket-column-title";
  titleEl.textContent = title;
  col.appendChild(titleEl);

  const listEl = document.createElement("div");
  listEl.className = "bracket-matches-list";

  matchArr.forEach(m => {
    if (m) listEl.appendChild(createMatchCard(m));
  });

  col.appendChild(listEl);
  return col;
}

function createMatchCard(match) {
  const card = document.createElement("div");
  card.className = "bracket-match-card";
  if (match.status === "COMPLETED") card.classList.add("is-completed");

  const header = document.createElement("div");
  header.className = "bracket-card-header";

  let statusClass = "status-waiting";
  let statusText = "Chờ";
  if (match.status === "READY") { statusClass = "status-ready"; statusText = "Sẵn Sàng"; }
  else if (match.status === "IN_PROGRESS") { statusClass = "status-inprogress"; statusText = `Round ${match.current_round_idx}/5`; }
  else if (match.status === "COMPLETED") { statusClass = "status-completed"; statusText = "Đã Kết Thúc"; }

  header.innerHTML = `
    <span class="bracket-match-title">${match.title}</span>
    <span class="bracket-match-status ${statusClass}">${statusText}</span>
  `;
  card.appendChild(header);

  const body = document.createElement("div");
  body.className = "bracket-card-body";

  const teamA = match.team_a;
  const teamB = match.team_b;

  const isWinA = match.winner === "team_a";
  const isWinB = match.winner === "team_b";

  const rowA = `
    <div class="bracket-team-row ${isWinA ? 'winner' : ''}">
      <div class="team-row-left">
        <span class="team-pill-indicator ${teamA ? 'red' : 'empty'}"></span>
        <span class="bracket-team-name ${!teamA ? 'empty' : ''}">${teamA ? escapeHtml(teamA.team_name) : 'Chờ xác định...'}</span>
      </div>
      <span class="bracket-team-score">${teamA ? teamA.rounds_won : '-'}</span>
    </div>
  `;

  const rowB = `
    <div class="bracket-team-row ${isWinB ? 'winner' : ''}">
      <div class="team-row-left">
        <span class="team-pill-indicator ${teamB ? 'blue' : 'empty'}"></span>
        <span class="bracket-team-name ${!teamB ? 'empty' : ''}">${teamB ? escapeHtml(teamB.team_name) : 'Chờ xác định...'}</span>
      </div>
      <span class="bracket-team-score">${teamB ? teamB.rounds_won : '-'}</span>
    </div>
  `;

  body.innerHTML = rowA + rowB;
  card.appendChild(body);

  const footer = document.createElement("div");
  footer.className = "bracket-card-footer";
  const btn = document.createElement("button");
  btn.className = "btn-open-match";
  btn.textContent = match.status === "COMPLETED" ? "Xem Lịch Sử 5 Round" : "Vào Bàn Đấu";
  footer.appendChild(btn);
  card.appendChild(footer);

  card.addEventListener("click", () => {
    handleMatchCardClick(match.match_id);
  });

  return card;
}

function createChampionColumn(championName) {
  const col = document.createElement("div");
  col.className = "bracket-column";

  const titleEl = document.createElement("div");
  titleEl.className = "bracket-column-title";
  titleEl.textContent = "Cúp Vô Địch";
  col.appendChild(titleEl);

  const card = document.createElement("div");
  card.className = "champion-column-card";
  card.innerHTML = `
    <div class="champ-title">QUÁN QUÂN GIẢI ĐẤU</div>
    <div class="champ-name">${championName ? escapeHtml(championName) : 'Đang Tranh Hùng...'}</div>
  `;

  col.appendChild(card);
  return col;
}

// =============================================================================
// 4. BÀN ĐẤU CHI TIẾT & ĐIỀU HÀNH TRẬN ĐẤU (ARENA VIEW)
// =============================================================================
function openMatchRoom(matchId) {
  if (!currentTournamentData || !currentTournamentData.matches[matchId]) return;

  currentActiveMatchId = matchId;
  const match = currentTournamentData.matches[matchId];

  document.getElementById("tournament-tree-view").style.display = "none";
  document.getElementById("team-private-studio-view").style.display = "none";
  document.getElementById("match-room-view").style.display = "flex";

  renderMatchRoomData(match);
}

function renderMatchRoomData(match) {
  currentMatchData = match;

  // Tiêu đề phòng đấu
  document.getElementById("match-room-title").textContent = match.title.toUpperCase();
  document.getElementById("match-room-stage-badge").textContent = `${match.round_name} • Định dạng Bo5`;

  const statusBadge = document.getElementById("match-room-status-badge");
  statusBadge.textContent = match.status;
  if (match.status === "COMPLETED") {
    statusBadge.className = "match-status-badge status-completed";
  } else {
    statusBadge.className = "match-status-badge status-ready";
  }

  // Tỉ số và các step pills
  const teamA = match.team_a;
  const teamB = match.team_b;
  const scoreText = `Tỉ số: ${teamA ? teamA.rounds_won : 0} - ${teamB ? teamB.rounds_won : 0}`;
  document.getElementById("match-score-summary").textContent = scoreText;

  renderRoundStepPills(match.current_round_idx, match.rounds_history, match.status === "COMPLETED");

  // Hiển thị 2 đội tuyển (Bảo mật mã lệnh)
  renderFighterSide("team_a", teamA);
  renderFighterSide("team_b", teamB);

  // Cập nhật bảng kiểm tra của Trọng tài Ban tổ chức (Chuẩn Kaggle Arena)
  const readyA = teamA && teamA.code_valid;
  const readyB = teamB && teamB.code_valid;
  const allReady = Boolean(match.all_teams_ready || (readyA && readyB));

  const pillA = document.getElementById("pill-ready-a");
  const pillB = document.getElementById("pill-ready-b");

  if (pillA) {
    if (readyA) {
      pillA.textContent = `${teamA.team_name}: Mã Hợp Lệ [OK]`;
      pillA.className = "check-pill ready";
    } else if (teamA && teamA.code_submitted) {
      pillA.textContent = `${teamA.team_name}: Mã Lỗi [FAIL]`;
      pillA.className = "check-pill wait";
    } else {
      pillA.textContent = `${teamA ? teamA.team_name : 'Đội Đỏ'}: Chờ nộp bot`;
      pillA.className = "check-pill wait";
    }
  }

  if (pillB) {
    if (readyB) {
      pillB.textContent = `${teamB.team_name}: Mã Hợp Lệ [OK]`;
      pillB.className = "check-pill ready";
    } else if (teamB && teamB.code_submitted) {
      pillB.textContent = `${teamB.team_name}: Mã Lỗi [FAIL]`;
      pillB.className = "check-pill wait";
    } else {
      pillB.textContent = `${teamB ? teamB.team_name : 'Đội Xanh'}: Chờ nộp bot`;
      pillB.className = "check-pill wait";
    }
  }

  // Cập nhật Bàn đấu võ đài trực quan eSports
  renderVisualBattleArena(match);

  // Nút bắt đầu thi đấu của trọng tài (Điều hành trận đấu chuẩn mực)
  const btnRefereeStart = document.getElementById("btn-referee-start");
  const roundBannerText = document.getElementById("current-round-text");
  const roundTipText = document.getElementById("round-tip-text");
  const arenaReadinessTitle = document.getElementById("arena-readiness-title");
  const readyBannerStatus = document.getElementById("ready-banner-status");
  const refereeSubActions = document.querySelector(".referee-sub-actions");

  if (match.status === "COMPLETED") {
    if (roundBannerText) roundBannerText.textContent = "TRẬN ĐẤU ĐÃ KẾT THÚC";
    if (roundTipText) roundTipText.textContent = `Chiến thắng chung cuộc thuộc về ${match.winner_name || '---'}!`;
    if (btnRefereeStart) btnRefereeStart.style.display = "none";
    if (refereeSubActions) refereeSubActions.style.display = "none";

    const victoryBanner = document.getElementById("match-victory-banner");
    if (victoryBanner) victoryBanner.style.display = "block";
    const victoryTeam = document.getElementById("victory-team-text");
    if (victoryTeam) victoryTeam.textContent = `${match.winner_name} CHIẾN THẮNG TRẬN ĐẤU!`;
  } else {
    if (roundBannerText) roundBannerText.textContent = `ROUND ${match.current_round_idx} / 5`;
    const victoryBanner = document.getElementById("match-victory-banner");
    if (victoryBanner) victoryBanner.style.display = "none";

    // Phân quyền hiển thị nút Bắt đầu
    if (currentUserRole === "ADMIN") {
      if (btnRefereeStart) {
        btnRefereeStart.style.display = "inline-flex";
        btnRefereeStart.textContent = `BẮT ĐẦU TRẬN ĐẤU (ROUND ${match.current_round_idx})`;
        btnRefereeStart.disabled = !allReady;
      }
      if (refereeSubActions) refereeSubActions.style.display = "flex";
    } else {
      if (btnRefereeStart) btnRefereeStart.style.display = "none";
      if (refereeSubActions) refereeSubActions.style.display = "none";
    }

    if (allReady) {
      if (arenaReadinessTitle) arenaReadinessTitle.textContent = "CẢ HAI ĐỘI ĐÃ SẴN SÀNG — CHỜ ADMIN BẮT ĐẦU";
      if (readyBannerStatus) readyBannerStatus.className = "ready-banner-status all-ready";
      if (roundTipText) roundTipText.textContent = `Cả 2 đội đã nộp mã lệnh hợp lệ cho Round ${match.current_round_idx}! Trọng tài hãy bấm nút bên dưới để khai hỏa hiệp đấu trực tiếp!`;
    } else {
      if (arenaReadinessTitle) arenaReadinessTitle.textContent = "CHỜ 2 ĐỘI NỘP MÃ LỆNH";
      if (readyBannerStatus) readyBannerStatus.className = "ready-banner-status waiting";
      const readyCount = (readyA ? 1 : 0) + (readyB ? 1 : 0);
      if (roundTipText) roundTipText.textContent = `Chờ cả 2 đội vào màn hình riêng nộp mã Bot hợp lệ cho Round ${match.current_round_idx} (Đã sẵn sàng ${readyCount}/2 đội), Trọng tài mới bấm bắt đầu!`;
    }
  }

  // Giám sát mã nguồn realtime nếu có quyền Ban tổ chức (Admin)
  renderAdminLiveCodeMonitor(match);

  // Hiển thị 3 loại nhật ký chi tiết
  const lastRec = match.rounds_history && match.rounds_history.length > 0
    ? match.rounds_history[match.rounds_history.length - 1]
    : null;
  renderCategorizedLogs(lastRec);

  // Tải danh sách bài nộp Kaggle-style
  loadMatchSubmissions(match.match_id);

  // Bảng nhật ký các Round đã diễn ra
  renderRoundHistoryTable(match.rounds_history);
}

function renderMatchRoomDataSilent(match) {
  if (!match) return;
  currentMatchData = match;

  const titleEl = document.getElementById("match-room-title");
  if (titleEl) titleEl.textContent = match.title.toUpperCase();

  const stageBadge = document.getElementById("match-room-stage-badge");
  if (stageBadge) stageBadge.textContent = `${match.round_name} • Định dạng Bo5`;

  const statusBadge = document.getElementById("match-room-status-badge");
  if (statusBadge) {
    statusBadge.textContent = match.status;
    statusBadge.className = match.status === "COMPLETED" ? "match-status-badge status-completed" : "match-status-badge status-ready";
  }

  const teamA = match.team_a;
  const teamB = match.team_b;
  const scoreText = `Tỉ số: ${teamA ? teamA.rounds_won : 0} - ${teamB ? teamB.rounds_won : 0}`;
  const scoreSummary = document.getElementById("match-score-summary");
  if (scoreSummary) scoreSummary.textContent = scoreText;

  renderRoundStepPills(match.current_round_idx, match.rounds_history, match.status === "COMPLETED");
  renderFighterSide("team_a", teamA);
  renderFighterSide("team_b", teamB);

  const readyA = teamA && teamA.code_valid;
  const readyB = teamB && teamB.code_valid;
  const allReady = Boolean(match.all_teams_ready || (readyA && readyB));

  const pillA = document.getElementById("pill-ready-a");
  const pillB = document.getElementById("pill-ready-b");
  if (pillA) {
    if (readyA) {
      pillA.textContent = `${teamA.team_name}: Mã Hợp Lệ [OK]`;
      pillA.className = "check-pill ready";
    } else if (teamA && teamA.code_submitted) {
      pillA.textContent = `${teamA.team_name}: Mã Lỗi [FAIL]`;
      pillA.className = "check-pill wait";
    } else {
      pillA.textContent = `${teamA ? teamA.team_name : 'Đội Đỏ'}: Chờ nộp bot`;
      pillA.className = "check-pill wait";
    }
  }
  if (pillB) {
    if (readyB) {
      pillB.textContent = `${teamB.team_name}: Mã Hợp Lệ [OK]`;
      pillB.className = "check-pill ready";
    } else if (teamB && teamB.code_submitted) {
      pillB.textContent = `${teamB.team_name}: Mã Lỗi [FAIL]`;
      pillB.className = "check-pill wait";
    } else {
      pillB.textContent = `${teamB ? teamB.team_name : 'Đội Xanh'}: Chờ nộp bot`;
      pillB.className = "check-pill wait";
    }
  }

  const btnRefereeStart = document.getElementById("btn-referee-start");
  const roundBannerText = document.getElementById("current-round-text");
  const roundTipText = document.getElementById("round-tip-text");
  const arenaReadinessTitle = document.getElementById("arena-readiness-title");
  const readyBannerStatus = document.getElementById("ready-banner-status");
  const victoryBanner = document.getElementById("match-victory-banner");

  if (match.status === "COMPLETED") {
    if (roundBannerText) roundBannerText.textContent = "TRẬN ĐẤU ĐÃ KẾT THÚC";
    if (roundTipText) roundTipText.textContent = `Chiến thắng chung cuộc thuộc về ${match.winner_name || '---'}!`;
    if (btnRefereeStart) btnRefereeStart.style.display = "none";
    if (victoryBanner) {
      victoryBanner.style.display = "block";
      const victoryTeam = document.getElementById("victory-team-text");
      if (victoryTeam) victoryTeam.textContent = `${match.winner_name} CHIẾN THẮNG TRẬN ĐẤU!`;
    }
  } else {
    if (roundBannerText) roundBannerText.textContent = `ROUND ${match.current_round_idx} / 5`;
    if (victoryBanner) victoryBanner.style.display = "none";
    
    if (currentUserRole === "ADMIN") {
      if (btnRefereeStart) {
        btnRefereeStart.style.display = "inline-flex";
        btnRefereeStart.textContent = `BẮT ĐẦU TRẬN ĐẤU (ROUND ${match.current_round_idx})`;
        btnRefereeStart.disabled = !allReady;
      }
    } else {
      if (btnRefereeStart) btnRefereeStart.style.display = "none";
    }

    if (allReady) {
      if (arenaReadinessTitle) arenaReadinessTitle.textContent = "CẢ HAI ĐỘI ĐÃ SẴN SÀNG — CHỜ ADMIN BẮT ĐẦU";
      if (readyBannerStatus) readyBannerStatus.className = "ready-banner-status all-ready";
      if (roundTipText) roundTipText.textContent = `Cả 2 đội đã nộp mã lệnh hợp lệ cho Round ${match.current_round_idx}! Trọng tài hãy bấm nút bên dưới để khai hỏa hiệp đấu trực tiếp!`;
    } else {
      if (arenaReadinessTitle) arenaReadinessTitle.textContent = "CHỜ 2 ĐỘI NỘP MÃ LỆNH";
      if (readyBannerStatus) readyBannerStatus.className = "ready-banner-status waiting";
      const readyCount = (readyA ? 1 : 0) + (readyB ? 1 : 0);
      if (roundTipText) roundTipText.textContent = `Chờ cả 2 đội vào màn hình riêng nộp mã Bot cho Round ${match.current_round_idx} (Đã sẵn sàng ${readyCount}/2 đội), Trọng tài mới bấm khai hỏa!`;
    }
  }

  renderAdminLiveCodeMonitor(match);
  renderRoundHistoryTable(match.rounds_history);
}

// =============================================================================
// BÀN CỜ CHIẾN THUẬT 9x9 (9x9 TACTICAL CHESSBOARD ARENA CONTROLS)
// =============================================================================

function initChessboardGrid() {
  const boardEl = document.getElementById("chessboard-9x9");
  if (!boardEl) return;
  boardEl.innerHTML = "";

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement("div");
      cell.className = "board-cell";
      cell.dataset.col = c;
      cell.dataset.row = r;

      // Ô cờ xen kẽ tạo hiệu ứng bàn cờ thanh lịch
      if ((r + c) % 2 === 1) {
        cell.classList.add("cell-alt");
      }

      // Cứ điểm đích của Đội Đỏ [col 8, row 0] (góc trên bên phải)
      if (c === 8 && r === 0) {
        cell.classList.add("cell-target-red");
        cell.title = "Cứ điểm Đích của Đội Đỏ [8, 0]";
      }
      // Cứ điểm đích của Đội Xanh [col 0, row 8] (góc dưới bên trái)
      if (c === 0 && r === 8) {
        cell.classList.add("cell-target-blue");
        cell.title = "Cứ điểm Đích của Đội Xanh [0, 8]";
      }

      boardEl.appendChild(cell);
    }
  }
}

function getInitialBoardPieces() {
  const typesPattern = ["ROCK", "PAPER", "SCISSORS", "ROCK", "PAPER", "SCISSORS", "ROCK", "PAPER", "SCISSORS"];
  const red = typesPattern.map((t, i) => ({ id: `r_${i}`, col: i, row: 7, type: t, alive: true }));
  const blue = typesPattern.map((t, i) => ({ id: `b_${i}`, col: i, row: 1, type: t, alive: true }));
  return { red, blue };
}

function renderChessboard(redPieces, bluePieces, clashEvent = null) {
  const boardEl = document.getElementById("chessboard-9x9");
  if (!boardEl) return;

  if (boardEl.children.length !== 81) {
    initChessboardGrid();
  }

  const cells = boardEl.querySelectorAll(".board-cell");
  cells.forEach(cell => {
    cell.innerHTML = "";
    cell.classList.remove("cell-clash");
  });

  // Render quân Đội Xanh
  let blueAliveCount = 0;
  if (bluePieces && Array.isArray(bluePieces)) {
    bluePieces.forEach(p => {
      if (!p.alive) return;
      blueAliveCount++;
      const cell = boardEl.querySelector(`.board-cell[data-col="${p.col}"][data-row="${p.row}"]`);
      if (cell) {
        const pieceEl = document.createElement("div");
        pieceEl.className = "board-piece piece-blue";
        pieceEl.textContent = PIECE_ICONS[p.type] || "BÚA";
        pieceEl.title = `Quân Xanh: ${p.type} (${p.col}, ${p.row})`;
        cell.appendChild(pieceEl);
      }
    });
  }

  // Render quân Đội Đỏ
  let redAliveCount = 0;
  if (redPieces && Array.isArray(redPieces)) {
    redPieces.forEach(p => {
      if (!p.alive) return;
      redAliveCount++;
      const cell = boardEl.querySelector(`.board-cell[data-col="${p.col}"][data-row="${p.row}"]`);
      if (cell) {
        const pieceEl = document.createElement("div");
        pieceEl.className = "board-piece piece-red";
        pieceEl.textContent = PIECE_ICONS[p.type] || "BÚA";
        pieceEl.title = `Quân Đỏ: ${p.type} (${p.col}, ${p.row})`;
        cell.appendChild(pieceEl);
      }
    });
  }

  // Cập nhật số quân còn lại trên top bar
  const countRedEl = document.getElementById("board-count-red");
  const countBlueEl = document.getElementById("board-count-blue");
  if (countRedEl) countRedEl.textContent = `${redAliveCount}/9 quân`;
  if (countBlueEl) countBlueEl.textContent = `${blueAliveCount}/9 quân`;

  // Hiệu ứng lóe sáng tại ô va chạm / ăn quân
  if (clashEvent && typeof clashEvent.col === "number" && typeof clashEvent.row === "number") {
    const clashCell = boardEl.querySelector(`.board-cell[data-col="${clashEvent.col}"][data-row="${clashEvent.row}"]`);
    if (clashCell) {
      clashCell.classList.add("cell-clash");
    }
  }
}

function renderVisualBattleArena(match) {
  const teamA = match.team_a;
  const teamB = match.team_b;

  // Round indicator
  const roundEl = document.getElementById("arena-round-indicator");
  if (roundEl) {
    roundEl.textContent = match.status === "COMPLETED" ? "CHUNG CUỘC" : `ROUND ${match.current_round_idx} / 5`;
  }

  // Tên Đội Đỏ và Đội Xanh
  const nameRed = document.getElementById("arena-name-red");
  const nameBlue = document.getElementById("arena-name-blue");
  if (nameRed) nameRed.textContent = teamA ? teamA.team_name : "Đội Đỏ";
  if (nameBlue) nameBlue.textContent = teamB ? teamB.team_name : "Đội Xanh";

  // Render quân cờ trên Bàn cờ 9x9
  const lastR = match.rounds_history && match.rounds_history.length > 0
    ? match.rounds_history[match.rounds_history.length - 1]
    : null;

  if (lastR && lastR.board_steps && lastR.board_steps.length > 0) {
    const finalStep = lastR.board_steps[lastR.board_steps.length - 1];
    renderChessboard(finalStep.red_pieces, finalStep.blue_pieces, null);
  } else {
    const initPieces = getInitialBoardPieces();
    renderChessboard(initPieces.red, initPieces.blue, null);
  }

  // Dòng bình luận (Commentary ticker)
  const ticker = document.getElementById("live-commentary-ticker");
  if (ticker) {
    if (match.status === "COMPLETED") {
      ticker.textContent = `Trận đấu đã hoàn tất! Quán quân: ${match.winner_name || '---'}!`;
    } else if (lastR) {
      ticker.textContent = `Hiệp vừa qua: ${lastR.log || lastR.win_reason}`;
    } else {
      ticker.textContent = `Sẵn sàng cho Round ${match.current_round_idx}! Chờ Trọng tài khai hỏa trên bàn cờ 9x9...`;
    }
  }

  // Ẩn banner nghỉ giải lao cũ (chỉ hiển thị trong lúc đếm ngược 5 giây sau round)
  const intermissionBanner = document.getElementById("round-intermission-banner");
  if (intermissionBanner && !isMatchRunning) {
    intermissionBanner.style.display = "none";
  }
}

function renderRoundStepPills(currentIdx, history, isFinished) {
  const container = document.getElementById("round-step-pills");
  container.innerHTML = "";

  for (let r = 1; r <= 5; r++) {
    const pill = document.createElement("div");
    pill.className = "step-pill";
    pill.dataset.round = r;

    const roundRec = (history || []).find(h => h.round_number === r);

    if (roundRec) {
      pill.classList.add("done");
      const winLabel = roundRec.winner === "team_a" ? "Đỏ Thắng" : (roundRec.winner === "team_b" ? "Xanh Thắng" : "Hòa");
      pill.innerHTML = `Round ${r}<br><span style="font-size:11px">${winLabel}</span>`;
    } else if (r === currentIdx && !isFinished) {
      pill.classList.add("current");
      pill.textContent = `Round ${r} (Đang Đấu)`;
    } else {
      pill.textContent = `Round ${r}`;
    }

    container.appendChild(pill);
  }
}

function renderFighterSide(side, team) {
  const prefix = side === "team_a" ? "team-a" : "team-b";
  const nameEl = document.getElementById(`${prefix}-name`);
  const metaEl = document.getElementById(`${prefix}-meta`);
  const authBadge = document.getElementById(`${prefix}-auth-badge`);
  const roundsWonEl = document.getElementById(`${prefix}-rounds-won`);
  const hpEl = document.getElementById(`${prefix}-hp`);
  const subIndicator = document.getElementById(`${prefix}-sub-indicator`);
  const subText = document.getElementById(`${prefix}-sub-text`);
  const btnOpen = document.getElementById(`btn-open-studio-${side === 'team_a' ? 'a' : 'b'}`);

  if (!team) {
    if (nameEl) nameEl.textContent = "Chờ Đối Thủ";
    if (metaEl) metaEl.textContent = "Vòng trước chưa phân định";
    if (authBadge) {
      authBadge.textContent = "Trống";
      authBadge.className = "auth-status-badge badge-waiting";
    }
    if (roundsWonEl) roundsWonEl.textContent = "0";
    if (hpEl) hpEl.textContent = "0 HP";
    if (subIndicator) subIndicator.className = "sub-indicator sub-wait";
    if (subText) subText.textContent = "Chưa có đội tham gia";
    if (btnOpen) btnOpen.disabled = true;
    return;
  }

  if (nameEl) nameEl.textContent = team.team_name;
  if (metaEl) metaEl.textContent = `MSSV: ${team.student_id} • ${team.university || 'ICPC K69'}`;
  if (roundsWonEl) roundsWonEl.textContent = team.rounds_won;
  if (hpEl) hpEl.textContent = `${team.hp} HP`;
  if (btnOpen) btnOpen.disabled = false;

  if (authBadge) {
    if (team.code_submitted) {
      if (team.code_valid) {
        authBadge.textContent = "Mã Hợp Lệ [OK]";
        authBadge.className = "auth-status-badge badge-valid";
        if (subIndicator) subIndicator.className = "sub-indicator sub-valid";
        if (subText) subText.textContent = `Mã lệnh hợp lệ (${team.active_submission_id || 'sub_ok'})`;
      } else {
        authBadge.textContent = "Mã Lỗi [FAIL]";
        authBadge.className = "auth-status-badge badge-invalid";
        if (subIndicator) subIndicator.className = "sub-indicator sub-invalid";
        if (subText) subText.textContent = `Lỗi: ${team.validation_error || 'Sandbox lỗi'}`;
      }
    } else {
      authBadge.textContent = `Chưa Nộp Round ${currentMatchData?.current_round_idx || 1}`;
      authBadge.className = "auth-status-badge badge-waiting";
      if (subIndicator) subIndicator.className = "sub-indicator sub-wait";
      if (subText) subText.textContent = `Chờ nộp mã Round ${currentMatchData?.current_round_idx || 1}`;
    }
  }
}

function setupMatchRoomControls() {
  // Trọng tài bấm Bắt đầu thi đấu (Solo từng round một)
  const btnRefereeStart = document.getElementById("btn-referee-start");
  if (btnRefereeStart) {
    btnRefereeStart.addEventListener("click", handleRefereeStartBattle);
  }

  // Nạp code mẫu nhanh (cho ban tổ chức test)
  const btnQuickFillDemo = document.getElementById("btn-quick-fill-demo");
  if (btnQuickFillDemo) {
    btnQuickFillDemo.addEventListener("click", handleQuickFillDemo);
  }

  // Đặt lại trận đấu
  const btnReset = document.getElementById("btn-reset-current-match");
  if (btnReset) {
    btnReset.addEventListener("click", handleResetCurrentMatch);
  }
}

// =============================================================================
// 5. MÀN HÌNH NỘP CODE BẢO MẬT RIÊNG TƯ (PRIVATE BOT SUBMISSION STUDIO)
// =============================================================================
function openPrivateStudio(side) {
  if (!currentTournamentData || !currentActiveMatchId) return;

  if (currentUserRole === "TEAM_A" && side !== "team_a") {
    notifyWarning("Quyền Hạn", "Bạn đang đăng nhập với tư cách Đội Đỏ, không thể truy cập phòng của Đội Xanh!");
    return;
  }
  if (currentUserRole === "TEAM_B" && side !== "team_b") {
    notifyWarning("Quyền Hạn", "Bạn đang đăng nhập với tư cách Đội Xanh, không thể truy cập phòng của Đội Đỏ!");
    return;
  }

  const match = currentTournamentData.matches[currentActiveMatchId];
  const team = match ? match[side] : null;
  if (!team) return;

  currentStudioSide = side;

  // Ẩn Bàn đấu, hiện Màn hình riêng tư
  document.getElementById("match-room-view").style.display = "none";
  document.getElementById("tournament-tree-view").style.display = "none";
  const studioView = document.getElementById("team-private-studio-view");
  studioView.style.display = "flex";

  // Cập nhật tiêu đề màn hình
  const sideColorName = side === "team_a" ? "ĐỘI ĐỎ" : "ĐỘI XANH";
  document.getElementById("studio-main-title").textContent = `PHÒNG NỘP BOT BẢO MẬT: ${team.team_name.toUpperCase()} (${sideColorName})`;
  document.getElementById("studio-team-identity").textContent = `MSSV: ${team.student_id} • ${team.university || 'Khối Kỹ Thuật'}`;

  // Cập nhật thẻ mục tiêu và tình báo đối thủ
  const titleTarget = document.getElementById("studio-round-target-title");
  if (titleTarget) {
    titleTarget.textContent = `Đang Soạn Mã Lệnh Cho Round ${match.current_round_idx} / 5 (${match.round_name})`;
  }

  const chipsContainer = document.getElementById("studio-intel-history-chips");
  if (chipsContainer) {
    if (match.rounds_history && match.rounds_history.length > 0) {
      chipsContainer.innerHTML = match.rounds_history.map(r => {
        const myMove = side === "team_a" ? r.team_a_move : r.team_b_move;
        const oppMove = side === "team_a" ? r.team_b_move : r.team_a_move;
        const myWin = (side === "team_a" && r.winner === "team_a") || (side === "team_b" && r.winner === "team_b");
        const isDraw = r.winner === "draw";
        const tag = myWin ? "BẠN THẮNG" : (isDraw ? "HÒA" : "BẠN THUA");
        return `<span class="intel-chip">Round ${r.round_number}: Bạn ra <strong>${myMove}</strong> vs Đối thủ ra <strong>${oppMove}</strong> [${tag}]</span>`;
      }).join("") + `<div style="font-size:12px; color:#166534; width:100%; margin-top:4px;"><em>Gợi ý chiến thuật: Hãy xem nước cờ gần nhất của đối thủ để đổi thuật toán khắc chế!</em></div>`;
    } else {
      chipsContainer.innerHTML = `<span class="intel-chip">Chưa có lịch sử hiệp trước. Hãy viết mã lệnh khởi động cho Round 1!</span>`;
    }
  }

  const btnSubmitBot = document.getElementById("btn-studio-submit-bot");
  if (btnSubmitBot) {
    btnSubmitBot.textContent = `NỘP MÃ LỆNH CHO ROUND ${match.current_round_idx}`;
  }

  const authCard = document.getElementById("studio-auth-card");
  const ideCard = document.getElementById("studio-ide-card");

  // Nếu đội đã đăng nhập / xác thực trước đó
  if (team.authenticated) {
    authCard.style.display = "none";
    ideCard.style.display = "flex";
    populateStudioEditor(team);
  } else {
    authCard.style.display = "flex";
    ideCard.style.display = "none";

    // Cập nhật thông tin trực quan trên thẻ xác thực
    const badgeRound = document.getElementById("studio-auth-round-badge");
    if (badgeRound) {
      badgeRound.textContent = `BẢO MẬT HIỆP ĐẤU - ROUND ${match.current_round_idx} / 5`;
    }
    const authTitle = document.getElementById("studio-auth-team-title");
    if (authTitle) {
      authTitle.textContent = `Xác Thực ${team.team_name} (${sideColorName})`;
    }
    const authSub = document.getElementById("studio-auth-team-sub");
    if (authSub) {
      authSub.textContent = `Đội tuyển nhập MSSV và Mật khẩu để mở khóa nộp mã Bot cho Round ${match.current_round_idx}.`;
    }
    const btnAuthSubmit = document.getElementById("btn-studio-auth-submit");
    if (btnAuthSubmit) {
      btnAuthSubmit.textContent = `Đăng Nhập & Mở Khóa Round ${match.current_round_idx}`;
    }

    const sidInp = document.getElementById("studio-auth-sid");
    const passInp = document.getElementById("studio-auth-pass");
    if (sidInp) sidInp.value = team.student_id || "";
    if (passInp) passInp.value = "";
  }
}

function populateStudioEditor(team) {
  const editor = document.getElementById("studio-code-editor");
  const selLang = document.getElementById("studio-sel-lang");
  const statusTag = document.getElementById("studio-submission-status");

  selLang.value = team.current_lang || "PYTHON";

  if (team.current_code && team.current_code.trim() !== "") {
    editor.value = team.current_code;
  } else {
    editor.value = selLang.value === "CPP" ? DEFAULT_CPP_CODE : DEFAULT_PYTHON_CODE;
  }

  if (team.code_submitted) {
    statusTag.textContent = `Đã nộp mã lệnh cho Round ${currentMatchData?.current_round_idx || 1} (Sẵn sàng)`;
    statusTag.className = "ide-status-tag submitted";
  } else {
    statusTag.textContent = `Chưa nộp mã cho Round ${currentMatchData?.current_round_idx || 1}`;
    statusTag.className = "ide-status-tag";
  }
}

function setupStudioControls() {
  const btnBack = document.getElementById("btn-studio-back-to-room");
  const btnAuth = document.getElementById("btn-studio-auth-submit");
  const btnSubmitBot = document.getElementById("btn-studio-submit-bot");
  const btnTemplate = document.getElementById("btn-studio-load-template");
  const selLang = document.getElementById("studio-sel-lang");
  const editor = document.getElementById("studio-code-editor");

  // Đồng bộ mã lệnh đang soạn trực tiếp sang Admin Live Code Monitor (debounce 300ms)
  let draftSyncTimeout = null;
  editor.addEventListener("input", () => {
    if (!currentTournamentId || !currentActiveMatchId || !currentStudioSide) return;
    clearTimeout(draftSyncTimeout);
    draftSyncTimeout = setTimeout(async () => {
      try {
        await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/matches/${currentActiveMatchId}/draft-code`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            side: currentStudioSide,
            code_content: editor.value,
            language: selLang.value
          })
        });
      } catch (err) {
        // Bỏ qua lỗi tạm thời
      }
    }, 300);
  });

  // Quay lại bàn đấu
  btnBack.addEventListener("click", () => {
    returnToMatchRoom();
  });

  // Tải code mẫu gợi ý
  btnTemplate.addEventListener("click", () => {
    if (selLang.value === "CPP") {
      editor.value = DEFAULT_CPP_CODE;
    } else {
      editor.value = DEFAULT_PYTHON_CODE;
    }
  });

  selLang.addEventListener("change", () => {
    if (editor.value.trim() === "" || editor.value === DEFAULT_PYTHON_CODE || editor.value === DEFAULT_CPP_CODE) {
      editor.value = selLang.value === "CPP" ? DEFAULT_CPP_CODE : DEFAULT_PYTHON_CODE;
    }
  });

  // Đăng nhập đội tuyển
  btnAuth.addEventListener("click", async () => {
    if (!currentTournamentId || !currentActiveMatchId || !currentStudioSide) return;

    const sid = document.getElementById("studio-auth-sid").value.trim();
    const pass = document.getElementById("studio-auth-pass").value.trim();

    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/matches/${currentActiveMatchId}/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          side: currentStudioSide,
          student_id: sid,
          password: pass
        })
      });

      const data = await res.json();
      if (!res.ok) {
        notifyError("Đăng Nhập Thất Bại", data.detail || "Sai thông tin tài khoản hoặc mật khẩu!");
        return;
      }

      notifySuccess("Xác Thực Thành Công", "Đã mở khóa phòng thi đấu và IDE nộp mã lệnh.");
      document.getElementById("studio-auth-card").style.display = "none";
      document.getElementById("studio-ide-card").style.display = "flex";

      // Cập nhật dữ liệu
      await loadActiveTournament(currentTournamentId);
      const team = currentTournamentData.matches[currentActiveMatchId][currentStudioSide];
      populateStudioEditor(team);

    } catch (err) {
      console.error("Lỗi đăng nhập:", err);
      notifyError("Lỗi Kết Nối", "Không thể kết nối đến máy chủ API.");
    }
  });

  // Nộp mã lệnh Bot
  btnSubmitBot.addEventListener("click", async () => {
    if (!currentTournamentId || !currentActiveMatchId || !currentStudioSide) return;

    const code = editor.value.trim();
    if (!code) {
      notifyWarning("Thiếu Mã Lệnh", "Vui lòng viết mã lệnh bot trong khung soạn thảo trước khi nộp!");
      return;
    }

    const curRound = currentTournamentData?.matches[currentActiveMatchId]?.current_round_idx || 1;
    btnSubmitBot.disabled = true;
    btnSubmitBot.textContent = `Đang Nộp Mã Cho Round ${curRound}...`;

    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/matches/${currentActiveMatchId}/code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          side: currentStudioSide,
          code_content: code,
          language: selLang.value
        })
      });

      const data = await res.json();
      if (!res.ok) {
        notifyError("Lỗi Nộp Mã Lệnh", data.detail || "Không thể nộp bài vào hệ thống.");
        btnSubmitBot.disabled = false;
        btnSubmitBot.textContent = `NỘP MÃ LỆNH CHO ROUND ${curRound}`;
        return;
      }

      if (data.is_valid) {
        notifySuccess(`Nộp Bot Round ${curRound} Thành Công`, `Mã lệnh đã thẩm định qua Sandbox (${data.validation?.execution_time_ms || 0}ms). Trạng thái: ĐÃ SẴN SÀNG.`);
      } else {
        notifyWarning("Code Không Hợp Lệ", `${data.validation?.error_message || "Lỗi cú pháp/thực thi"}. Vui lòng sửa lại code.`);
      }

      btnSubmitBot.disabled = false;
      btnSubmitBot.textContent = `NỘP MÃ LỆNH CHO ROUND ${curRound}`;

      // Tải lại giải đấu và quay về bàn đấu
      await loadActiveTournament(currentTournamentId);
      returnToMatchRoom();

    } catch (err) {
      console.error("Lỗi nộp code:", err);
      notifyError("Lỗi Kết Nối", "Không thể kết nối đến máy chủ API.");
      btnSubmitBot.disabled = false;
      btnSubmitBot.textContent = `NỘP MÃ LỆNH CHO ROUND ${curRound}`;
    }
  });

  // Nút thử nghiệm với Bot Mẫu của Hệ Thống
  const btnPractice = document.getElementById("btn-studio-test-practice");
  if (btnPractice) {
    btnPractice.addEventListener("click", () => {
      handlePracticeMatch();
    });
  }
}

function returnToMatchRoom() {
  document.getElementById("team-private-studio-view").style.display = "none";
  currentStudioSide = null;

  if (currentUserRole === "ADMIN") {
    document.getElementById("match-room-view").style.display = "flex";
    if (currentTournamentData && currentActiveMatchId) {
      renderMatchRoomData(currentTournamentData.matches[currentActiveMatchId]);
    }
  } else {
    // Nếu là tuyển thủ thì quay về Sơ đồ giải đấu
    switchToBracketView();
    if (currentTournamentId) {
      loadActiveTournament(currentTournamentId);
    }
  }
}

// =============================================================================
// 6. TIẾN TRÌNH THI ĐẤU TỪNG ROUND MỘT (LIVE VISUAL ARENA DUEL ENGINE)
// =============================================================================
async function handleRefereeStartBattle() {
  if (!currentTournamentId || !currentActiveMatchId || isMatchRunning) return;

  // Quyền kiểm soát nghiêm ngặt: Chỉ Ban tổ chức (Admin) mới có quyền bấm bắt đầu
  if (currentUserRole !== "ADMIN") {
    notifyWarning("Quyền Hạn", "Chỉ Ban tổ chức (Admin) mới có quyền phát lệnh bắt đầu trận đấu!");
    return;
  }

  const match = currentTournamentData ? currentTournamentData.matches[currentActiveMatchId] : null;
  if (!match) return;

  // Backend và frontend cùng kiểm tra: Cả 2 đội phải có code hợp lệ
  const readyA = match.team_a && match.team_a.code_valid;
  const readyB = match.team_b && match.team_b.code_valid;
  if (!match.all_teams_ready && !(readyA && readyB)) {
    notifyWarning("Chưa Đủ Điều Kiện", "Cả hai đội phải nộp mã lệnh hợp lệ trước khi khai hỏa.");
    return;
  }

  isMatchRunning = true;
  const btn = document.getElementById("btn-referee-start");
  if (btn) {
    btn.disabled = true;
    btn.classList.add("running");
    btn.textContent = `ĐANG THI ĐẤU ROUND ${match.current_round_idx}...`;
  }

  const ticker = document.getElementById("live-commentary-ticker");
  if (ticker) ticker.textContent = `Khai hỏa Round ${match.current_round_idx}! Đã khóa mã nguồn 2 đội và khởi tạo bàn cờ 9x9...`;

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/matches/${currentActiveMatchId}/play-round`, {
      method: "POST"
    });

    const data = await res.json();
    if (!res.ok) {
      notifyError("Lỗi Thi Đấu", data.detail || "Không thể khởi chạy hiệp đấu.");
      if (btn) {
        btn.disabled = false;
        btn.classList.remove("running");
        btn.textContent = `BẮT ĐẦU TRẬN ĐẤU (ROUND ${match.current_round_idx})`;
      }
      return;
    }

    const record = data.round_record;

    // --- HIỆU ỨNG CHIẾN ĐẤU VÀ ĂN QUÂN TRỰC TIẾP TRÊN BÀN CỜ 9x9 ---
    if (record.board_steps && record.board_steps.length > 0) {
      for (let i = 0; i < record.board_steps.length; i++) {
        const step = record.board_steps[i];
        renderChessboard(step.red_pieces, step.blue_pieces, step.clash_event);
        if (ticker) ticker.textContent = step.log;
        await new Promise(r => setTimeout(r, 450));
      }
    }

    // Hiển thị thông báo kết thúc Round
    if (ticker) {
      ticker.textContent = record.win_reason ? record.win_reason.replace(/[🏆🏁⚔️⚡]/g, '').trim() : '';
    }

    // Cập nhật số round thắng và HP ở thẻ thông tin 2 đội
    const hpElA = document.getElementById("team-a-hp");
    const hpElB = document.getElementById("team-b-hp");
    const roundsA = document.getElementById("team-a-rounds-won");
    const roundsB = document.getElementById("team-b-rounds-won");
    const scoreSummary = document.getElementById("match-score-summary");

    if (hpElA) hpElA.textContent = `${record.team_a_hp} HP`;
    if (hpElB) hpElB.textContent = `${record.team_b_hp} HP`;
    if (roundsA && data.match && data.match.team_a) roundsA.textContent = data.match.team_a.rounds_won;
    if (roundsB && data.match && data.match.team_b) roundsB.textContent = data.match.team_b.rounds_won;
    if (scoreSummary && data.match) {
      scoreSummary.textContent = `Tỉ số: ${data.match.team_a ? data.match.team_a.rounds_won : 0} - ${data.match.team_b ? data.match.team_b.rounds_won : 0}`;
    }

    // Cập nhật 3 loại nhật ký và bảng submissions ngay lập tức
    renderCategorizedLogs(record);
    loadMatchSubmissions(currentActiveMatchId);

    // Xử lý chuyển round với đếm ngược 5 giây thống nhất từ backend
    if (!data.is_completed) {
      const intermissionBanner = document.getElementById("round-intermission-banner");
      const interTitle = document.getElementById("intermission-title");
      const countdownNum = document.getElementById("countdown-num");

      if (intermissionBanner) {
        intermissionBanner.style.display = "flex";
        if (interTitle) {
          interTitle.textContent = `ROUND ${record.round_number} HOÀN TẤT • TỈ SỐ: ĐỎ ${data.match?.team_a?.rounds_won || 0} - ${data.match?.team_b?.rounds_won || 0} XANH`;
        }
      }

      // Đếm ngược 5 giây chính xác
      for (let sec = 5; sec >= 1; sec--) {
        if (countdownNum) countdownNum.textContent = sec;
        await new Promise(r => setTimeout(r, 1000));
      }

      // Tự động gọi backend để chuyển sang round tiếp theo
      try {
        await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/matches/${currentActiveMatchId}/next-round`, {
          method: "POST"
        });
      } catch (e) {
        console.error("Lỗi tự động chuyển round:", e);
      }

      if (intermissionBanner) intermissionBanner.style.display = "none";
      await loadActiveTournament(currentTournamentId);

    } else {
      // Trận đấu kết thúc chung cuộc
      await loadActiveTournament(currentTournamentId);
    }

  } catch (err) {
    console.error("Lỗi chạy hiệp đấu:", err);
    notifyError("Lỗi Hệ Thống", "Có lỗi trong quá trình thi đấu.");
  } finally {
    isMatchRunning = false;
    if (btn) btn.classList.remove("running");
  }
}

async function handleQuickFillDemo() {
  if (!currentTournamentId || !currentActiveMatchId) return;

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/matches/${currentActiveMatchId}/demo-fill`, {
      method: "POST"
    });
    const data = await res.json();
    if (!res.ok) {
      notifyError("Lỗi Thao Tác", data.detail || "Không thể nạp.");
      return;
    }

    notifyInfo("Thông Báo", data.message || "");
    await loadActiveTournament(currentTournamentId);

  } catch (err) {
    console.error("Lỗi:", err);
  }
}

async function handleResetCurrentMatch() {
  if (!currentTournamentId || !currentActiveMatchId) return;

  if (!confirm("Bạn có chắc chắn muốn đặt lại trận đấu này về 0-0 ban đầu không?")) return;

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/matches/${currentActiveMatchId}/reset`, {
      method: "POST"
    });
    const data = await res.json();
    if (!res.ok) {
      notifyError("Lỗi Thao Tác", data.detail || "Không thể đặt lại.");
      return;
    }

    notifyInfo("Thông Báo", data.message || "");
    await loadActiveTournament(currentTournamentId);

  } catch (err) {
    console.error("Lỗi:", err);
  }
}

function renderRoundHistoryTable(historyList) {
  const tbody = document.getElementById("tbody-round-history");
  if (!historyList || historyList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Chưa đấu round nào trong trận này.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  historyList.forEach(r => {
    const tr = document.createElement("tr");

    const moveAIcon = PIECE_ICONS[r.team_a_move] || "BÚA";
    const moveBIcon = PIECE_ICONS[r.team_b_move] || "BÚA";

    let winText = "Hòa";
    if (r.winner === "team_a") winText = `<span class="text-danger" style="font-weight:700">Đội Đỏ Thắng</span>`;
    else if (r.winner === "team_b") winText = `<span class="text-primary" style="font-weight:700">Đội Xanh Thắng</span>`;

    tr.innerHTML = `
      <td><strong>Round ${r.round_number}</strong></td>
      <td>${moveAIcon} ${r.team_a_move}</td>
      <td>${moveBIcon} ${r.team_b_move}</td>
      <td>${winText}</td>
      <td style="font-size:12.5px">${escapeHtml(r.log)}</td>
      <td>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn btn-sm btn-primary btn-replay-round" data-round="${r.round_number}">
            ▶ Xem Replay
          </button>
          <button class="btn btn-sm btn-outline btn-view-round-code" data-round="${r.round_number}">
            Mã Lệnh
          </button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Gắn sự kiện xem Replay từng round
  document.querySelectorAll(".btn-replay-round").forEach(btn => {
    btn.addEventListener("click", () => {
      const rNum = parseInt(btn.dataset.round);
      if (currentActiveMatchId) openReplayModal(currentActiveMatchId, rNum);
    });
  });

  // Gắn sự kiện xem code từng round
  document.querySelectorAll(".btn-view-round-code").forEach(btn => {
    btn.addEventListener("click", () => {
      const rNum = parseInt(btn.dataset.round);
      const record = historyList.find(h => h.round_number === rNum);
      if (record) openCodeViewerModal(record);
    });
  });
}

// =============================================================================
// REPLAY VIEWER ENGINE & CATEGORIZED LOGS & KAGGLE SUBMISSIONS
// =============================================================================
let currentReplayRecord = null;
let currentReplayStepIdx = 0;
let replayPlayInterval = null;

function renderCategorizedLogs(lastRecord) {
  const moveList = document.getElementById("move-log-list");
  const botList = document.getElementById("bot-log-list");
  const systemList = document.getElementById("system-log-list");

  if (!lastRecord) {
    if (moveList) moveList.innerHTML = `<div class="log-empty-msg">Chưa có nước đi nào. Chờ khai hỏa trận đấu...</div>`;
    if (botList) botList.innerHTML = `<div class="log-empty-msg">Chưa có dữ liệu thực thi bot trong sandbox...</div>`;
    if (systemList) systemList.innerHTML = `<div class="log-empty-msg">Hệ thống đang ở trạng thái chờ bài nộp...</div>`;
    return;
  }

  if (moveList && lastRecord.move_logs) {
    moveList.innerHTML = lastRecord.move_logs.map(m => 
      `<div class="log-item-line ${m.is_clash ? 'clash' : ''}">[${m.turn_label}] ${escapeHtml(m.log)} (Đỏ: ${m.red_alive} vs Xanh: ${m.blue_alive})</div>`
    ).join("");
  }

  if (botList && lastRecord.bot_logs) {
    botList.innerHTML = lastRecord.bot_logs.map(b => 
      `<div class="log-item-line ${b.side === 'team_a' ? 'bot-a' : 'bot-b'}">[${b.side === 'team_a' ? 'ĐỘI ĐỎ' : 'ĐỘI XANH'}] [${b.status}] ${escapeHtml(b.log)}</div>`
    ).join("");
  }

  if (systemList && lastRecord.system_logs) {
    systemList.innerHTML = lastRecord.system_logs.map(s => 
      `<div class="log-item-line system">${escapeHtml(s)}</div>`
    ).join("");
  }
}

async function loadMatchSubmissions(matchId) {
  const tbody = document.getElementById("tbody-match-submissions");
  if (!tbody || !currentTournamentId || !matchId) return;

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/matches/${matchId}/submissions?role=${currentUserRole || 'ADMIN'}`);
    const subs = await res.json();
    if (!subs || subs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Chưa có bài nộp nào cho trận đấu này.</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    subs.slice().reverse().forEach(s => {
      const tr = document.createElement("tr");
      const d = new Date((s.submitted_at || Date.now() / 1000) * 1000);
      const timeStr = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      const sideText = s.side === "team_a" ? `<span class="text-danger" style="font-weight:700">Đội Đỏ (${escapeHtml(s.team_name)})</span>` : `<span class="text-primary" style="font-weight:700">Đội Xanh (${escapeHtml(s.team_name)})</span>`;
      const validText = s.is_valid
        ? `<span class="badge-tag" style="background:#dcfce7; color:#15803d; border:1px solid #86efac;">Hợp Lệ [OK] (${s.execution_time_ms || 0}ms)</span>`
        : `<span class="badge-tag" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5;" title="${escapeHtml(s.error_message || '')}">Không Hợp Lệ [FAIL]</span>`;
      const lockedText = s.is_locked
        ? `<span style="color:#d97706; font-weight:700;">Đã Khóa [LOCKED]</span>`
        : `<span style="color:#16a34a; font-weight:600;">Sẵn Sàng</span>`;

      tr.innerHTML = `
        <td><code>${escapeHtml(s.submission_id)}</code></td>
        <td>${sideText}</td>
        <td><strong>Round ${s.round_number}</strong></td>
        <td><span class="badge-tag">${escapeHtml(s.language || 'PYTHON')}</span></td>
        <td>${validText}</td>
        <td>${timeStr}</td>
        <td>${lockedText}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error("Lỗi tải submissions:", err);
  }
}

function openReplayModal(matchId, roundNum) {
  if (!currentTournamentData || !matchId) return;
  const match = currentTournamentData.matches[matchId];
  if (!match) return;

  const roundRec = match.rounds_history.find(r => r.round_number === roundNum);
  if (!roundRec || !roundRec.board_steps || roundRec.board_steps.length === 0) {
    notifyWarning("Không Tìm Thấy Replay", `Không có dữ liệu diễn biến bàn cờ cho Round ${roundNum}!`);
    return;
  }

  currentReplayRecord = roundRec;
  currentReplayStepIdx = 0;
  clearInterval(replayPlayInterval);
  replayPlayInterval = null;

  const modal = document.getElementById("modal-match-replay");
  const title = document.getElementById("replay-modal-title");
  const subtitle = document.getElementById("replay-modal-subtitle");
  const nameRed = document.getElementById("replay-name-red");
  const nameBlue = document.getElementById("replay-name-blue");
  const slider = document.getElementById("replay-step-slider");

  if (title) title.textContent = `Xem Lại Trận Đấu: Round ${roundNum} (${match.title.toUpperCase()})`;
  if (subtitle) subtitle.textContent = `Kết quả: ${roundRec.win_reason}`;
  if (nameRed) nameRed.textContent = roundRec.team_a_name;
  if (nameBlue) nameBlue.textContent = roundRec.team_b_name;

  if (slider) {
    slider.min = 0;
    slider.max = roundRec.board_steps.length - 1;
    slider.value = 0;
  }

  renderReplayStep(0);
  modal.style.display = "flex";
}

function renderReplayStep(stepIdx) {
  if (!currentReplayRecord || !currentReplayRecord.board_steps) return;
  const steps = currentReplayRecord.board_steps;
  if (stepIdx < 0) stepIdx = 0;
  if (stepIdx >= steps.length) stepIdx = steps.length - 1;
  currentReplayStepIdx = stepIdx;

  const step = steps[stepIdx];
  const boardEl = document.getElementById("replay-chessboard-9x9");
  if (!boardEl) return;

  if (boardEl.children.length !== 81) {
    boardEl.innerHTML = "";
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = document.createElement("div");
        cell.className = "board-cell";
        cell.dataset.col = c;
        cell.dataset.row = r;
        if ((r + c) % 2 === 1) cell.classList.add("cell-alt");
        if (c === 8 && r === 0) cell.classList.add("cell-target-red");
        if (c === 0 && r === 8) cell.classList.add("cell-target-blue");
        boardEl.appendChild(cell);
      }
    }
  }

  const cells = boardEl.querySelectorAll(".board-cell");
  cells.forEach(cell => {
    cell.innerHTML = "";
    cell.classList.remove("cell-clash");
  });

  let blueAlive = 0;
  if (step.blue_pieces) {
    step.blue_pieces.forEach(p => {
      if (!p.alive) return;
      blueAlive++;
      const cell = boardEl.querySelector(`.board-cell[data-col="${p.col}"][data-row="${p.row}"]`);
      if (cell) {
        const pieceEl = document.createElement("div");
        pieceEl.className = "board-piece piece-blue";
        pieceEl.textContent = PIECE_ICONS[p.type] || "BÚA";
        cell.appendChild(pieceEl);
      }
    });
  }

  let redAlive = 0;
  if (step.red_pieces) {
    step.red_pieces.forEach(p => {
      if (!p.alive) return;
      redAlive++;
      const cell = boardEl.querySelector(`.board-cell[data-col="${p.col}"][data-row="${p.row}"]`);
      if (cell) {
        const pieceEl = document.createElement("div");
        pieceEl.className = "board-piece piece-red";
        pieceEl.textContent = PIECE_ICONS[p.type] || "BÚA";
        cell.appendChild(pieceEl);
      }
    });
  }

  if (step.clash_event && typeof step.clash_event.col === "number") {
    const clashCell = boardEl.querySelector(`.board-cell[data-col="${step.clash_event.col}"][data-row="${step.clash_event.row}"]`);
    if (clashCell) clashCell.classList.add("cell-clash");
  }

  const indicator = document.getElementById("replay-step-indicator");
  const countRed = document.getElementById("replay-count-red");
  const countBlue = document.getElementById("replay-count-blue");
  const ticker = document.getElementById("replay-commentary-ticker");
  const slider = document.getElementById("replay-step-slider");
  const sliderLabel = document.getElementById("replay-slider-label");

  if (indicator) indicator.textContent = `BƯỚC ${stepIdx + 1} / ${steps.length}`;
  if (countRed) countRed.textContent = `${redAlive}/9 quân`;
  if (countBlue) countBlue.textContent = `${blueAlive}/9 quân`;
  if (ticker) ticker.textContent = `[${step.turn_label}] ${step.log}`;
  if (slider) slider.value = stepIdx;
  if (sliderLabel) sliderLabel.textContent = `Bước: ${stepIdx + 1} / ${steps.length}`;
}

function setupLogTabs() {
  const tabs = document.querySelectorAll(".log-tab-btn");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".log-pane").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      const targetPane = document.getElementById(tab.dataset.logTab);
      if (targetPane) targetPane.classList.add("active");
    });
  });
}

function openCodeViewerModal(record) {
  document.getElementById("view-code-modal-title").textContent = `Mã Lệnh Đã Thực Thi Ở Round ${record.round_number}`;
  document.getElementById("view-code-team-a-title").textContent = `Đội Đỏ (${record.team_a_lang || 'PYTHON'})`;
  document.getElementById("view-code-team-b-title").textContent = `Đội Xanh (${record.team_b_lang || 'PYTHON'})`;

  document.getElementById("view-code-content-a").textContent = record.team_a_code || "# Không có mã lệnh";
  document.getElementById("view-code-content-b").textContent = record.team_b_code || "# Không có mã lệnh";

  document.getElementById("modal-view-code").style.display = "flex";
}

// =============================================================================
// 7. MODALS (TẠO GIẢI ĐẤU & XEM CODE)
// =============================================================================
function setupModals() {
  const modalCreate = document.getElementById("modal-create-tournament");
  const btnOpenCreate = document.getElementById("btn-open-create-tourn");
  const btnCloseCreate = document.getElementById("btn-close-create-tourn");
  const btnCloseCreateX = document.getElementById("btn-close-create-tourn-x");
  const btnSubmitCreate = document.getElementById("btn-submit-create-tourn");

  btnOpenCreate.addEventListener("click", () => {
    modalCreate.style.display = "flex";
  });

  const closeModal = () => { modalCreate.style.display = "none"; };
  btnCloseCreate.addEventListener("click", closeModal);
  btnCloseCreateX.addEventListener("click", closeModal);

  btnSubmitCreate.addEventListener("click", async () => {
    const name = document.getElementById("inp-new-tourn-name").value.trim();
    const teamsInp = document.getElementById("inp-new-tourn-teams");
    const numTeams = teamsInp ? parseInt(teamsInp.value, 10) : 8;

    if (!name) {
      notifyWarning("Thiếu Tên Giải Đấu", "Vui lòng nhập tên giải đấu!");
      return;
    }

    if (isNaN(numTeams) || numTeams < 4 || (numTeams & (numTeams - 1)) !== 0) {
      notifyWarning("Quy Mô Không Hợp Lệ", "Số lượng đội phải là lũy thừa của 2 (4, 8, 16, 32...) để tạo nhánh đấu loại trực tiếp!");
      return;
    }

    btnSubmitCreate.disabled = true;
    btnSubmitCreate.textContent = "Đang khởi tạo...";

    try {
      const res = await fetch(`${API_BASE}/api/tournaments/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, num_teams: numTeams })
      });

      const data = await res.json();
      if (!res.ok) {
        notifyError("Lỗi Tạo Giải Đấu", data.detail || "Không thể tạo giải đấu mới.");
        btnSubmitCreate.disabled = false;
        btnSubmitCreate.textContent = "Khởi Tạo Giải Đấu";
        return;
      }

      notifySuccess("Khởi Tạo Giải Đấu", data.message || "Khởi tạo giải đấu thành công!");
      closeModal();
      btnSubmitCreate.disabled = false;
      btnSubmitCreate.textContent = "Khởi Tạo Giải Đấu";

      // Nạp lại danh sách giải đấu và chọn giải vừa tạo
      currentTournamentId = data.tournament.tournament_id;
      sessionStorage.setItem("activeTournamentId", currentTournamentId);
      await loadTournamentsList();

    } catch (err) {
      console.error("Lỗi tạo giải đấu:", err);
      notifyError("Lỗi Kết Nối", "Không thể kết nối đến máy chủ API.");
      btnSubmitCreate.disabled = false;
      btnSubmitCreate.textContent = "Khởi Tạo Giải Đấu";
    }
  });

  // Modal xem code
  const modalCode = document.getElementById("modal-view-code");
  const btnCloseCode = document.getElementById("btn-close-code-modal");
  const btnCloseCodeBtn = document.getElementById("btn-close-code-modal-btn");

  const closeCodeModal = () => { modalCode.style.display = "none"; };
  btnCloseCode.addEventListener("click", closeCodeModal);
  btnCloseCodeBtn.addEventListener("click", closeCodeModal);

  // Modal Quản Lý Đội Thi Đấu
  const modalTeamMgr = document.getElementById("modal-manage-teams");
  const btnCloseTeamMgr = document.getElementById("btn-close-team-mgr");
  const btnCloseTeamMgrX = document.getElementById("btn-close-team-mgr-x");
  const btnMgrAddTeam = document.getElementById("btn-mgr-add-team");
  const btnMgrQuickFill = document.getElementById("btn-mgr-quick-fill");
  const btnMgrAutoSchedule = document.getElementById("btn-mgr-auto-schedule");

  const closeTeamMgr = () => { if (modalTeamMgr) modalTeamMgr.style.display = "none"; };
  if (btnCloseTeamMgr) btnCloseTeamMgr.addEventListener("click", closeTeamMgr);
  if (btnCloseTeamMgrX) btnCloseTeamMgrX.addEventListener("click", closeTeamMgr);
  if (btnMgrAddTeam) btnMgrAddTeam.addEventListener("click", handleAddTeamSubmit);
  if (btnMgrQuickFill) btnMgrQuickFill.addEventListener("click", handleQuickFillTeams);
  if (btnMgrAutoSchedule) btnMgrAutoSchedule.addEventListener("click", handleAutoSchedule);

  // Modal Đăng Nhập Trận Đấu (2 Trường Duy Nhất: Tài Khoản & Mật Khẩu)
  const btnCloseMatchLogin = document.getElementById("btn-close-match-login");
  const btnCloseMatchLoginX = document.getElementById("btn-close-match-login-x");
  const btnSubmitUnifiedLogin = document.getElementById("btn-submit-unified-login");
  const inpMatchLoginPass = document.getElementById("inp-match-login-pass");

  if (btnCloseMatchLogin) btnCloseMatchLogin.addEventListener("click", closeMatchLoginModal);
  if (btnCloseMatchLoginX) btnCloseMatchLoginX.addEventListener("click", closeMatchLoginModal);
  if (btnSubmitUnifiedLogin) btnSubmitUnifiedLogin.addEventListener("click", handleUnifiedLogin);
  if (inpMatchLoginPass) {
    inpMatchLoginPass.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleUnifiedLogin();
    });
  }

  // Modal Bàn Đấu Thử Nghiệm với Bot Mẫu (Hỗ trợ nút X và nút thoát tức thì)
  const btnClosePractice = document.getElementById("btn-close-practice");
  const btnClosePracticeX = document.getElementById("btn-close-practice-x");
  const btnPracticeExitInline = document.getElementById("btn-practice-exit-inline");

  if (btnClosePractice) btnClosePractice.addEventListener("click", closePracticeArenaModal);
  if (btnClosePracticeX) btnClosePracticeX.addEventListener("click", closePracticeArenaModal);
  if (btnPracticeExitInline) btnPracticeExitInline.addEventListener("click", closePracticeArenaModal);

  // Hỗ trợ phím Escape thoát nhanh chế độ thử nghiệm
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const modalPractice = document.getElementById("modal-practice-arena");
      if (modalPractice && modalPractice.style.display !== "none") {
        closePracticeArenaModal();
      }
      const modalReplay = document.getElementById("modal-match-replay");
      if (modalReplay && modalReplay.style.display !== "none") {
        clearInterval(replayPlayInterval);
        replayPlayInterval = null;
        modalReplay.style.display = "none";
      }
    }
  });

  // Modal Xem Lại Trận Đấu Step-by-Step (Match Replay Viewer)
  const btnCloseReplay = document.getElementById("btn-close-replay");
  const btnCloseReplayX = document.getElementById("btn-close-replay-x");
  const btnReplayPrev = document.getElementById("btn-replay-prev");
  const btnReplayNext = document.getElementById("btn-replay-next");
  const btnReplayPlayPause = document.getElementById("btn-replay-play-pause");
  const replaySlider = document.getElementById("replay-step-slider");

  const closeReplay = () => {
    clearInterval(replayPlayInterval);
    replayPlayInterval = null;
    const modal = document.getElementById("modal-match-replay");
    if (modal) modal.style.display = "none";
  };
  if (btnCloseReplay) btnCloseReplay.addEventListener("click", closeReplay);
  if (btnCloseReplayX) btnCloseReplayX.addEventListener("click", closeReplay);

  if (btnReplayPrev) {
    btnReplayPrev.addEventListener("click", () => {
      clearInterval(replayPlayInterval);
      replayPlayInterval = null;
      if (btnReplayPlayPause) btnReplayPlayPause.textContent = "▶ Tự Động Chạy";
      renderReplayStep(currentReplayStepIdx - 1);
    });
  }

  if (btnReplayNext) {
    btnReplayNext.addEventListener("click", () => {
      clearInterval(replayPlayInterval);
      replayPlayInterval = null;
      if (btnReplayPlayPause) btnReplayPlayPause.textContent = "▶ Tự Động Chạy";
      renderReplayStep(currentReplayStepIdx + 1);
    });
  }

  if (btnReplayPlayPause) {
    btnReplayPlayPause.addEventListener("click", () => {
      if (replayPlayInterval) {
        clearInterval(replayPlayInterval);
        replayPlayInterval = null;
        btnReplayPlayPause.textContent = "▶ Tự Động Chạy";
      } else {
        btnReplayPlayPause.textContent = "Tạm Dừng";
        if (currentReplayRecord && currentReplayStepIdx >= currentReplayRecord.board_steps.length - 1) {
          renderReplayStep(0);
        }
        replayPlayInterval = setInterval(() => {
          if (!currentReplayRecord || currentReplayStepIdx >= currentReplayRecord.board_steps.length - 1) {
            clearInterval(replayPlayInterval);
            replayPlayInterval = null;
            btnReplayPlayPause.textContent = "▶ Tự Động Chạy";
            return;
          }
          renderReplayStep(currentReplayStepIdx + 1);
        }, 600);
      }
    });
  }

  if (replaySlider) {
    replaySlider.addEventListener("input", (e) => {
      clearInterval(replayPlayInterval);
      replayPlayInterval = null;
      if (btnReplayPlayPause) btnReplayPlayPause.textContent = "▶ Tự Động Chạy";
      renderReplayStep(parseInt(e.target.value));
    });
  }

  // Nút làm mới danh sách bài nộp Kaggle Submissions
  const btnRefreshSubs = document.getElementById("btn-refresh-submissions");
  if (btnRefreshSubs) {
    btnRefreshSubs.addEventListener("click", () => {
      if (currentActiveMatchId) loadMatchSubmissions(currentActiveMatchId);
    });
  }

  // Khởi tạo chuyển tabs nhật ký
  setupLogTabs();
}

// =============================================================================
// 7.1. ĐĂNG NHẬP VÀO VÁN ĐẤU (CHỈ 2 TRƯỜNG: TÀI KHOẢN & MẬT KHẨU)
// =============================================================================
function handleMatchCardClick(matchId) {
  if (!currentTournamentData || !currentTournamentData.matches[matchId]) return;
  const match = currentTournamentData.matches[matchId];

  // Nếu trận đấu chưa có đội nào được sắp (do chưa bấm Tự Sắp Xếp Lịch)
  if (!match.team_a && !match.team_b) {
    const shouldOpen = confirm(
      `Trận đấu "${match.title}" chưa có đội nào được ghép cặp.\n\nBạn cần mở mục "Đội Thi Đấu" và bấm "Tự Sắp Xếp Lịch Đấu" để xếp các đội vào sơ đồ.\n\nBạn có muốn mở bảng Quản Lý Đội ngay không?`
    );
    if (shouldOpen) {
      openTeamManagerModal();
    }
    return;
  }

  // Mở modal đăng nhập 2 trường tự nhập
  openMatchLoginModal(matchId);
}

function openMatchLoginModal(matchId) {
  if (!currentTournamentData || !currentTournamentData.matches[matchId]) return;
  pendingLoginMatchId = matchId;
  const match = currentTournamentData.matches[matchId];

  const modal = document.getElementById("modal-match-login");
  const titleEl = document.getElementById("login-modal-match-title");
  if (titleEl) titleEl.textContent = `Đăng Nhập Trận Đấu: ${match.title.toUpperCase()}`;

  const userInp = document.getElementById("inp-match-login-user");
  const passInp = document.getElementById("inp-match-login-pass");
  const alertEl = document.getElementById("login-feedback-alert");
  const guideTeams = document.getElementById("login-guide-teams-info");

  if (userInp) userInp.value = "";
  if (passInp) passInp.value = "";
  if (alertEl) {
    alertEl.style.display = "none";
    alertEl.textContent = "";
  }

  const teamA = match.team_a;
  const teamB = match.team_b;
  if (guideTeams) {
    const nameA = teamA ? `${teamA.team_name} (${teamA.student_id})` : "Chưa xác định";
    const nameB = teamB ? `${teamB.team_name} (${teamB.student_id})` : "Chưa xác định";
    guideTeams.textContent = `Đội Đỏ: ${nameA} | Đội Xanh: ${nameB} (mật khẩu: 12345)`;
  }

  modal.style.display = "flex";
  if (userInp) userInp.focus();
}

function closeMatchLoginModal() {
  const modal = document.getElementById("modal-match-login");
  if (modal) modal.style.display = "none";
  pendingLoginMatchId = null;
}

async function handleUnifiedLogin() {
  if (!currentTournamentId || !pendingLoginMatchId) return;

  const userInp = document.getElementById("inp-match-login-user");
  const passInp = document.getElementById("inp-match-login-pass");
  const alertEl = document.getElementById("login-feedback-alert");
  const btnSubmit = document.getElementById("btn-submit-unified-login");

  const username = userInp ? userInp.value.trim() : "";
  const password = passInp ? passInp.value.trim() : "";

  if (!username) {
    if (alertEl) {
      alertEl.textContent = "Vui lòng nhập tài khoản (MSSV, tên đội hoặc 'admin')!";
      alertEl.style.display = "block";
    }
    if (userInp) userInp.focus();
    return;
  }

  if (!password) {
    if (alertEl) {
      alertEl.textContent = "Vui lòng nhập mật khẩu!";
      alertEl.style.display = "block";
    }
    if (passInp) passInp.focus();
    return;
  }

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = "Đang xác thực...";
  }
  if (alertEl) alertEl.style.display = "none";

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/matches/${pendingLoginMatchId}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: username,
        password: password
      })
    });

    const data = await res.json();

    if (!res.ok) {
      if (alertEl) {
        alertEl.textContent = data.detail || "Đăng nhập thất bại. Vui lòng kiểm tra lại tài khoản và mật khẩu!";
        alertEl.style.display = "block";
      }
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Đăng Nhập Vào Ván Đấu";
      }
      return;
    }

    // Đăng nhập thành công
    const matchId = pendingLoginMatchId;
    currentUserRole = data.role; // "ADMIN", "TEAM_A", "TEAM_B"
    currentActiveMatchId = matchId;

    sessionStorage.setItem("userRole", data.role);
    sessionStorage.setItem("activeMatchId", matchId);

    closeMatchLoginModal();

    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = "Đăng Nhập Vào Ván Đấu";
    }

    if (data.role === "ADMIN") {
      currentStudioSide = null;
      sessionStorage.removeItem("studioSide");
      openMatchRoom(matchId);
    } else {
      const side = data.side; // "team_a" hoặc "team_b"
      currentStudioSide = side;
      sessionStorage.setItem("studioSide", side);
      openPrivateStudioDirect(side);
    }

  } catch (err) {
    console.error("Lỗi xác thực đăng nhập:", err);
    if (alertEl) {
      alertEl.textContent = "Lỗi kết nối máy chủ. Vui lòng thử lại!";
      alertEl.style.display = "block";
    }
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = "Đăng Nhập Vào Ván Đấu";
    }
  }
}

function openPrivateStudioDirect(side) {
  if (!currentTournamentData || !currentActiveMatchId) return;
  const match = currentTournamentData.matches[currentActiveMatchId];
  const team = match ? match[side] : null;
  if (!team) return;

  currentStudioSide = side;

  document.getElementById("match-room-view").style.display = "none";
  document.getElementById("tournament-tree-view").style.display = "none";
  const studioView = document.getElementById("team-private-studio-view");
  studioView.style.display = "flex";

  const sideColorName = side === "team_a" ? "ĐỘI ĐỎ" : "ĐỘI XANH";
  document.getElementById("studio-main-title").textContent = `PHÒNG NỘP BOT: ${team.team_name.toUpperCase()} (${sideColorName})`;
  document.getElementById("studio-team-identity").textContent = `MSSV: ${team.student_id} • ${team.university || 'Khối Kỹ Thuật'}`;

  const titleTarget = document.getElementById("studio-round-target-title");
  if (titleTarget) {
    titleTarget.textContent = `Đang Soạn Mã Lệnh Cho Round ${match.current_round_idx} / 5 (${match.round_name})`;
  }

  const chipsContainer = document.getElementById("studio-intel-history-chips");
  if (chipsContainer) {
    if (match.rounds_history && match.rounds_history.length > 0) {
      chipsContainer.innerHTML = match.rounds_history.map(r => {
        const myMove = side === "team_a" ? r.team_a_move : r.team_b_move;
        const oppMove = side === "team_a" ? r.team_b_move : r.team_a_move;
        const myWin = (side === "team_a" && r.winner === "team_a") || (side === "team_b" && r.winner === "team_b");
        const isDraw = r.winner === "draw";
        const tag = myWin ? "BẠN THẮNG" : (isDraw ? "HÒA" : "BẠN THUA");
        return `<span class="intel-chip">Round ${r.round_number}: Bạn ra <strong>${myMove}</strong> vs Đối thủ ra <strong>${oppMove}</strong> [${tag}]</span>`;
      }).join("") + `<div style="font-size:12px; color:#166534; width:100%; margin-top:4px;"><em>Gợi ý chiến thuật: Quan sát nước đi hiệp trước của đối phương để cải tiến code!</em></div>`;
    } else {
      chipsContainer.innerHTML = `<span class="intel-chip">Chưa có lịch sử hiệp trước. Hãy viết mã lệnh khởi động cho Round 1!</span>`;
    }
  }

  const btnSubmitBot = document.getElementById("btn-studio-submit-bot");
  if (btnSubmitBot) {
    btnSubmitBot.textContent = `NỘP MÃ LỆNH CHO ROUND ${match.current_round_idx}`;
  }

  // Đã đăng nhập bằng mật khẩu 12345 nên mở khóa thẳng IDE
  team.authenticated = true;
  document.getElementById("studio-auth-card").style.display = "none";
  document.getElementById("studio-ide-card").style.display = "flex";
  populateStudioEditor(team);
}

function renderAdminLiveCodeMonitor(match) {
  const monitor = document.getElementById("admin-live-code-monitor");
  if (!monitor) return;

  if (currentUserRole === "ADMIN") {
    monitor.style.display = "block";
    const teamA = match.team_a;
    const teamB = match.team_b;

    const nameA = document.getElementById("monitor-team-a-name");
    const langA = document.getElementById("monitor-team-a-lang");
    const codeA = document.getElementById("monitor-code-a");
    if (nameA) nameA.textContent = teamA ? teamA.team_name : "Đội Đỏ";
    if (langA) langA.textContent = teamA ? (teamA.draft_lang || teamA.current_lang || "PYTHON") : "PYTHON";
    if (codeA) {
      const contentA = (teamA && (teamA.draft_code || teamA.current_code)) ? (teamA.draft_code || teamA.current_code) : "# Đội Đỏ chưa nộp mã lệnh...";
      codeA.textContent = contentA;
    }

    const nameB = document.getElementById("monitor-team-b-name");
    const langB = document.getElementById("monitor-team-b-lang");
    const codeB = document.getElementById("monitor-code-b");
    if (nameB) nameB.textContent = teamB ? teamB.team_name : "Đội Xanh";
    if (langB) langB.textContent = teamB ? (teamB.draft_lang || teamB.current_lang || "PYTHON") : "PYTHON";
    if (codeB) {
      const contentB = (teamB && (teamB.draft_code || teamB.current_code)) ? (teamB.draft_code || teamB.current_code) : "# Đội Xanh chưa nộp mã lệnh...";
      codeB.textContent = contentB;
    }
  } else {
    monitor.style.display = "none";
  }
}

// =============================================================================
// 7.2. QUẢN LÝ CÁC ĐỘI THI ĐẤU & TỰ ĐỘNG SẮP XẾP LỊCH ĐẤU
// =============================================================================
function openTeamManagerModal() {
  if (!currentTournamentData) return;
  const modal = document.getElementById("modal-manage-teams");
  if (!modal) return;

  const tourNameEl = document.getElementById("team-mgr-tourn-name");
  if (tourNameEl) tourNameEl.textContent = currentTournamentData.name;

  const reqEl = document.getElementById("mgr-required-count");
  if (reqEl) reqEl.textContent = `${currentTournamentData.num_teams} Đội`;

  renderTeamManagerTable();
  modal.style.display = "flex";
}

function renderTeamManagerTable() {
  const tbody = document.getElementById("tbody-mgr-teams");
  if (!tbody || !currentTournamentData) return;

  const teams = currentTournamentData.teams || [];
  const cap = currentTournamentData.num_teams;

  const badge = document.getElementById("count-teams-badge");
  if (badge) badge.textContent = `${teams.length}/${cap}`;

  const reqCountEl = document.getElementById("mgr-required-count");
  if (reqCountEl) reqCountEl.textContent = `${cap} Đội`;

  const curCountEl = document.getElementById("mgr-current-count");
  if (curCountEl) curCountEl.textContent = `${teams.length} Đội`;

  const statusPill = document.getElementById("mgr-status-pill");
  if (statusPill) {
    if (teams.length >= cap) {
      statusPill.textContent = "Đã Đủ Số Đội";
      statusPill.className = "mgr-status-badge success";
    } else {
      statusPill.textContent = `Thiếu ${cap - teams.length} Đội`;
      statusPill.className = "mgr-status-badge";
    }
  }

  if (teams.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Chưa có đội nào đăng ký vào giải này.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  teams.forEach((t, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>#${t.seed || (idx + 1)}</strong></td>
      <td><strong>${escapeHtml(t.team_name)}</strong></td>
      <td><code>${escapeHtml(t.student_id)}</code></td>
      <td>${escapeHtml(t.university || 'Khối Kỹ Thuật')}</td>
      <td>
        <button class="btn btn-sm btn-outline btn-delete-team" data-sid="${escapeHtml(t.student_id)}" style="color:#dc2626; border-color:#fca5a5;">
          Xóa
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".btn-delete-team").forEach(btn => {
    btn.addEventListener("click", () => {
      handleDeleteTeam(btn.dataset.sid);
    });
  });
}

async function handleAddTeamSubmit() {
  if (!currentTournamentId || !currentTournamentData) return;

  const nameInp = document.getElementById("mgr-inp-name");
  const sidInp = document.getElementById("mgr-inp-sid");
  const uniInp = document.getElementById("mgr-inp-uni");

  const name = nameInp ? nameInp.value.trim() : "";
  const sid = sidInp ? sidInp.value.trim() : "";
  const uni = uniInp ? uniInp.value.trim() : "";

  if (!name || !sid) {
    notifyWarning("Thiếu Thông Tin", "Vui lòng nhập Tên Đội và Mã Số Sinh Viên (MSSV)!");
    return;
  }

  const btn = document.getElementById("btn-mgr-add-team");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Đang Thêm...";
  }

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team_name: name,
        student_id: sid,
        university: uni || "Khối Kỹ Thuật"
      })
    });

    const data = await res.json();
    if (!res.ok) {
      notifyError("Không Thể Thêm Đội", data.detail || "Lỗi thêm đội.");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "+ Thêm Đội Vào Giải";
      }
      return;
    }

    if (nameInp) nameInp.value = "";
    if (sidInp) sidInp.value = "";
    if (uniInp) uniInp.value = "Khối Kỹ Thuật";

    if (btn) {
      btn.disabled = false;
      btn.textContent = "+ Thêm Đội Vào Giải";
    }

    notifySuccess("Thêm Đội Thành Công", data.message || `Đã thêm thành công đội ${name}!`);
    await loadActiveTournament(currentTournamentId);
    renderTeamManagerTable();

  } catch (err) {
    console.error("Lỗi thêm đội:", err);
    notifyError("Lỗi Kết Nối", "Không thể kết nối đến máy chủ API.");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "+ Thêm Đội Vào Giải";
    }
  }
}

async function handleDeleteTeam(studentId) {
  if (!currentTournamentId) return;
  if (!confirm(`Bạn có chắc muốn xóa đội có MSSV '${studentId}' khỏi danh sách giải đấu?`)) return;

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/teams/${studentId}`, {
      method: "DELETE"
    });
    const data = await res.json();
    if (!res.ok) {
      notifyError("Lỗi Xóa Đội", data.detail || "Không thể xóa đội khỏi giải.");
      return;
    }

    await loadActiveTournament(currentTournamentId);
    renderTeamManagerTable();

  } catch (err) {
    console.error("Lỗi xóa đội:", err);
    notifyError("Lỗi Kết Nối", "Không thể kết nối đến máy chủ API.");
  }
}

async function handleQuickFillTeams() {
  if (!currentTournamentId) return;

  const btn = document.getElementById("btn-mgr-quick-fill");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Đang Nạp...";
  }

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/teams/quick-fill`, {
      method: "POST"
    });
    const data = await res.json();
    if (!res.ok) {
      notifyError("Lỗi Nạp Đội Mẫu", data.detail || "Không thể nạp danh sách mẫu.");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Nạp Nhanh Đội Mẫu (Cho Đủ Số Lượng)";
      }
      return;
    }

    if (btn) {
      btn.disabled = false;
      btn.textContent = "Nạp Nhanh Đội Mẫu (Cho Đủ Số Lượng)";
    }

    notifySuccess("Nạp Đội Mẫu Thành Công", data.message || "Đã nạp nhanh đủ danh sách đội mẫu!");
    await loadActiveTournament(currentTournamentId);
    renderTeamManagerTable();

  } catch (err) {
    console.error("Lỗi nạp nhanh đội:", err);
    notifyError("Lỗi Kết Nối", "Không thể kết nối đến máy chủ API.");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Nạp Nhanh Đội Mẫu (Cho Đủ Số Lượng)";
    }
  }
}

async function handleAutoSchedule() {
  if (!currentTournamentId || !currentTournamentData) return;

  const teams = currentTournamentData.teams || [];
  const required = currentTournamentData.num_teams;

  if (teams.length !== required) {
    notifyWarning("Chưa Đủ Số Lượng Đội", `Giải đấu yêu cầu đúng ${required} đội (hiện có ${teams.length} đội). Vui lòng thêm đủ trước khi xếp lịch!`);
    return;
  }

  const btn = document.getElementById("btn-mgr-auto-schedule");
  btn.disabled = true;
  btn.textContent = "Đang Sắp Xếp...";

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/auto-schedule`, {
      method: "POST"
    });
    const data = await res.json();
    if (!res.ok) {
      notifyError("Lỗi Xếp Lịch", data.detail || "Không thể xếp lịch thi đấu.");
      btn.disabled = false;
      btn.textContent = "Tự Sắp Xếp Lịch Đấu";
      return;
    }

    btn.disabled = false;
    btn.textContent = "Tự Sắp Xếp Lịch Đấu";

    notifySuccess("Xếp Lịch Hoàn Tất", "Đã phân nhánh các đội vào sơ đồ giải đấu.");
    const modalMgr = document.getElementById("modal-manage-teams");
    if (modalMgr) modalMgr.style.display = "none";

    await loadActiveTournament(currentTournamentId);
    switchToBracketView();

  } catch (err) {
    console.error("Lỗi tự sắp xếp lịch:", err);
    notifyError("Lỗi Kết Nối", "Không thể kết nối đến máy chủ API.");
    btn.disabled = false;
    btn.textContent = "Tự Sắp Xếp Lịch Đấu";
  }
}

// =============================================================================
// 7.3. THỬ NGHIỆM VỚI BOT MẪU TRÊN BÀN CỜ 9x9 (PRACTICE MODE)
// =============================================================================
async function handlePracticeMatch() {
  if (!currentTournamentId) return;

  const editor = document.getElementById("studio-code-editor");
  const selLang = document.getElementById("studio-sel-lang");
  const code = editor.value.trim();

  if (!code) {
    notifyWarning("Thiếu Mã Lệnh", "Vui lòng viết mã bot trong khung soạn thảo trước khi thử nghiệm!");
    return;
  }

  const btnPractice = document.getElementById("btn-studio-test-practice");
  btnPractice.disabled = true;
  btnPractice.textContent = "Đang Chạy Thử Nghiệm...";

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/practice-match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code_content: code,
        language: selLang.value,
        side: currentStudioSide || "team_a"
      })
    });

    const data = await res.json();
    if (!res.ok) {
      notifyError("Lỗi Thử Nghiệm", data.detail || "Không thể mô phỏng trận đấu.");
      btnPractice.disabled = false;
      btnPractice.textContent = "Thử Nghiệm Với Bot Mẫu";
      return;
    }

    btnPractice.disabled = false;
    btnPractice.textContent = "Thử Nghiệm Với Bot Mẫu";

    // Mở modal bàn đấu thử nghiệm
    openPracticeArenaModal(data);

  } catch (err) {
    console.error("Lỗi thử nghiệm:", err);
    notifyError("Lỗi Kết Nối", "Không thể kết nối đến máy chủ API.");
    btnPractice.disabled = false;
    btnPractice.textContent = "Thử Nghiệm Với Bot Mẫu";
  }
}

function initPracticeChessboardGrid() {
  const boardEl = document.getElementById("practice-chessboard-9x9");
  if (!boardEl) return;
  boardEl.innerHTML = "";

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement("div");
      cell.className = "board-cell";
      cell.dataset.col = c;
      cell.dataset.row = r;

      if ((r + c) % 2 === 1) {
        cell.classList.add("cell-alt");
      }
      if (c === 8 && r === 0) {
        cell.classList.add("cell-target-red");
        cell.title = "Cứ điểm Đích của Đội Đỏ [8, 0]";
      }
      if (c === 0 && r === 8) {
        cell.classList.add("cell-target-blue");
        cell.title = "Cứ điểm Đích của Đội Xanh [0, 8]";
      }
      boardEl.appendChild(cell);
    }
  }
}

function renderPracticeChessboard(redPieces, bluePieces, clashEvent = null) {
  const boardEl = document.getElementById("practice-chessboard-9x9");
  if (!boardEl) return;

  if (boardEl.children.length !== 81) {
    initPracticeChessboardGrid();
  }

  const cells = boardEl.querySelectorAll(".board-cell");
  cells.forEach(cell => {
    cell.innerHTML = "";
    cell.classList.remove("cell-clash");
  });

  let blueAlive = 0;
  if (bluePieces && Array.isArray(bluePieces)) {
    bluePieces.forEach(p => {
      if (!p.alive) return;
      blueAlive++;
      const cell = boardEl.querySelector(`.board-cell[data-col="${p.col}"][data-row="${p.row}"]`);
      if (cell) {
        const pieceEl = document.createElement("div");
        pieceEl.className = "board-piece piece-blue";
        pieceEl.textContent = PIECE_ICONS[p.type] || "Búa";
        pieceEl.title = `Quân Bot Mẫu: ${p.type}`;
        cell.appendChild(pieceEl);
      }
    });
  }

  let redAlive = 0;
  if (redPieces && Array.isArray(redPieces)) {
    redPieces.forEach(p => {
      if (!p.alive) return;
      redAlive++;
      const cell = boardEl.querySelector(`.board-cell[data-col="${p.col}"][data-row="${p.row}"]`);
      if (cell) {
        const pieceEl = document.createElement("div");
        pieceEl.className = "board-piece piece-red";
        pieceEl.textContent = PIECE_ICONS[p.type] || "Búa";
        pieceEl.title = `Quân Của Bạn: ${p.type}`;
        cell.appendChild(pieceEl);
      }
    });
  }

  const badgeUser = document.getElementById("practice-count-user");
  const badgeBench = document.getElementById("practice-count-bench");
  if (badgeUser) badgeUser.textContent = `${redAlive}/9 quân`;
  if (badgeBench) badgeBench.textContent = `${blueAlive}/9 quân`;

  if (clashEvent && typeof clashEvent.col === "number" && typeof clashEvent.row === "number") {
    const clashCell = boardEl.querySelector(`.board-cell[data-col="${clashEvent.col}"][data-row="${clashEvent.row}"]`);
    if (clashCell) {
      clashCell.classList.add("cell-clash");
    }
  }
}

async function openPracticeArenaModal(simResult) {
  practiceSimCancelToken = false;
  const modal = document.getElementById("modal-practice-arena");
  modal.style.display = "flex";

  const banner = document.getElementById("practice-result-banner");
  if (banner) banner.style.display = "none";

  const ticker = document.getElementById("practice-commentary-ticker");
  if (ticker) ticker.textContent = "Bắt đầu trận đấu thử nghiệm 9x9... Đang triển khai quân cờ!";

  initPracticeChessboardGrid();

  const initPieces = getInitialBoardPieces();
  renderPracticeChessboard(initPieces.red, initPieces.blue);

  const steps = simResult.board_steps || [];
  if (steps.length > 0) {
    for (let i = 0; i < steps.length; i++) {
      if (modal.style.display === "none" || practiceSimCancelToken) break;
      const st = steps[i];
      renderPracticeChessboard(st.red_pieces, st.blue_pieces, st.clash_event);
      if (ticker) ticker.textContent = st.log || `Bước ${st.step}`;
      await new Promise(r => setTimeout(r, 220));
    }
  }

  if (banner && modal.style.display !== "none" && !practiceSimCancelToken) {
    banner.style.display = "block";
    const titleEl = document.getElementById("practice-result-title");
    const descEl = document.getElementById("practice-result-desc");

    banner.className = "practice-result-banner";
    if (simResult.winner === "team_a") {
      banner.classList.add("win");
      if (titleEl) titleEl.textContent = "CHIẾN THẮNG TRẬN THỬ NGHIỆM!";
      if (descEl) descEl.textContent = `Thuật toán của bạn đã đánh bại Bot Mẫu của Hệ Thống (${simResult.win_reason}). Bạn đã sẵn sàng nộp mã cho giải chính!`;
    } else if (simResult.winner === "team_b") {
      banner.classList.add("loss");
      if (titleEl) titleEl.textContent = "CHƯA CHIẾN THẮNG TRẬN THỬ!";
      if (descEl) descEl.textContent = `Bot Mẫu đã giành chiến thắng (${simResult.win_reason}). Hãy kiểm tra và tinh chỉnh lại thuật toán decide_move!`;
    } else {
      if (titleEl) titleEl.textContent = "KẾT QUẢ HÒA!";
      if (descEl) descEl.textContent = `Hai bên bất phân thắng bại (${simResult.win_reason}). Bạn có thể tối ưu thêm chiến thuật di chuyển.`;
    }
  }
}

function closePracticeArenaModal() {
  practiceSimCancelToken = true;
  const modal = document.getElementById("modal-practice-arena");
  if (modal) modal.style.display = "none";
}


// =============================================================================
// 8. TAB 2: XEM TOÀN DIỆN DANH SÁCH CÁC ĐỘI (TEAMS OVERVIEW)
// =============================================================================
async function loadTeamsOverview() {
  if (!currentTournamentId) return;

  const tbody = document.getElementById("tbody-teams-overview");
  tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">Đang tải danh sách các đội...</td></tr>`;

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/teams`);
    const teams = await res.json();
    allTeamsCache = teams;
    renderTeamsOverviewTable(teams);

    const searchInp = document.getElementById("inp-search-teams");
    searchInp.oninput = () => {
      const q = searchInp.value.toLowerCase().trim();
      const filtered = allTeamsCache.filter(t => 
        t.team_name.toLowerCase().includes(q) || 
        t.student_id.toLowerCase().includes(q)
      );
      renderTeamsOverviewTable(filtered);
    };

  } catch (err) {
    console.error("Lỗi tải danh sách đội:", err);
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">Không thể nạp danh sách đội.</td></tr>`;
  }
}

function renderTeamsOverviewTable(teams) {
  const tbody = document.getElementById("tbody-teams-overview");
  if (!teams || teams.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">Không có dữ liệu đội tuyển.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  teams.forEach(t => {
    const tr = document.createElement("tr");

    let statusHtml = `<span style="color:#16a34a; font-weight:700">Đang Tranh Tài</span>`;
    if (t.status === "CHAMPION") {
      statusHtml = `<span style="color:#d97706; font-weight:800">QUÁN QUÂN</span>`;
    } else if (t.status === "ELIMINATED") {
      statusHtml = `<span style="color:#64748b">Dừng Bước</span>`;
    }

    tr.innerHTML = `
      <td><strong>#${t.seed || '-'}</strong></td>
      <td><strong>${escapeHtml(t.team_name)}</strong></td>
      <td><code>${escapeHtml(t.student_id)}</code></td>
      <td>${escapeHtml(t.university || 'ICPC K69')}</td>
      <td>${escapeHtml(t.current_stage || 'Tứ Kết')}</td>
      <td>${statusHtml}</td>
      <td>${t.matches_won || 0}</td>
      <td>${t.rounds_won || 0}</td>
      <td><strong>${t.elo || 1200}</strong></td>
    `;
    tbody.appendChild(tr);
  });
}

// =============================================================================
// 9. TAB 3: NHẬT KÝ & LỊCH SỬ TRẬN ĐẤU (GLOBAL MATCH HISTORY)
// =============================================================================
async function loadGlobalMatchHistory() {
  const tbody = document.getElementById("tbody-matches");
  tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Đang nạp dữ liệu lịch sử...</td></tr>`;

  try {
    const res = await fetch(`${API_BASE}/api/matches/history`);
    const history = await res.json();

    if (!history || history.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Chưa có trận đấu nào được lưu lại.</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    history.forEach(m => {
      const tr = document.createElement("tr");
      const d = new Date(m.timestamp * 1000);
      const timeStr = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')} ${d.getDate()}/${d.getMonth()+1}`;

      const b1 = m.bot_names ? m.bot_names[0] : "Đội A";
      const b2 = m.bot_names ? m.bot_names[1] : "Đội B";

      tr.innerHTML = `
        <td><code>${m.match_id.substring(0, 10)}...</code></td>
        <td>${timeStr}</td>
        <td>${m.stage || 'Chuẩn'}</td>
        <td><strong>${escapeHtml(b1)}</strong> vs <strong>${escapeHtml(b2)}</strong></td>
        <td>${m.total_rounds || 5} Hiệp</td>
        <td><strong class="text-success">${escapeHtml(m.winner_name || 'Hòa')}</strong></td>
        <td>
          <span style="font-size:12px; color:var(--text-muted)">Hoàn thành</span>
        </td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error("Lỗi nạp lịch sử trận đấu:", err);
  }
}

// =============================================================================
// 10. TAB 4: BẢNG XẾP HẠNG ELO (LEADERBOARD)
// =============================================================================
async function loadLeaderboard() {
  const tbody = document.getElementById("tbody-ranking");
  tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">Đang tải bảng xếp hạng...</td></tr>`;

  try {
    const res = await fetch(`${API_BASE}/api/ranking`);
    const ranks = await res.json();

    if (!ranks || ranks.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">Chưa có dữ liệu xếp hạng.</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    ranks.forEach((r, idx) => {
      const tr = document.createElement("tr");

      let rankBadge = `${idx + 1}`;
      if (idx === 0) rankBadge = `1`;
      else if (idx === 1) rankBadge = `2`;
      else if (idx === 2) rankBadge = `3`;

      tr.innerHTML = `
        <td><strong>${rankBadge}</strong></td>
        <td><strong>${escapeHtml(r.bot_name)}</strong></td>
        <td><code>${escapeHtml(r.student_id)}</code></td>
        <td><span class="badge-tag">${r.language}</span></td>
        <td>${r.active_version || 'v1.0.0'}</td>
        <td><strong style="color:var(--primary); font-size:15px">${r.elo_score}</strong></td>
        <td>${r.matches_played}</td>
        <td>${r.wins}</td>
        <td><strong>${r.win_rate}%</strong></td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error("Lỗi nạp bảng xếp hạng:", err);
  }
}

// =============================================================================
// 11. TAB 5: BAN TỔ CHỨC (ĐỔI LUẬT)
// =============================================================================
async function loadCurrentRules() {
  try {
    const res = await fetch(`${API_BASE}/api/tournament/rule`);
    const rule = await res.json();
    const radios = document.querySelectorAll("input[name='admin_stage']");
    radios.forEach(r => {
      if (r.value === rule.stage) r.checked = true;
    });
  } catch (err) {
    console.error("Lỗi nạp luật giải đấu:", err);
  }
}

function setupAdminRules() {
  const btnApply = document.getElementById("btn-apply-stage");
  btnApply.addEventListener("click", async () => {
    const selected = document.querySelector("input[name='admin_stage']:checked");
    if (!selected) return;

    btnApply.disabled = true;
    btnApply.textContent = "Đang áp dụng...";

    try {
      const res = await fetch(`${API_BASE}/api/tournament/rule/set?stage_name=${selected.value}`, {
        method: "POST"
      });
      const data = await res.json();
      notifySuccess("Đổi Luật Thành Công", `Đã áp dụng luật thi đấu: ${data.stage}`);

      const stageText = document.getElementById("sidebar-stage-text");
      if (stageText) {
        if (selected.value === "STAGE_1_STANDARD") stageText.textContent = "Vòng 1: Luật Chuẩn";
        else if (selected.value === "STAGE_2_MUTATED") stageText.textContent = "Vòng 2: Lệch Thẻ";
        else if (selected.value === "STAGE_3_REVERSE_FOG") stageText.textContent = "Vòng 3: Sương Mù";
        else stageText.textContent = "Vòng 4: Chung Kết";
      }

    } catch (err) {
      console.error("Lỗi đổi luật:", err);
      notifyError("Lỗi Kết Nối", "Không thể kết nối đến máy chủ API.");
    } finally {
      btnApply.disabled = false;
      btnApply.textContent = "Áp Dụng Luật Mới Toàn Sàn";
    }
  });
}

// Utility escape HTML
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

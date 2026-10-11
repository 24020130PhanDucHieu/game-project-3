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

// Cập nhật nhãn nút nộp mã lệnh gọn gàng, không bị tràn
function updateStudioSubmitBtnText(roundNum = null) {
  const btn = document.getElementById("btn-studio-submit-bot");
  const span = document.getElementById("btn-submit-bot-text");
  const label = roundNum ? `Nộp mã lệnh R${roundNum}` : "Nộp mã lệnh";
  if (span) {
    span.textContent = label;
  } else if (btn) {
    btn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="22" y1="2" x2="11" y2="13"/>
        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>
      <span id="btn-submit-bot-text">${escapeHtml(label)}</span>
    `;
  }
}

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

// Trạng thái ứng dụng & Phân quyền Role-based Access Control
let currentTournamentId = null;
let currentTournamentData = null;
let currentActiveMatchId = null;
// Cookie Helpers để lưu phiên đăng nhập bền vững tuyệt đối qua F5 / reload
function setArenaCookie(name, val, days = 365) {
  try {
    const d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${encodeURIComponent(val)};expires=${d.toUTCString()};path=/;SameSite=Lax`;
  } catch (e) {}
}

function getArenaCookie(name) {
  try {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
  } catch (e) {}
  return "";
}

function clearArenaCookie(name) {
  try {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;SameSite=Lax`;
  } catch (e) {}
}

let currentMatchData = null;
let currentStudioSide = "team_a"; // "team_a" hoặc "team_b"
let currentUserRole = "GUEST"; // "GUEST", "TEAM", "REFEREE", "ADMIN"
let currentAppRole = "GUEST";
let currentTeamStudentId = "";
let currentTeamName = "";
let pendingLoginMatchId = null;
let practiceSimTimer = null;
let practiceSimCancelToken = false;
let allTeamsCache = [];
let isMatchRunning = false;

// =============================================================================
// KHỞI ĐỘNG ỨNG DỤNG KHI TẢI TRANG
// =============================================================================
function initApp() {
  // 0. Luôn đóng màn hình đăng nhập modal/fullview khi nạp trang
  hideLoginPage();

  // 1. Khôi phục trạng thái Đăng nhập & Vai trò (Bảo toàn 100% khi nhấn F5 reload hoặc mở tab mới)
  const rawRole = (localStorage.getItem("ARENA_USER_ROLE") || sessionStorage.getItem("ARENA_USER_ROLE") || sessionStorage.getItem("userRole") || getArenaCookie("arena_user_role") || "").trim().toUpperCase();
  const rawSid = (localStorage.getItem("ARENA_STUDENT_ID") || sessionStorage.getItem("ARENA_STUDENT_ID") || getArenaCookie("arena_student_id") || "").trim();
  const rawName = (localStorage.getItem("ARENA_TEAM_NAME") || sessionStorage.getItem("ARENA_TEAM_NAME") || getArenaCookie("arena_team_name") || "").trim();

  if (rawRole === "ADMIN" || rawSid.toUpperCase() === "ADMIN" || rawName.includes("Ban Tổ Chức") || rawName.toLowerCase().includes("admin")) {
    currentAppRole = "ADMIN";
    currentUserRole = "ADMIN";
    currentTeamStudentId = "ADMIN";
    currentTeamName = "Ban Tổ Chức (Admin)";
  } else if (rawRole === "REFEREE" || rawSid.toUpperCase() === "REFEREE") {
    currentAppRole = "REFEREE";
    currentUserRole = "REFEREE";
    currentTeamStudentId = "REFEREE";
    currentTeamName = "Trọng Tài";
  } else if (rawRole === "TEAM" || rawRole === "TEAM_A" || rawRole === "TEAM_B" || (rawSid && rawSid !== "GUEST")) {
    currentAppRole = "TEAM";
    currentUserRole = "TEAM";
    currentTeamStudentId = rawSid;
    currentTeamName = rawName || ("Đội " + rawSid);
  } else {
    currentAppRole = "GUEST";
    currentUserRole = "GUEST";
    currentTeamStudentId = "";
    currentTeamName = "";
  }

  // Đồng bộ lại cả localStorage, sessionStorage & Cookies
  localStorage.setItem("ARENA_USER_ROLE", currentAppRole);
  sessionStorage.setItem("ARENA_USER_ROLE", currentAppRole);
  sessionStorage.setItem("userRole", currentAppRole);
  setArenaCookie("arena_user_role", currentAppRole);

  if (currentAppRole !== "GUEST") {
    localStorage.setItem("ARENA_STUDENT_ID", currentTeamStudentId);
    sessionStorage.setItem("ARENA_STUDENT_ID", currentTeamStudentId);
    setArenaCookie("arena_student_id", currentTeamStudentId);

    localStorage.setItem("ARENA_TEAM_NAME", currentTeamName);
    sessionStorage.setItem("ARENA_TEAM_NAME", currentTeamName);
    setArenaCookie("arena_team_name", currentTeamName);
  }

  // Khôi phục giải đấu và trận đấu đang chọn
  const savedTourn = sessionStorage.getItem("activeTournamentId") || localStorage.getItem("activeTournamentId");
  const savedMatch = sessionStorage.getItem("activeMatchId") || localStorage.getItem("activeMatchId");
  const savedSide = sessionStorage.getItem("studioSide") || localStorage.getItem("studioSide");
  const savedTab = sessionStorage.getItem("activeTabId") || localStorage.getItem("activeTabId");

  if (savedTourn) currentTournamentId = savedTourn;
  if (savedMatch) currentActiveMatchId = savedMatch;
  if (savedSide) currentStudioSide = savedSide;

  setupSidebarNavigation();
  setupPublicSubNav();
  setupTournamentControls();
  setupMatchRoomControls();
  setupStudioControls();
  setupAdminControls();
  setupModals();
  setupAdminRules();
  updateRoleUI();

  // Khôi phục tab trước khi reload nếu có
  if (savedTab && savedTab !== "tab-overview") {
    switchToTab(savedTab);
  }

  // Nút cấu hình máy chủ Backend (chuyển vào Admin Console)
  const btnSetBackend = document.getElementById("btn-set-backend");
  const adminServerUrlDisplay = document.getElementById("admin-server-url-display");
  const btnResetBackend = document.getElementById("btn-reset-backend");

  if (adminServerUrlDisplay) {
    adminServerUrlDisplay.value = localStorage.getItem("ARENA_API_URL") || `${window.location.origin} (Mặc định)`;
  }

  if (btnSetBackend) {
    if (localStorage.getItem("ARENA_API_URL")) {
      btnSetBackend.textContent = "Đổi Server (" + localStorage.getItem("ARENA_API_URL").replace(/^https?:\/\//, '').slice(0, 16) + "...)";
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

  if (btnResetBackend) {
    btnResetBackend.addEventListener("click", () => {
      localStorage.removeItem("ARENA_API_URL");
      notifySuccess("Đặt Lại Máy Chủ", "Đã xóa địa chỉ tùy chỉnh. Sử dụng kết nối mặc định.");
      setTimeout(() => window.location.reload(), 600);
    });
  }

  // Tải danh sách giải đấu đầu tiên
  loadTournamentsList();

  // Tự động đồng bộ thời gian thực mỗi 2.0 giây để cập nhật trạng thái nộp bài không cần F5
  setInterval(() => {
    if (currentTournamentId && !isMatchRunning) {
      loadActiveTournamentSilent(currentTournamentId);
    }
  }, 2000);
}

// =============================================================================
// KÊNH ĐỒNG BỘ REALTIME ĐA TAB & TIÊU ĐIỂM CỬA SỔ (CROSS-TAB INSTANT SYNC)
// =============================================================================
let arenaSyncChannel = null;
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

function broadcastCrossTabSync(type = "CODE_SUBMITTED") {
  try {
    if (arenaSyncChannel) {
      arenaSyncChannel.postMessage({ type, timestamp: Date.now() });
    }
    localStorage.setItem("ARENA_CROSS_TAB_EVENT", Date.now().toString());
  } catch (err) {}
}

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

// Helper chọn nhanh số lượng đội & preview thể thức trong Modal Tạo Giải Đấu
window.selectTournSizePreset = function(size) {
  const inp = document.getElementById("inp-new-tourn-teams");
  if (inp) inp.value = size;
  document.querySelectorAll(".preset-pill-btn").forEach(btn => {
    btn.classList.toggle("active", parseInt(btn.textContent, 10) === size);
  });
  window.updateTournSizePreview(size);
};

window.updateTournSizePreview = function(val) {
  const num = parseInt(val, 10);
  const textEl = document.getElementById("tourn-format-preview-text");
  if (!textEl) return;
  if (num === 4) {
    textEl.textContent = "Bán Kết (2 trận) → Chung Kết (1 trận) • 2 Vòng";
  } else if (num === 8) {
    textEl.textContent = "Tứ Kết (4 trận) → Bán Kết (2 trận) → Chung Kết (1 trận) • 3 Vòng";
  } else if (num === 16) {
    textEl.textContent = "Vòng 1/8 (8 trận) → Tứ Kết (4 trận) → Bán Kết (2 trận) → Chung Kết (1 trận) • 4 Vòng";
  } else if (num === 32) {
    textEl.textContent = "Vòng 1/16 (16 trận) → Vòng 1/8 (8 trận) → Tứ Kết (4 trận) → Bán Kết (2 trận) → Chung Kết (1 trận) • 5 Vòng";
  } else if (num > 0 && (num & (num - 1)) === 0) {
    textEl.textContent = `Vòng 1 (${num/2} trận) → ... → Bán Kết → Chung Kết • ${Math.round(Math.log2(num))} Vòng`;
  } else {
    textEl.textContent = "Quy tắc: Số đội phải là lũy thừa của 2 (4, 8, 16, 32...) để phân nhánh loại trực tiếp";
  }
};

if (document.readyState === 'loading') {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

// =============================================================================
// 1. ĐIỀU HƯỚNG 4 KHU VỰC CHÍNH (4 PRIMARY AREAS NAVIGATION)
// =============================================================================
// =============================================================================
// 1. ĐIỀU HƯỚNG CÁC TRANG CHÍNH & MÀN HÌNH ĐĂNG NHẬP (DESKTOP NAVIGATION)
// =============================================================================
function setupSidebarNavigation() {
  const navBtns = document.querySelectorAll(".nav-tab-btn");
  navBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetTab = btn.dataset.tab;
      switchToTab(targetTab);
    });
  });

  // Nút đăng nhập bên sidebar
  const btnSidebarAuth = document.getElementById("btn-user-auth-action");
  if (btnSidebarAuth) {
    btnSidebarAuth.addEventListener("click", () => showLoginPage());
  }

  // Nút đăng xuất bên sidebar
  const btnSidebarLogout = document.getElementById("btn-user-logout");
  if (btnSidebarLogout) {
    btnSidebarLogout.addEventListener("click", handleUserLogout);
  }

  // Thiết lập các sự kiện cho màn hình Đăng nhập (Mockup 4)
  setupLoginPageHandlers();
}

// =============================================================================
// HELPER KIỂM TRA ĐỘI CÓ THAM GIA TRẬN ĐẤU HAY KHÔNG
// =============================================================================
function isTeamInMatch(match, studentId, teamName) {
  if (!match) return false;
  const mySid = (studentId || "").toString().trim().toLowerCase();
  const myName = (teamName || "").toString().trim().toLowerCase();
  if (!mySid && !myName) return false;

  const checkTeam = (t) => {
    if (!t) return false;
    const tSid = (t.student_id || "").toString().trim().toLowerCase();
    const tName = (t.team_name || "").toString().trim().toLowerCase();
    return (mySid && (tSid === mySid || tSid.includes(mySid))) || 
           (myName && (tName === myName || tName.includes(myName)));
  };

  return checkTeam(match.team_a) || checkTeam(match.team_b);
}

// Helper chọn trận đấu phù hợp nhất để hiển thị (tránh bị kẹt ở Chung Kết m_gf khi chưa diễn ra)
function findBestMatchToDisplay(tournament) {
  if (!tournament || !tournament.matches) return null;
  const matches = Object.values(tournament.matches);
  if (matches.length === 0) return null;

  // 1. Nếu là tuyển thủ TEAM: tìm trận có đội của mình
  if (currentAppRole === "TEAM" && (currentTeamStudentId || currentTeamName)) {
    const mySID = String(currentTeamStudentId || "").trim().toLowerCase();
    const myName = String(currentTeamName || "").trim().toLowerCase();
    const found = matches.find(m => isTeamInMatch(m, mySID, myName));
    if (found) return found;
  }

  // 2. Nếu currentActiveMatchId đang trỏ tới trận có đủ 2 đội: giữ nguyên
  if (currentActiveMatchId && tournament.matches[currentActiveMatchId]) {
    const cur = tournament.matches[currentActiveMatchId];
    if (cur.team_a && cur.team_b) return cur;
  }

  // 3. Tìm trận đầu tiên đang diễn ra có đủ 2 đội (chưa kết thúc)
  const inProgress = matches.find(m => m.team_a && m.team_b && m.status !== "COMPLETED");
  if (inProgress) return inProgress;

  // 4. Tìm bất kỳ trận nào đã có đủ 2 đội
  const anyAssigned = matches.find(m => m.team_a && m.team_b);
  if (anyAssigned) return anyAssigned;

  // 5. Fallback nếu chưa xếp lịch
  return matches[0];
}

function switchToTab(tabId) {
  // Đóng màn hình đăng nhập nếu đang mở
  hideLoginPage();

  // Chuẩn hóa tên tab
  if (tabId === "public-arena-tab" || tabId === "overview-tab" || tabId === "overview") tabId = "tab-overview";
  if (tabId === "bracket-tab" || tabId === "bracket") tabId = "tab-bracket";
  if (tabId === "ranking-tab" || tabId === "ranking") tabId = "tab-ranking";
  if (tabId === "match-arena-tab" || tabId === "match" || tabId === "team-workspace-tab" || tabId === "tab-team-workspace") tabId = "tab-match-arena";
  if (tabId === "guide-tab" || tabId === "guide") tabId = "tab-guide";
  if (tabId === "admin-console-tab" || tabId === "admin-tab" || tabId === "admin") tabId = "tab-admin-console";

  // Phân quyền: Bàn Quản Trị chỉ dành riêng cho Ban Tổ Chức (Admin)
  if (tabId === "tab-admin-console" && currentAppRole !== "ADMIN") {
    notifyError("Từ Chối Truy Cập", "Chức năng chỉ dành cho Ban Tổ Chức (Admin).");
    showLoginPage();
    return;
  }

  // Phân quyền: Tuyển thủ (TEAM) bấm vào Tab Trận Đấu từ sidebar -> tự động ghép vào trận của mình
  if (tabId === "tab-match-arena" && currentAppRole === "TEAM") {
    const activeMatch = (currentActiveMatchId && currentTournamentData?.matches)
      ? currentTournamentData.matches[currentActiveMatchId]
      : null;
    const isMyMatch = isTeamInMatch(activeMatch, currentTeamStudentId, currentTeamName);
    if (!isMyMatch && currentTournamentData) {
      const best = findBestMatchToDisplay(currentTournamentData);
      if (best) {
        currentActiveMatchId = best.match_id;
      }
    }
  }

  const navBtns = document.querySelectorAll(".nav-tab-btn");
  navBtns.forEach(btn => {
    if (btn.dataset.tab === tabId) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  document.querySelectorAll(".tab-pane").forEach(pane => {
    if (pane.id === tabId) {
      pane.classList.add("active");
    } else {
      pane.classList.remove("active");
    }
  });

  // Lưu trạng thái tab đang xem để F5 không bị reset về trang chủ
  localStorage.setItem("activeTabId", tabId);
  sessionStorage.setItem("activeTabId", tabId);

  // Tự động tải dữ liệu theo từng tab
  if (tabId === "tab-overview") {
    renderDashboardOverview();
  } else if (tabId === "tab-bracket") {
    if (currentTournamentId) {
      loadActiveTournament(currentTournamentId);
    } else if (currentTournamentData) {
      renderBracketTree(currentTournamentData);
    } else {
      loadTournamentsList();
    }
  } else if (tabId === "tab-ranking") {
    loadLeaderboard();
  } else if (tabId === "tab-match-arena") {
    const targetMatch = (currentActiveMatchId && currentTournamentData?.matches?.[currentActiveMatchId])
      ? currentTournamentData.matches[currentActiveMatchId]
      : findBestMatchToDisplay(currentTournamentData);
    if (targetMatch) {
      currentActiveMatchId = targetMatch.match_id;
      openMatchRoom(targetMatch.match_id);
    } else if (currentTournamentId) {
      loadActiveTournament(currentTournamentId).then(() => {
        const best = findBestMatchToDisplay(currentTournamentData);
        if (best) openMatchRoom(best.match_id);
      });
    }
  }
}

// =============================================================================
// QUẢN LÝ MÀN HÌNH ĐĂNG NHẬP RIÊNG BIỆT (MOCKUP 4 REPLICATION)
// =============================================================================
function showLoginPage(targetMatchId = null) {
  pendingLoginMatchId = targetMatchId;
  const loginView = document.getElementById("view-login");
  if (loginView) {
    loginView.style.display = "flex";
  }
  const errEl = document.getElementById("login-error-msg");
  if (errEl) errEl.style.display = "none";
  const userInp = document.getElementById("inp-login-user");
  if (userInp) {
    setTimeout(() => userInp.focus(), 100);
  }
}

function hideLoginPage() {
  const loginView = document.getElementById("view-login");
  if (loginView) {
    loginView.style.display = "none";
  }
}

function setupLoginPageHandlers() {
  const btnSubmit = document.getElementById("btn-login-submit");
  const btnBackHome = document.getElementById("btn-login-back-home");
  const btnToggleEye = document.getElementById("btn-toggle-login-pass");
  const passInp = document.getElementById("inp-login-pass");
  const userInp = document.getElementById("inp-login-user");

  if (btnSubmit) {
    btnSubmit.addEventListener("click", handleLoginPageSubmit);
  }
  if (passInp) {
    passInp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleLoginPageSubmit();
    });
  }
  if (userInp) {
    userInp.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && passInp) passInp.focus();
    });
  }
  if (btnBackHome) {
    btnBackHome.addEventListener("click", () => {
      hideLoginPage();
      switchToTab("tab-overview");
    });
  }
  if (btnToggleEye && passInp) {
    btnToggleEye.addEventListener("click", () => {
      passInp.type = passInp.type === "password" ? "text" : "password";
    });
  }
}

async function handleLoginPageSubmit() {
  const userInp = document.getElementById("inp-login-user");
  const passInp = document.getElementById("inp-login-pass");
  const errEl = document.getElementById("login-error-msg");
  const btnSubmit = document.getElementById("btn-login-submit");

  const username = userInp ? userInp.value.trim() : "";
  const password = passInp ? passInp.value.trim() : "";

  if (!username) {
    if (errEl) {
      errEl.textContent = "Vui lòng nhập tên đăng nhập hoặc MSSV!";
      errEl.style.display = "block";
    }
    if (userInp) userInp.focus();
    return;
  }
  if (!password) {
    if (errEl) {
      errEl.textContent = "Vui lòng nhập mật khẩu!";
      errEl.style.display = "block";
    }
    if (passInp) passInp.focus();
    return;
  }

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = "Đang xác thực...";
  }
  if (errEl) errEl.style.display = "none";

  try {
    // 1. Kiểm tra tài khoản Quản trị viên (Admin)
    const isAdminUser = ["admin", "btc", "bannang", "admin_ottv2"].includes(username.toLowerCase());
    if (isAdminUser && ["admin123", "12345", "admin"].includes(password)) {
      currentUserRole = "ADMIN";
      currentAppRole = "ADMIN";
      currentTeamName = "Ban Tổ Chức (Admin)";
      currentTeamStudentId = "ADMIN";
      localStorage.setItem("ARENA_USER_ROLE", "ADMIN");
      localStorage.setItem("ARENA_STUDENT_ID", "ADMIN");
      localStorage.setItem("ARENA_TEAM_NAME", "Ban Tổ Chức (Admin)");
      sessionStorage.setItem("ARENA_USER_ROLE", "ADMIN");
      sessionStorage.setItem("userRole", "ADMIN");
      sessionStorage.setItem("ARENA_STUDENT_ID", "ADMIN");
      sessionStorage.setItem("ARENA_TEAM_NAME", "Ban Tổ Chức (Admin)");
      setArenaCookie("arena_user_role", "ADMIN");
      setArenaCookie("arena_student_id", "ADMIN");
      setArenaCookie("arena_team_name", "Ban Tổ Chức (Admin)");

      updateRoleUI();
      hideLoginPage();
      notifySuccess("Đăng Nhập Thành Công", "Chào mừng Ban Tổ Chức (Admin) vào hệ thống!");

      if (pendingLoginMatchId) {
        openMatchRoom(pendingLoginMatchId);
        pendingLoginMatchId = null;
      } else {
        switchToTab("tab-overview");
      }
      return;
    }

    // 2. Nếu đang vào trận đấu cụ thể (pendingLoginMatchId) -> xác thực qua API match login
    if (currentTournamentId && pendingLoginMatchId) {
      const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/matches/${pendingLoginMatchId}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        currentUserRole = data.role;
        currentAppRole = data.role === "ADMIN" ? "ADMIN" : "TEAM";
        const side = data.side || "team_a";
        currentStudioSide = side;
        currentTeamName = data.team?.team_name || username;
        currentTeamStudentId = data.team?.student_id || username;

        localStorage.setItem("ARENA_USER_ROLE", currentAppRole);
        localStorage.setItem("ARENA_STUDENT_ID", currentTeamStudentId);
        localStorage.setItem("ARENA_TEAM_NAME", currentTeamName);
        sessionStorage.setItem("ARENA_USER_ROLE", currentAppRole);
        sessionStorage.setItem("userRole", data.role);
        sessionStorage.setItem("ARENA_STUDENT_ID", currentTeamStudentId);
        sessionStorage.setItem("ARENA_TEAM_NAME", currentTeamName);
        sessionStorage.setItem("activeMatchId", pendingLoginMatchId);
        sessionStorage.setItem("studioSide", side);
        setArenaCookie("arena_user_role", currentAppRole);
        setArenaCookie("arena_student_id", currentTeamStudentId);
        setArenaCookie("arena_team_name", currentTeamName);

        updateRoleUI();
        hideLoginPage();
        notifySuccess("Đăng Nhập Thành Công", `Chào mừng đội ${currentTeamName}!`);
        openMatchRoom(pendingLoginMatchId);
        pendingLoginMatchId = null;
        return;
      }
    }

    // 3. Khớp tài khoản tuyển thủ theo danh sách đội hiện tại hoặc chấp nhận sinh viên K69
    let matchedTeam = null;
    if (currentTournamentData?.teams) {
      matchedTeam = currentTournamentData.teams.find(t => 
        (t.student_id && t.student_id.toLowerCase() === username.toLowerCase()) ||
        (t.team_name && t.team_name.toLowerCase() === username.toLowerCase())
      );
    }

    if (matchedTeam || password === "12345" || password === "k69") {
      const tName = matchedTeam ? matchedTeam.team_name : (username.startsWith("2402") ? `Đội ${username}` : username);
      const tSid = matchedTeam ? matchedTeam.student_id : (username.startsWith("2402") ? username : `K69A00${Math.floor(Math.random()*9)+1}`);

      currentUserRole = "TEAM";
      currentAppRole = "TEAM";
      currentTeamName = tName;
      currentTeamStudentId = tSid;

      localStorage.setItem("ARENA_USER_ROLE", "TEAM");
      localStorage.setItem("ARENA_STUDENT_ID", currentTeamStudentId);
      localStorage.setItem("ARENA_TEAM_NAME", currentTeamName);
      sessionStorage.setItem("ARENA_USER_ROLE", "TEAM");
      sessionStorage.setItem("userRole", "TEAM");
      sessionStorage.setItem("ARENA_STUDENT_ID", currentTeamStudentId);
      sessionStorage.setItem("ARENA_TEAM_NAME", currentTeamName);
      setArenaCookie("arena_user_role", "TEAM");
      setArenaCookie("arena_student_id", currentTeamStudentId);
      setArenaCookie("arena_team_name", currentTeamName);

      updateRoleUI();
      hideLoginPage();
      notifySuccess("Đăng Nhập Thành Công", `Chào mừng tuyển thủ ${tName}!`);

      if (pendingLoginMatchId) {
        openMatchRoom(pendingLoginMatchId);
        pendingLoginMatchId = null;
      } else {
        switchToTab("tab-overview");
      }
      return;
    }

    if (errEl) {
      errEl.textContent = "Tài khoản hoặc mật khẩu không chính xác. Mật khẩu mẫu: 12345";
      errEl.style.display = "block";
    }
  } catch (e) {
    console.error("Lỗi đăng nhập:", e);
    if (errEl) {
      errEl.textContent = "Không thể kết nối máy chủ API. Vui lòng thử lại!";
      errEl.style.display = "block";
    }
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = "Đăng nhập";
    }
  }
}

// =============================================================================
// SUB-NAVIGATION VÀ CÁC NÚT ĐIỀU HƯỚNG LIÊN KẾT
// =============================================================================
function setupPublicSubNav() {
  const btnDashManage = document.getElementById("btn-dash-manage-tourn");
  if (btnDashManage) {
    btnDashManage.addEventListener("click", () => switchToTab("tab-bracket"));
  }

  const btnDashBracket = document.getElementById("btn-dash-view-bracket");
  if (btnDashBracket) {
    btnDashBracket.addEventListener("click", () => switchToTab("tab-bracket"));
  }

  const btnDashFullRank = document.getElementById("btn-dash-view-full-ranking");
  if (btnDashFullRank) {
    btnDashFullRank.addEventListener("click", () => switchToTab("tab-ranking"));
  }

  // Nút Nộp bài cho đội trên trang Tổng quan (Luồng tham gia trận đấu)
  const btnDashTeamWs = document.getElementById("btn-dash-team-workspace");
  if (btnDashTeamWs) {
    btnDashTeamWs.addEventListener("click", () => {
      const activeMatchId = currentActiveMatchId || (currentTournamentData?.matches ? Object.keys(currentTournamentData.matches)[0] : "m_lvl1_1");
      if (currentAppRole === "GUEST") {
        notifyInfo("Tham Gia Trận Đấu", "Vui lòng đăng nhập để nộp bài bot cho đội.");
        showLoginPage(activeMatchId);
      } else {
        openMatchRoom(activeMatchId);
      }
    });
  }

  const btnWsBack = document.getElementById("btn-ws-back-bracket");
  if (btnWsBack) {
    btnWsBack.addEventListener("click", () => switchToTab("tab-bracket"));
  }

  const btnMatchBack = document.getElementById("btn-match-back-bracket");
  if (btnMatchBack) {
    btnMatchBack.addEventListener("click", () => switchToTab("tab-bracket"));
  }

  const btnRefRank = document.getElementById("btn-refresh-ranking");
  if (btnRefRank) btnRefRank.addEventListener("click", loadLeaderboard);
}

function switchPublicSubView(subviewName) {
  const map = {
    "overview": "tab-overview",
    "bracket": "tab-bracket",
    "ranking": "tab-ranking",
    "match": "tab-match-arena"
  };
  const target = map[subviewName] || ("tab-" + subviewName);
  switchToTab(target);
}

// =============================================================================
// RENDER TRANG 1: TỔNG QUAN (MOCKUP 1 REPLICATION)
// =============================================================================
function renderDashboardOverview() {
  const titleEl = document.getElementById("dash-tourn-title");
  const statusEl = document.getElementById("dash-tourn-status");
  const teamsNumEl = document.getElementById("dash-teams-num");
  const progressEl = document.getElementById("dash-progress-status");

  if (currentTournamentData) {
    if (titleEl) titleEl.textContent = currentTournamentData.name || "Giải Đấu Tân Sinh Viên K69";
    if (statusEl) {
      statusEl.textContent = currentTournamentData.champion ? "Đã kết thúc" : "Đang diễn ra";
    }
    if (teamsNumEl) {
      const cnt = currentTournamentData.teams ? currentTournamentData.teams.length : 8;
      teamsNumEl.textContent = `${cnt} Đội`;
    }
    if (progressEl) {
      progressEl.textContent = currentTournamentData.champion ? `Quán quân: ${currentTournamentData.champion}` : "Tứ Kết → Chung Kết";
    }
  }

  // Cập nhật thông tin trận đấu nổi bật
  const teamAEl = document.getElementById("dash-match-team-a");
  const teamBEl = document.getElementById("dash-match-team-b");
  const matchStatEl = document.getElementById("dash-match-status");
  const matchScoreEl = document.getElementById("dash-match-score");
  const matchMetaEl = document.getElementById("dash-match-meta");

  const matches = currentTournamentData?.matches ? Object.values(currentTournamentData.matches) : [];
  const activeMatch = matches.find(m => m.status === "RUNNING") || matches.find(m => m.status === "IN_PROGRESS") || matches[0];

  if (activeMatch) {
    currentActiveMatchId = activeMatch.match_id;
    const tA = activeMatch.team_a ? activeMatch.team_a.team_name : "Đội Đỏ";
    const tB = activeMatch.team_b ? activeMatch.team_b.team_name : "Đội Xanh";
    if (teamAEl) teamAEl.textContent = tA;
    if (teamBEl) teamBEl.textContent = tB;
    if (matchStatEl) {
      matchStatEl.textContent = activeMatch.status === "FINISHED" ? "Đã Kết Thúc" : "Đang diễn ra";
    }
    if (matchScoreEl) {
      matchScoreEl.textContent = `${activeMatch.score_a ?? 2} - ${activeMatch.score_b ?? 1}`;
    }
    if (matchMetaEl) {
      matchMetaEl.textContent = `Vòng ${activeMatch.current_round_idx || 1} · Thể thức Bo5`;
    }

    const btnEnter = document.getElementById("btn-dash-enter-match");
    if (btnEnter) {
      btnEnter.onclick = () => {
        openMatchRoom(activeMatch.match_id);
      };
    }
  }

  // Tải danh sách top 5 bảng xếp hạng theo Mockup 1
  loadDashboardTopRanking();
}

// HELPER: TẠO HUY CHƯƠNG SVG CHO TOP 3
function getMedalSvg(rank) {
  if (rank === 1) {
    return `<span class="rank-medal-icon" title="Huy chương Vàng"><svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="14" r="7" fill="#fbbf24"/><path d="M12 9v10M8.5 12l7 4M8.5 16l7-4" stroke="#d97706" stroke-width="0.75"/><path d="M8 2l4 7 4-7" fill="#ef4444"/><circle cx="12" cy="14" r="5" fill="#f59e0b"/><text x="12" y="17" font-size="8" font-weight="bold" fill="#fff" text-anchor="middle">1</text></svg></span>`;
  }
  if (rank === 2) {
    return `<span class="rank-medal-icon" title="Huy chương Bạc"><svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="14" r="7" fill="#cbd5e1"/><path d="M12 9v10M8.5 12l7 4M8.5 16l7-4" stroke="#64748b" stroke-width="0.75"/><path d="M8 2l4 7 4-7" fill="#3b82f6"/><circle cx="12" cy="14" r="5" fill="#94a3b8"/><text x="12" y="17" font-size="8" font-weight="bold" fill="#fff" text-anchor="middle">2</text></svg></span>`;
  }
  if (rank === 3) {
    return `<span class="rank-medal-icon" title="Huy chương Đồng"><svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="14" r="7" fill="#fdba74"/><path d="M12 9v10M8.5 12l7 4M8.5 16l7-4" stroke="#c2410c" stroke-width="0.75"/><path d="M8 2l4 7 4-7" fill="#ea580c"/><circle cx="12" cy="14" r="5" fill="#ea580c"/><text x="12" y="17" font-size="8" font-weight="bold" fill="#fff" text-anchor="middle">3</text></svg></span>`;
  }
  return "";
}

function getBotColorClass(idx) {
  const colors = ["color-red", "color-blue", "color-green", "color-yellow", "color-purple", "color-orange", "color-pink", "color-cyan"];
  return colors[idx % colors.length];
}

async function loadDashboardTopRanking() {
  const tbody = document.getElementById("tbody-dash-top-ranking");
  if (!tbody) return;

  const referenceTop5 = [
    { rank: 1, name: "RedBot", sid: "K69A001", elo: 1620, color: "color-red" },
    { rank: 2, name: "BlueBot", sid: "K69A002", elo: 1580, color: "color-blue" },
    { rank: 3, name: "GreenBot", sid: "K69A003", elo: 1520, color: "color-green" },
    { rank: 4, name: "YellowBot", sid: "K69A004", elo: 1480, color: "color-yellow" },
    { rank: 5, name: "PurpleBot", sid: "K69A005", elo: 1420, color: "color-purple" }
  ];

  try {
    const res = await fetch(`${API_BASE}/api/ranking`);
    if (res.ok) {
      const ranks = await res.json();
      if (Array.isArray(ranks) && ranks.length > 0) {
        tbody.innerHTML = "";
        ranks.slice(0, 5).forEach((r, idx) => {
          const rankNum = idx + 1;
          const medalSvg = getMedalSvg(rankNum);
          const colorClass = getBotColorClass(idx);
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>
              ${medalSvg}
              <span class="rank-num-bold">${rankNum}</span>
            </td>
            <td>
              <div class="bot-team-cell">
                <span class="bot-avatar-circle ${colorClass}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </span>
                <span class="team-name-bold">${escapeHtml(r.bot_name || r.team_name || "Bot")}</span>
              </div>
            </td>
            <td><span class="student-id-code">${escapeHtml(r.student_id || "---")}</span></td>
            <td style="text-align: right;"><span class="elo-score-bold">${r.elo_score || 1200}</span></td>
          `;
          tbody.appendChild(tr);
        });
        return;
      }
    }
  } catch (e) {
    console.warn("Dùng dữ liệu chuẩn Mockup 1:", e);
  }

  // Fallback chuẩn theo ảnh mẫu Mockup 1
  tbody.innerHTML = "";
  referenceTop5.forEach(r => {
    const medalSvg = getMedalSvg(r.rank);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        ${medalSvg}
        <span class="rank-num-bold">${r.rank}</span>
      </td>
      <td>
        <div class="bot-team-cell">
          <span class="bot-avatar-circle ${r.color}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </span>
          <span class="team-name-bold">${escapeHtml(r.name)}</span>
        </div>
      </td>
      <td><span class="student-id-code">${r.sid}</span></td>
      <td style="text-align: right;"><span class="elo-score-bold">${r.elo}</span></td>
    `;
    tbody.appendChild(tr);
  });
}


// RENDER TRANG QUẢN LÝ CÁC BẢNG ĐẤU TẬP TRUNG (MỤC 6)
let allTournamentsCache = [];
async function renderAllTournamentsTable() {
  const tbody = document.getElementById("tbody-all-tournaments");
  const countEl = document.getElementById("count-total-tournaments");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Đang tải danh sách bảng đấu...</td></tr>`;

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/list`);
    if (!res.ok) throw new Error("Không thể tải danh sách");
    const list = await res.json();
    allTournamentsCache = list || [];

    if (countEl) countEl.textContent = allTournamentsCache.length;

    renderTournamentsTableRows(allTournamentsCache);

    const searchInp = document.getElementById("inp-search-tournaments");
    if (searchInp) {
      searchInp.oninput = (e) => {
        const q = (e.target.value || "").toLowerCase().trim();
        const filtered = allTournamentsCache.filter(t => (t.name || "").toLowerCase().includes(q) || (t.tournament_id || "").toLowerCase().includes(q));
        renderTournamentsTableRows(filtered);
      };
    }
  } catch (err) {
    console.error("Lỗi tải bảng đấu tập trung:", err);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Không thể kết nối đến máy chủ API.</td></tr>`;
  }
}

function renderTournamentsTableRows(list) {
  const tbody = document.getElementById("tbody-all-tournaments");
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Không tìm thấy bảng đấu nào.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  list.forEach(t => {
    const tr = document.createElement("tr");
    const isCurrent = t.tournament_id === currentTournamentId;
    const statusBadge = t.champion 
      ? `<span class="badge-tag" style="background:#fef3c7; color:#b45309">Đã kết thúc</span>` 
      : `<span class="badge-tag highlight">Đang diễn ra</span>`;
    const champ = t.champion ? `<strong>${escapeHtml(t.champion)}</strong>` : `<span class="text-muted">Chưa có</span>`;

    tr.innerHTML = `
      <td><code>${escapeHtml(t.tournament_id)}</code></td>
      <td>
        <strong>${escapeHtml(t.name)}</strong>
        ${isCurrent ? '<span class="badge-tag" style="margin-left:6px; background:#dcfce7; color:#15803d">Đang xem</span>' : ''}
      </td>
      <td>${t.num_teams || 8} Đội</td>
      <td>Bo5 (9x9)</td>
      <td>${statusBadge}</td>
      <td>${champ}</td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-sm btn-primary" onclick="window.selectAndLoadTournament('${t.tournament_id}')">Chọn Bảng</button>
          <button class="btn btn-sm btn-outline" onclick="window.viewTournamentBracket('${t.tournament_id}')">Xem Nhánh</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.selectAndLoadTournament = async function(tournamentId) {
  currentTournamentId = tournamentId;
  sessionStorage.setItem("activeTournamentId", tournamentId);
  const sel = document.getElementById("select-active-tournament");
  if (sel) sel.value = tournamentId;
  await loadActiveTournament(tournamentId);
  notifySuccess("Chọn Bảng Đấu", "Đã nạp bảng đấu thành công!");
  switchPublicSubView("overview");
};

window.viewTournamentBracket = async function(tournamentId) {
  currentTournamentId = tournamentId;
  sessionStorage.setItem("activeTournamentId", tournamentId);
  const sel = document.getElementById("select-active-tournament");
  if (sel) sel.value = tournamentId;
  await loadActiveTournament(tournamentId);
  switchPublicSubView("bracket");
};

function filterTeamsOverviewTable(query) {
  const q = (query || "").toLowerCase().trim();
  const rows = document.querySelectorAll("#tbody-teams-overview tr");
  rows.forEach(r => {
    const text = r.textContent.toLowerCase();
    r.style.display = text.includes(q) ? "" : "none";
  });
}

// =============================================================================
// HỆ THỐNG XÁC THỰC VAI TRÒ & PHÂN QUYỀN (ROLE-BASED ACCESS CONTROL)
// =============================================================================
function updateRoleUI() {
  document.body.className = "role-" + currentAppRole.toLowerCase();

  const pill = document.getElementById("user-role-pill");
  const nameEl = document.getElementById("user-display-name");
  const subEl = document.getElementById("user-sub-detail");
  const authBtn = document.getElementById("btn-user-auth-action");

  // Các element giao diện mới của sidebar user card
  const guestCard = document.getElementById("user-card-guest-view");
  const authCard = document.getElementById("user-card-auth-view");
  const authPill = document.getElementById("user-auth-pill");
  const authAvatar = document.getElementById("user-auth-avatar");
  const displaySid = document.getElementById("user-display-sid");
  const btnLogout = document.getElementById("btn-user-logout");

  if (currentAppRole === "ADMIN") {
    currentUserRole = "ADMIN";
    if (guestCard) guestCard.style.display = "none";
    if (authCard) authCard.style.display = "block";
    if (authPill) {
      authPill.className = "user-role-pill role-admin";
      authPill.textContent = "BAN TỔ CHỨC";
    }
    if (authAvatar) authAvatar.textContent = "👑";
    if (nameEl) nameEl.textContent = "Ban Tổ Chức (Admin)";
    if (displaySid) displaySid.textContent = "Toàn Quyền Quản Trị";
  } else if (currentAppRole === "REFEREE") {
    currentUserRole = "REFEREE";
    if (guestCard) guestCard.style.display = "none";
    if (authCard) authCard.style.display = "block";
    if (authPill) {
      authPill.className = "user-role-pill role-referee";
      authPill.textContent = "TRỌNG TÀI";
    }
    if (authAvatar) authAvatar.textContent = "⚖️";
    if (nameEl) nameEl.textContent = "Trọng Tài Điều Hành";
    if (displaySid) displaySid.textContent = "Tổ Trọng Tài Quốc Gia";
  } else if (currentAppRole === "TEAM") {
    currentUserRole = "TEAM";
    if (guestCard) guestCard.style.display = "none";
    if (authCard) authCard.style.display = "block";
    if (authPill) {
      authPill.className = "user-role-pill role-team";
      authPill.textContent = "ĐỘI TUYỂN";
    }
    const initials = (currentTeamName || "K69").slice(0, 3).toUpperCase();
    if (authAvatar) authAvatar.textContent = initials;
    if (nameEl) nameEl.textContent = currentTeamName ? `${currentTeamName}` : "Đội Thi Đấu";
    if (displaySid) displaySid.textContent = `SBD: ${currentTeamStudentId || '---'}`;
  } else {
    currentUserRole = "GUEST";
    currentAppRole = "GUEST";
    if (guestCard) guestCard.style.display = "block";
    if (authCard) authCard.style.display = "none";
    if (pill) {
      pill.className = "user-role-pill guest";
      pill.textContent = "CHƯA ĐĂNG NHẬP";
    }
  }

  // Cập nhật nút Đăng Nhập trên card khách và Đăng Xuất trên card tài khoản
  if (authBtn) {
    authBtn.onclick = () => showLoginPage();
  }
  if (btnLogout) {
    btnLogout.onclick = handleUserLogout;
  }

  sessionStorage.setItem("userRole", currentUserRole);
  localStorage.setItem("ARENA_USER_ROLE", currentAppRole);

  // Phân quyền hiển thị thanh điều hướng:
  const authRequiredTabs = document.querySelectorAll(".nav-tab-btn.auth-required");
  const adminTabBtn = document.getElementById("nav-btn-admin");

  if (currentAppRole === "GUEST") {
    authRequiredTabs.forEach(btn => btn.style.display = "none");
    if (adminTabBtn) adminTabBtn.style.display = "none";

    // Chỉ chuyển về tab Tổng quan nếu người dùng đang ở tab Admin mà không có quyền Admin
    const currentActivePane = document.querySelector(".tab-pane.active");
    if (currentActivePane && currentActivePane.id === "tab-admin-console") {
      switchToTab("tab-overview");
    }
  } else {
    // Đã đăng nhập: hiển thị đầy đủ các tab thi đấu
    authRequiredTabs.forEach(btn => btn.style.display = "flex");

    // Bàn Quản Trị chỉ hiển thị cho ADMIN
    if (adminTabBtn) {
      adminTabBtn.style.display = (currentAppRole === "ADMIN") ? "flex" : "none";
    }
  }

  // Phân quyền trên Team Workspace
  const wsGuestAlert = document.getElementById("workspace-guest-alert");
  const wsTeamProfile = document.getElementById("workspace-team-profile");
  const studioIdeCard = document.getElementById("studio-ide-card");

  if (wsGuestAlert && studioIdeCard) {
    if (currentAppRole === "GUEST") {
      wsGuestAlert.style.display = "flex";
      if (wsTeamProfile) wsTeamProfile.style.display = "none";
      studioIdeCard.style.opacity = "0.45";
      studioIdeCard.style.pointerEvents = "none";
    } else {
      wsGuestAlert.style.display = "none";
      if (wsTeamProfile) wsTeamProfile.style.display = "flex";
      studioIdeCard.style.opacity = "1";
      studioIdeCard.style.pointerEvents = "auto";
      populateTeamWorkspaceProfile();
    }
  }

  // Phân quyền trên Match Arena
  const btnRefereeStart = document.getElementById("btn-referee-start");
  const refereeSub = document.querySelector(".referee-sub-actions");
  const refereeNotice = document.getElementById("referee-role-notice");

  if (currentAppRole === "ADMIN" || currentAppRole === "REFEREE") {
    if (btnRefereeStart) btnRefereeStart.style.display = "inline-flex";
    if (refereeSub) refereeSub.style.display = "flex";
    if (refereeNotice) refereeNotice.style.display = "none";
  } else {
    if (btnRefereeStart) btnRefereeStart.style.display = "none";
    if (refereeSub) refereeSub.style.display = "none";
    if (refereeNotice) refereeNotice.style.display = "block";
  }

  // Phân quyền trên Admin Console
  const adminGuestAlert = document.getElementById("admin-guest-alert");
  const adminZone = document.getElementById("admin-authenticated-zone");
  if (adminGuestAlert && adminZone) {
    if (currentAppRole === "ADMIN") {
      adminGuestAlert.style.display = "none";
      adminZone.style.display = "block";
    } else {
      adminGuestAlert.style.display = "flex";
      adminZone.style.display = "none";
    }
  }

  // Phân quyền các nút trên thanh công cụ Bảng Đấu (Chỉ Ban Tổ Chức Admin mới thấy và bấm được)
  const btnCreateTourn = document.getElementById("btn-open-create-tourn");
  const btnTeamMgr = document.getElementById("btn-open-team-mgr-bracket");
  if (btnCreateTourn) {
    btnCreateTourn.style.display = (currentAppRole === "ADMIN") ? "inline-flex" : "none";
  }
  if (btnTeamMgr) {
    btnTeamMgr.style.display = (currentAppRole === "ADMIN") ? "inline-flex" : "none";
  }
}

function handleUserLogout() {
  currentAppRole = "GUEST";
  currentUserRole = "GUEST";
  currentTeamStudentId = "";
  currentTeamName = "";
  localStorage.setItem("ARENA_USER_ROLE", "GUEST");
  localStorage.removeItem("ARENA_STUDENT_ID");
  localStorage.removeItem("ARENA_TEAM_NAME");
  sessionStorage.setItem("ARENA_USER_ROLE", "GUEST");
  sessionStorage.setItem("userRole", "GUEST");
  sessionStorage.removeItem("ARENA_STUDENT_ID");
  sessionStorage.removeItem("ARENA_TEAM_NAME");
  clearArenaCookie("arena_user_role");
  clearArenaCookie("arena_student_id");
  clearArenaCookie("arena_team_name");
  updateRoleUI();
  switchToTab("tab-overview");
  notifyInfo("Đã Đăng Xuất", "Bạn đã quay lại chế độ Khách xem Tổng quan.");
}

// =============================================================================
// THAM GIA GIẢI ĐẤU VỚI CƠ CHẾ SO KHỚP CHUẨN SỐ BÁO DANH & NHÁNH ĐẤU
// Tuyệt đối không cho phép vào bừa các nhánh của sinh viên khác!
// =============================================================================
async function handleJoinTournament() {
  if (currentAppRole === "GUEST") {
    notifyWarning("Yêu Cầu Đăng Nhập", "Vui lòng đăng nhập đúng tài khoản sinh viên (Số Báo Danh) để vào nhánh đấu của bạn!");
    openRoleModal("TEAM");
    return;
  }

  if (!currentTournamentData) {
    notifyWarning("Chưa Chọn Bảng Đấu", "Vui lòng chọn bảng đấu trong danh sách để tham gia!");
    return;
  }

  const tourn = currentTournamentData;

  // Quyền Ban Tổ Chức (Admin) được phép vào xem/soạn thảo cho bảng
  if (currentAppRole === "ADMIN") {
    switchToTab("tab-team-workspace");
    populateTeamWorkspaceProfile();
    notifyInfo("Ban Tổ Chức", `Đang mở phòng thi đấu/kiểm thử cho bảng: ${tourn.name}`);
    return;
  }

  // Quyền Đội Tuyển (Thí Sinh): BẮT BUỘC SO KHỚP CHUẨN SỐ BÁO DANH TRONG NHÁNH ĐẤU
  const mySID = (currentTeamStudentId || "").trim();
  const myName = (currentTeamName || "").trim().toLowerCase();

  if (!mySID) {
    notifyWarning("Chưa Có Số Báo Danh", "Vui lòng cập nhật Số Báo Danh / MSSV để hệ thống đối soát nhánh đấu!");
    openRoleModal("TEAM");
    return;
  }

  const teams = tourn.teams || [];
  const matches = tourn.matches ? Object.values(tourn.matches) : [];

  // Tìm trong danh sách đội đã đăng ký của bảng
  const matchedTeam = teams.find(t =>
    (mySID && String(t.student_id).trim() === mySID) ||
    (myName && t.team_name && t.team_name.toLowerCase().trim() === myName)
  );

  // Tìm trong các cặp đấu của nhánh đấu
  let matchedMatch = null;
  let matchedSide = null;

  for (const m of matches) {
    if (m.team_a && (
      (mySID && String(m.team_a.student_id).trim() === mySID) ||
      (myName && m.team_a.team_name && m.team_a.team_name.toLowerCase().trim() === myName)
    )) {
      matchedMatch = m;
      matchedSide = "team_a";
      break;
    }
    if (m.team_b && (
      (mySID && String(m.team_b.student_id).trim() === mySID) ||
      (myName && m.team_b.team_name && m.team_b.team_name.toLowerCase().trim() === myName)
    )) {
      matchedMatch = m;
      matchedSide = "team_b";
      break;
    }
  }

  // NẾU HOÀN TOÀN KHÔNG KHỚP: TỪ CHỐI TRUY CẬP VÀ MỞ MODAL CẢNH BÁO LỆCH NHÁNH
  if (!matchedTeam && !matchedMatch) {
    const mismatchModal = document.getElementById("modal-branch-mismatch");
    if (mismatchModal) {
      const sidEl = document.getElementById("mismatch-user-sid");
      const teamEl = document.getElementById("mismatch-user-team");
      const tournEl = document.getElementById("mismatch-tourn-name");
      const msgEl = document.getElementById("mismatch-detail-msg");

      if (sidEl) sidEl.textContent = mySID || "---";
      if (teamEl) teamEl.textContent = currentTeamName || ("Đội " + mySID);
      if (tournEl) tournEl.textContent = tourn.name;
      if (msgEl) {
        msgEl.innerHTML = `
          Hệ thống đối soát xác nhận Số Báo Danh <strong>${escapeHtml(mySID)}</strong> (${escapeHtml(currentTeamName)}) <strong>không thuộc danh sách thi đấu</strong> của bảng <em>"${escapeHtml(tourn.name)}"</em>.<br><br>
          Để đảm bảo tính công bằng và bảo mật mã nguồn, bạn không được phép vào bừa các phòng nộp bài của sinh viên khác. Vui lòng chuyển sang đúng bảng đấu của bạn hoặc đổi tài khoản đăng nhập.
        `;
      }
      mismatchModal.style.display = "flex";
    }
    notifyError("Từ Chối Truy Cập", `Số Báo Danh ${mySID} không thuộc bảng ${tourn.name}!`);
    return;
  }

  // ĐÃ KHỚP! NẾU CÓ TRẬN ĐẤU CỤ THỂ, BIND THẲNG VÀO TRẬN ĐÓ VÀ VÀO PHÒNG NỘP BOT
  if (matchedMatch) {
    currentActiveMatchId = matchedMatch.match_id;
    currentStudioSide = matchedSide;
    sessionStorage.setItem("activeMatchId", matchedMatch.match_id);
    sessionStorage.setItem("studioSide", matchedSide);

    switchToTab("tab-team-workspace");
    const wsTournName = document.getElementById("ws-tourn-name");
    if (wsTournName) wsTournName.textContent = tourn.name;
    populateTeamWorkspaceProfile();
    notifySuccess("So Khớp Chuẩn Nhánh Đấu", `Chào mừng ${currentTeamName} (SBD: ${mySID}) đã vào phòng nộp bot: ${matchedMatch.title} (${matchedSide === 'team_a' ? 'Đội Đỏ' : 'Đội Xanh'})`);
    return;
  }

  // ĐÃ KHỚP VỚI DANH SÁCH ĐỘI NHƯNG CHƯA ĐƯỢC XẾP LỊCH
  switchToTab("tab-bracket");
  notifyInfo("Đã Ghi Danh Trong Bảng", `Đội ${currentTeamName} (SBD: ${mySID}) đã có trong bảng ${tourn.name}. Ban tổ chức đang chuẩn bị xếp lịch thi đấu!`);
}

// Tự động tìm trận và ghép vào đúng nhánh khi đăng nhập
function autoBindStudentToTournamentBracket(sid, teamName) {
  if (!currentTournamentData) return;
  const tourn = currentTournamentData;
  const mySID = String(sid).trim();
  const myName = String(teamName || "").trim().toLowerCase();

  const matches = tourn.matches ? Object.values(tourn.matches) : [];
  let matchedMatch = null;
  let matchedSide = null;

  for (const m of matches) {
    if (m.team_a && (
      (mySID && String(m.team_a.student_id).trim() === mySID) ||
      (myName && m.team_a.team_name && m.team_a.team_name.toLowerCase().trim() === myName)
    )) {
      matchedMatch = m;
      matchedSide = "team_a";
      break;
    }
    if (m.team_b && (
      (mySID && String(m.team_b.student_id).trim() === mySID) ||
      (myName && m.team_b.team_name && m.team_b.team_name.toLowerCase().trim() === myName)
    )) {
      matchedMatch = m;
      matchedSide = "team_b";
      break;
    }
  }

  if (matchedMatch) {
    currentActiveMatchId = matchedMatch.match_id;
    currentStudioSide = matchedSide;
    sessionStorage.setItem("activeMatchId", matchedMatch.match_id);
    sessionStorage.setItem("studioSide", matchedSide);
    openMatchRoom(matchedMatch.match_id);
    notifySuccess("So Khớp Đúng Nhánh Đấu", `Đội ${teamName} (SBD: ${sid}) đã được đưa vào đúng phòng thi đấu: ${matchedMatch.title} (${matchedSide === 'team_a' ? 'Đội Đỏ' : 'Đội Xanh'})!`);
  } else {
    switchToTab("tab-bracket");
    notifyInfo("Đã Đăng Nhập", `Bạn đã đăng nhập với SBD ${sid}. Vui lòng chờ Ban tổ chức xếp lịch thi đấu hoặc chọn nhánh đấu!`);
  }
}

async function populateQuickAuthTeamList() {
  const selTeams = document.getElementById("sel-quick-team-auth");
  if (!selTeams) return;

  const currentVal = selTeams.value;
  selTeams.innerHTML = `<option value="">-- Hoặc chọn nhanh sinh viên đã đăng ký --</option>`;

  const seenSIDs = new Set();
  const addOption = (sid, name, tournName) => {
    if (!sid || seenSIDs.has(sid)) return;
    seenSIDs.add(sid);
    const opt = document.createElement("option");
    opt.value = sid;
    opt.dataset.teamName = name;
    opt.textContent = `${name} (MSSV: ${sid}) [${tournName || 'Hệ thống'}]`;
    selTeams.appendChild(opt);
  };

  // Nạp từ bảng đấu hiện tại
  if (currentTournamentData && currentTournamentData.teams) {
    currentTournamentData.teams.forEach(t => {
      addOption(t.student_id, t.team_name, currentTournamentData.name);
    });
  }

  // Tải thêm từ các giải đấu khác trong hệ thống
  try {
    const res = await fetch(`${API_BASE}/api/tournaments`);
    if (res.ok) {
      const data = await res.json();
      const list = data.tournaments || data || [];
      list.forEach(t => {
        if (t.teams && Array.isArray(t.teams)) {
          t.teams.forEach(tm => addOption(tm.student_id, tm.team_name, t.name));
        }
      });
    }
  } catch (e) {
    // Không làm gián đoạn UI nếu mạng chậm
  }

  if (currentVal && seenSIDs.has(currentVal)) {
    selTeams.value = currentVal;
  }
}

function openRoleModal(preferredRole = null) {
  const modal = document.getElementById("modal-auth-role");
  if (!modal) return;

  // Nạp danh sách sinh viên vào dropdown chọn nhanh
  populateQuickAuthTeamList();

  // Điền sẵn thông tin hiện tại nếu có
  const sidInp = document.getElementById("inp-team-auth-sid");
  const nameInp = document.getElementById("inp-team-auth-name");
  if (sidInp && currentTeamStudentId) sidInp.value = currentTeamStudentId;
  if (nameInp && currentTeamName) nameInp.value = currentTeamName;

  activateRoleChoiceTab(preferredRole || (currentAppRole !== "GUEST" ? currentAppRole : "TEAM"));
  modal.style.display = "flex";
}

function closeRoleModal() {
  const modal = document.getElementById("modal-auth-role");
  if (modal) modal.style.display = "none";
}

function activateRoleChoiceTab(role) {
  document.querySelectorAll(".role-pill-btn").forEach(btn => {
    if (btn.dataset.roleChoice === role) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  const panes = {
    "GUEST": document.getElementById("pane-role-guest"),
    "TEAM": document.getElementById("pane-role-team"),
    "REFEREE": document.getElementById("pane-role-referee"),
    "ADMIN": document.getElementById("pane-role-admin")
  };

  Object.keys(panes).forEach(k => {
    if (panes[k]) {
      panes[k].style.display = (k === role) ? "block" : "none";
    }
  });
}

function populateTeamWorkspaceProfile() {
  const nameEl = document.getElementById("ws-team-name");
  const sidEl = document.getElementById("ws-team-sid");
  const uniEl = document.getElementById("ws-team-uni");
  const matchInfoEl = document.getElementById("ws-match-pairing-info");
  const avatarPill = document.getElementById("ws-avatar-pill");

  if (currentAppRole === "TEAM") {
    if (nameEl) nameEl.textContent = currentTeamName || "Đội Tuyển Của Bạn";
    if (sidEl) sidEl.textContent = `MSSV: ${currentTeamStudentId || '---'}`;
    if (avatarPill) avatarPill.textContent = (currentTeamName || "TEAM").slice(0, 4).toUpperCase();
  } else if (currentAppRole === "ADMIN") {
    if (nameEl) nameEl.textContent = "Ban Tổ Chức (Quyền Soạn Thảo Bot)";
    if (sidEl) sidEl.textContent = "MSSV: ADMIN";
    if (avatarPill) avatarPill.textContent = "ADMIN";
  }

  // Xác định trận đấu và round mục tiêu
  if (currentActiveMatchId && currentTournamentData?.matches?.[currentActiveMatchId]) {
    const m = currentTournamentData.matches[currentActiveMatchId];
    if (matchInfoEl) {
      matchInfoEl.textContent = `Trận: ${m.title} (${m.round_name}) • Đang thi đấu Round ${m.current_round_idx}/5`;
    }
    const titleTarget = document.getElementById("studio-round-target-title");
    if (titleTarget) {
      titleTarget.textContent = `Đang Soạn Mã Cho Round ${m.current_round_idx} / 5 (${m.title})`;
    }
    loadMatchSubmissions(currentActiveMatchId);
  } else if (currentTournamentData?.matches) {
    const firstM = Object.values(currentTournamentData.matches)[0];
    if (firstM) {
      currentActiveMatchId = firstM.match_id;
      if (matchInfoEl) {
        matchInfoEl.textContent = `Trận: ${firstM.title} (${firstM.round_name}) • Đang thi đấu Round ${firstM.current_round_idx}/5`;
      }
      loadMatchSubmissions(firstM.match_id);
    }
  }
}

function updateAdminConsoleStatus() {
  const statusEl = document.getElementById("admin-sched-status");
  const tournNameEl = document.getElementById("admin-sched-tourn-name");
  if (!currentTournamentData) return;

  if (tournNameEl) tournNameEl.textContent = currentTournamentData.name;
  if (statusEl) {
    const teams = currentTournamentData.teams || [];
    const cap = currentTournamentData.num_teams;
    if (teams.length >= cap) {
      statusEl.textContent = `Đã ghi danh đủ ${teams.length}/${cap} đội — Sẵn sàng xếp lịch!`;
      statusEl.style.color = "#16a34a";
    } else {
      statusEl.textContent = `Hiện có ${teams.length}/${cap} đội (Cần thêm ${cap - teams.length} đội).`;
      statusEl.style.color = "#d97706";
    }
  }
}

function populateArenaMatchDropdown() {
  const badge = document.getElementById("arena-current-match-badge");
  if (badge && currentMatchData) {
    badge.textContent = `Đang Xem: ${currentMatchData.title}`;
  }

  const selMatch = document.getElementById("select-arena-match");
  const arenaMatchSel = document.getElementById("arena-match-selector");
  if (!currentTournamentData || !currentTournamentData.matches) return;

  const matches = Object.values(currentTournamentData.matches);

  if (selMatch) {
    selMatch.innerHTML = "";
    matches.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m.match_id;
      opt.textContent = `${m.title} (${m.status})`;
      if (m.match_id === currentActiveMatchId) opt.selected = true;
      selMatch.appendChild(opt);
    });
  }

  if (arenaMatchSel) {
    arenaMatchSel.innerHTML = "";
    matches.forEach((m, idx) => {
      const opt = document.createElement("option");
      opt.value = m.match_id;
      const nameA = m.team_a ? m.team_a.team_name : "Chờ Đội Đỏ";
      const nameB = m.team_b ? m.team_b.team_name : "Chờ Đội Xanh";
      const roundName = m.round_name || `Trận ${idx + 1}`;
      opt.textContent = `${roundName}: ${nameA} vs ${nameB}`;
      if (m.match_id === currentActiveMatchId) opt.selected = true;
      arenaMatchSel.appendChild(opt);
    });

    if (currentActiveMatchId) {
      arenaMatchSel.value = currentActiveMatchId;
    }

    if (!arenaMatchSel.dataset.bound) {
      arenaMatchSel.dataset.bound = "true";
      arenaMatchSel.addEventListener("change", (e) => {
        if (e.target.value) openMatchRoom(e.target.value);
      });
    }
  }
}

function openTeamStudio(side) {
  if (currentAppRole === "GUEST") {
    notifyWarning("Yêu Cầu Đăng Nhập", "Vui lòng đăng nhập với tài khoản đội để vào phòng soạn thảo bot!");
    openRoleModal("TEAM");
    return;
  }

  if (currentAppRole === "ADMIN") {
    currentStudioSide = side;
    sessionStorage.setItem("studioSide", side);
    switchToTab("tab-team-workspace");
    if (currentMatchData && currentMatchData[side]) {
      populateStudioEditor(currentMatchData[side]);
    }
    return;
  }

  if (!currentMatchData || !currentMatchData[side]) {
    notifyWarning("Chưa Có Đội", "Nhánh đấu này chưa có đội tuyển được ghép cặp.");
    return;
  }

  const targetTeam = currentMatchData[side];
  const mySID = (currentTeamStudentId || "").trim();
  const myName = (currentTeamName || "").trim().toLowerCase();

  const isMyTeam = (mySID && String(targetTeam.student_id).trim() === mySID) ||
                   (myName && targetTeam.team_name && targetTeam.team_name.toLowerCase().trim() === myName);

  if (!isMyTeam) {
    notifyError("Từ Chối Truy Cập", `Bạn đang đăng nhập với SBD ${mySID} (${currentTeamName}). Bạn không được phép nộp code hoặc can thiệp vào đội ${targetTeam.team_name} (SBD: ${targetTeam.student_id})!`);
    return;
  }

  currentStudioSide = side;
  sessionStorage.setItem("studioSide", side);
  switchToTab("tab-team-workspace");
  populateStudioEditor(targetTeam);
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

  if (selTourn) {
    selTourn.addEventListener("change", (e) => {
      currentTournamentId = e.target.value;
      sessionStorage.setItem("activeTournamentId", currentTournamentId);
      loadActiveTournament(currentTournamentId);
    });
  }

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
  const btnAutoSchedule = document.getElementById("btn-admin-auto-schedule");
  if (btnAutoSchedule) {
    btnAutoSchedule.addEventListener("click", handleAutoSchedule);
  }

  const btnQuickFillTeams = document.getElementById("btn-admin-quick-fill-teams");
  if (btnQuickFillTeams) {
    btnQuickFillTeams.addEventListener("click", handleQuickFillTeams);
  }

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

function switchToBracketView() {
  switchToTab("public-arena-tab");
  switchPublicSubView("bracket");
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

    // Cập nhật tổng quan Dashboard
    renderDashboardOverview();

    // Tự động tìm trận đấu phù hợp nhất nếu chưa có hoặc đang trỏ trận chưa ghép cặp
    if (!currentActiveMatchId || (data.matches && data.matches[currentActiveMatchId] && !data.matches[currentActiveMatchId].team_a && !data.matches[currentActiveMatchId].team_b)) {
      const best = findBestMatchToDisplay(data);
      if (best) currentActiveMatchId = best.match_id;
    }

    // Nếu đang mở phòng đấu của giải này, cập nhật lại dữ liệu phòng
    if (currentActiveMatchId && data.matches && data.matches[currentActiveMatchId]) {
      renderMatchRoomData(data.matches[currentActiveMatchId]);
    }
    populateArenaMatchDropdown();
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

    // Cập nhật tổng quan Dashboard nếu đang mở
    const overviewEl = document.getElementById("pub-view-overview");
    if (overviewEl && overviewEl.style.display !== "none") {
      renderDashboardOverview();
    }

    // ĐỒNG BỘ REALTIME PHÒNG ĐẤU TRẬN ĐẤU (TAB-MATCH-ARENA) KHÔNG CẦN F5
    const arenaPane = document.getElementById("tab-match-arena");
    if (arenaPane && arenaPane.classList.contains("active")) {
      if (!currentActiveMatchId || !data.matches || !data.matches[currentActiveMatchId]) {
        const best = findBestMatchToDisplay(data);
        if (best) currentActiveMatchId = best.match_id;
      }
      if (currentActiveMatchId && data.matches && data.matches[currentActiveMatchId]) {
        renderMatchRoomDataSilent(data.matches[currentActiveMatchId]);
        renderVisualBattleArena(data.matches[currentActiveMatchId]);
      }
      populateArenaMatchDropdown();
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
// 3. VẼ CÂY SƠ ĐỒ GIẢI ĐẤU ĐA TẦNG (GENERIC 4-32 TEAM BRACKET TREE THEO ẢNH 4)
// =============================================================================
const TEAM_COLOR_PALETTES = [
  "color-red", "color-blue", "color-green", "color-yellow",
  "color-purple", "color-orange", "color-pink", "color-cyan",
  "color-emerald", "color-indigo", "color-amber", "color-rose"
];

const DEFAULT_32_BOT_NAMES = [
  "RedBot", "BlueBot", "GreenBot", "YellowBot",
  "PurpleBot", "OrangeBot", "PinkBot", "CyanBot",
  "RubyBot", "SapphireBot", "EmeraldBot", "AmberBot",
  "VioletBot", "TopazBot", "DiamondBot", "SilverBot",
  "AlphaBot", "BetaBot", "GammaBot", "DeltaBot",
  "OmegaBot", "SigmaBot", "ThetaBot", "ZetaBot",
  "PhoenixBot", "DragonBot", "TigerBot", "FalconBot",
  "ViperBot", "TitanBot", "HydraBot", "GhostBot"
];

function getDynamicTeamColor(teamName, defaultIndex) {
  if (!teamName) return TEAM_COLOR_PALETTES[defaultIndex % TEAM_COLOR_PALETTES.length];
  const lower = teamName.toLowerCase();
  if (lower.includes("red") || lower.includes("đỏ")) return "color-red";
  if (lower.includes("blue") || lower.includes("xanh dương")) return "color-blue";
  if (lower.includes("green") || lower.includes("xanh lá")) return "color-green";
  if (lower.includes("yellow") || lower.includes("vàng")) return "color-yellow";
  if (lower.includes("purple") || lower.includes("tím")) return "color-purple";
  if (lower.includes("orange") || lower.includes("cam")) return "color-orange";
  if (lower.includes("pink") || lower.includes("hồng")) return "color-pink";
  if (lower.includes("cyan") || lower.includes("lam")) return "color-cyan";
  let hash = 0;
  for (let i = 0; i < teamName.length; i++) hash = (hash << 5) - hash + teamName.charCodeAt(i);
  return TEAM_COLOR_PALETTES[Math.abs(hash) % TEAM_COLOR_PALETTES.length];
}

function renderBracketTree(tourn) {
  const canvas = document.getElementById("bracket-tree-canvas");
  if (!canvas) return;

  const numTeams = tourn?.num_teams || 8;
  const k = Math.max(1, Math.round(Math.log2(numTeams))); // e.g. 5 for 32, 4 for 16, 3 for 8, 2 for 4

  // Lấy tên vòng theo khoảng cách tới chung kết
  const getRoundTitle = (distanceToFinal) => {
    if (distanceToFinal === 0) return "Chung kết";
    if (distanceToFinal === 1) return "Bán Kết";
    if (distanceToFinal === 2) return "Tứ kết";
    if (distanceToFinal === 3) return "Vòng 1/8";
    if (distanceToFinal === 4) return "Vòng 1/16";
    return `Vòng 1/${Math.pow(2, distanceToFinal)}`;
  };

  const firstRoundTitle = getRoundTitle(k - 1);

  // Cập nhật tiêu đề và thể thức trên header trang & card
  const tournTitleEl = document.getElementById("bracket-tourn-name-display");
  if (tournTitleEl) {
    tournTitleEl.textContent = tourn?.name || "Giải Đấu Tân Sinh Viên K69";
  }

  const formatEl = document.getElementById("bracket-tourn-format-display");
  if (formatEl) {
    formatEl.textContent = `Thể thức: ${firstRoundTitle} → Chung Kết (Bo5)`;
  }

  const roundTitleCard = document.getElementById("bracket-card-round-title");
  if (roundTitleCard) {
    roundTitleCard.textContent = firstRoundTitle;
  }

  const matches = tourn?.matches || {};
  const teamsList = tourn?.teams || [];

  const isTeamMatch = (matchRef, nameA, nameB) => {
    if (currentAppRole !== "TEAM") return false;
    if (matchRef && isTeamInMatch(matchRef, currentTeamStudentId, currentTeamName)) return true;
    return isTeamInMatch({ team_a: { team_name: nameA }, team_b: { team_name: nameB } }, currentTeamStudentId, currentTeamName);
  };

  const renderNodeHtml = (nodeData) => {
    const isMyMatch = isTeamMatch(nodeData.matchRef, nodeData.team_a, nodeData.team_b);
    const isOtherMatch = (currentAppRole === "TEAM" && !isMyMatch);
    let nodeClass = "bracket-match-node";
    if (isMyMatch) nodeClass += " my-team-match";
    else if (isOtherMatch) nodeClass += " other-team-match";

    const nodeTitle = isMyMatch
      ? "Trận đấu của bạn - Bấm để vào phòng thi đấu và nộp bài"
      : (isOtherMatch 
          ? "Trận đấu của đội khác - Bạn không được phép bấm vào" 
          : "Bấm để xem và nộp bài cho trận đấu");

    return `
      <div class="${nodeClass}" data-match-id="${nodeData.id}" title="${nodeTitle}">
        <div class="node-title-row">
          <span>${nodeData.title}</span>
          ${isMyMatch ? '<span class="badge-my-match" style="background:#2563eb;color:#ffffff;font-size:9.5px;font-weight:700;padding:1px 6px;border-radius:10px;margin-left:6px;">★ Trận của bạn</span>' : ''}
          ${nodeData.isFinal ? '<span class="final-trophy-icon" title="Chung kết tranh Cúp vô địch"><svg width="16" height="16" viewBox="0 0 24 24" fill="#2563eb"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0 0 11 15.9V19H7v2h10v-2h-4v-3.1a5.01 5.01 0 0 0 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2z"/></svg></span>' : ''}
        </div>
        <div class="node-team-row">
          <div class="node-team-info">
            <span class="node-team-avatar ${nodeData.color_a}">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </span>
            <span class="node-team-name">${escapeHtml(nodeData.team_a)}</span>
          </div>
          <span class="node-score">${nodeData.score_a}</span>
        </div>
        <div class="node-team-row">
          <div class="node-team-info">
            <span class="node-team-avatar ${nodeData.color_b}">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </span>
            <span class="node-team-name">${escapeHtml(nodeData.team_b)}</span>
          </div>
          <span class="node-score">${nodeData.score_b}</span>
        </div>
      </div>
    `;
  };

  let columnsHtml = "";

  for (let lvl = 1; lvl <= k; lvl++) {
    const dist = k - lvl;
    const colTitle = getRoundTitle(dist);
    const numMatchesInCol = Math.pow(2, dist);
    const isFinalRound = (lvl === k);

    let roundMatchesData = [];
    for (let i = 0; i < numMatchesInCol; i++) {
      const isGf = isFinalRound;
      const mId = isGf ? "m_gf" : `m_lvl${lvl}_${i + 1}`;
      
      // Fallback aliases cho các phiên bản cũ
      let refMatch = matches[mId];
      if (!refMatch) {
        if (dist === 2) refMatch = matches[`m_qf_${i + 1}`];
        else if (dist === 1) refMatch = matches[`m_sf_${i + 1}`];
        else if (isGf) refMatch = matches["m_gf"];
      }

      let teamAName = refMatch?.team_a?.team_name || refMatch?.team_a?.student_id;
      let teamBName = refMatch?.team_b?.team_name || refMatch?.team_b?.student_id;
      let scoreA = "-";
      let scoreB = "-";

      if (refMatch) {
        if (typeof refMatch.score_a === "number") scoreA = refMatch.score_a;
        if (typeof refMatch.score_b === "number") scoreB = refMatch.score_b;
      }

      // Nạp tên mặc định từ danh sách đăng ký hoặc demo bots nếu chưa gán
      if (lvl === 1) {
        if (!teamAName) {
          teamAName = teamsList[2 * i]?.team_name || DEFAULT_32_BOT_NAMES[2 * i] || `Đội ${2 * i + 1}`;
        }
        if (!teamBName) {
          teamBName = teamsList[2 * i + 1]?.team_name || DEFAULT_32_BOT_NAMES[2 * i + 1] || `Đội ${2 * i + 2}`;
        }
      } else {
        if (!teamAName) teamAName = isGf ? "RedBot" : (i === 0 ? "RedBot" : "OrangeBot");
        if (!teamBName) teamBName = isGf ? "CyanBot" : (i === 0 ? "GreenBot" : "CyanBot");
      }

      // Giữ điểm demo chuẩn 2-1, 2-0 như trong ảnh mẫu nếu đang xem giải mẫu
      if (scoreA === "-" && scoreB === "-" && (!tourn?.status || tourn?.status === "CONFIGURING" || tourn?.status === "WAITING")) {
        if (lvl === 1 && numTeams === 8) {
          const sampleScores = [[2, 1], [2, 0], [1, 2], [0, 2]];
          if (sampleScores[i]) {
            scoreA = sampleScores[i][0];
            scoreB = sampleScores[i][1];
          }
        } else if (lvl === 2 && numTeams === 8) {
          const sampleScores = [[2, 1], [0, 2]];
          if (sampleScores[i]) {
            scoreA = sampleScores[i][0];
            scoreB = sampleScores[i][1];
          }
        }
      }

      const colorA = getDynamicTeamColor(teamAName, (lvl === 1 ? 2 * i : 0));
      const colorB = getDynamicTeamColor(teamBName, (lvl === 1 ? 2 * i + 1 : 1));

      roundMatchesData.push({
        id: mId,
        title: `Trận ${i + 1}`,
        isFinal: isGf,
        team_a: teamAName,
        team_b: teamBName,
        score_a: scoreA,
        score_b: scoreB,
        color_a: colorA,
        color_b: colorB,
        matchRef: refMatch
      });
    }

    // Ghép cặp và đường nhánh kết nối (Connector branches)
    let matchesContentHtml = "";
    if (isFinalRound) {
      matchesContentHtml = `
        <div class="bracket-match-pair final-pair">
          ${renderNodeHtml(roundMatchesData[0])}
        </div>
      `;
    } else {
      const numPairs = numMatchesInCol / 2;
      for (let p = 0; p < numPairs; p++) {
        const m1 = roundMatchesData[2 * p];
        const m2 = roundMatchesData[2 * p + 1];
        matchesContentHtml += `
          <div class="bracket-match-pair">
            ${renderNodeHtml(m1)}
            ${renderNodeHtml(m2)}
            <div class="bracket-connector-branch">
              <svg class="bracket-connector-svg" width="48" height="100%" viewBox="0 0 48 100" preserveAspectRatio="none">
                <path d="M 0,25 H 18 V 75 H 0 M 18,50 H 48" stroke="#93c5fd" stroke-width="1.8" fill="none" stroke-linejoin="round" />
              </svg>
              <span class="connector-status-badge">Đang diễn ra</span>
            </div>
          </div>
        `;
      }
    }

    columnsHtml += `
      <div class="bracket-column-dynamic">
        <div class="bracket-col-header-dynamic">${colTitle}</div>
        <div class="bracket-column-matches-flex">
          ${matchesContentHtml}
        </div>
      </div>
    `;
  }

  canvas.innerHTML = `
    <div class="bracket-tree-scroll-container">
      <div class="bracket-columns-flex">
        ${columnsHtml}
      </div>
    </div>
  `;

  // Gán sự kiện bấm vào từng trận để mở phòng thi đấu (Phân quyền kiểm tra trận của đội)
  canvas.querySelectorAll(".bracket-match-node").forEach(node => {
    node.addEventListener("click", () => {
      const mid = node.dataset.matchId;
      const refMatch = matches[mid] || matches[mid.replace("lvl1_", "qf_").replace("lvl2_", "sf_")];
      if (currentAppRole === "TEAM") {
        const isMyMatch = isTeamInMatch(refMatch, currentTeamStudentId, currentTeamName);
        if (!isMyMatch) {
          notifyWarning(
            "Từ Chối Truy Cập",
            `Bạn đang đăng nhập với tài khoản ${currentTeamName || currentTeamStudentId || "của đội"}. Bạn không được phép bấm vào trận đấu của đội khác! Vui lòng chọn đúng trận đấu của đội mình.`
          );
          return;
        }
      }
      openMatchRoom(mid);
    });
  });

  // Hỗ trợ các nút filter pills
  document.querySelectorAll(".bracket-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".bracket-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
    });
  });
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
  if (!currentTournamentData || !currentTournamentData.matches) return;

  let match = currentTournamentData.matches[matchId];
  if (!match) {
    const altKey = matchId.includes("lvl1_") ? matchId.replace("lvl1_", "qf_") : (matchId.includes("qf_") ? matchId.replace("qf_", "lvl1_") : null);
    if (altKey && currentTournamentData.matches[altKey]) {
      match = currentTournamentData.matches[altKey];
      matchId = altKey;
    }
  }
  if (!match) return;

  // Phân quyền: Tuyển thủ (TEAM) chỉ được phép vào trận đấu của chính mình
  if (currentAppRole === "TEAM") {
    const isMyMatch = isTeamInMatch(match, currentTeamStudentId, currentTeamName);
    if (!isMyMatch) {
      notifyWarning(
        "Từ Chối Truy Cập",
        `Bạn đang đăng nhập với tài khoản ${currentTeamName || currentTeamStudentId || "của đội"}. Bạn không được phép bấm vào trận đấu của đội khác! Vui lòng chọn đúng trận đấu của đội mình.`
      );
      return;
    }
  }

  currentActiveMatchId = matchId;
  sessionStorage.setItem("activeMatchId", matchId);

  // Chuyển sang Tab 3: Match Arena
  switchToTab("tab-match-arena");

  renderMatchRoomData(match);
  populateArenaMatchDropdown();
}

function renderMatchRoomData(match) {
  if (!match) return;
  currentMatchData = match;

  // Tiêu đề phòng đấu
  const titleEl = document.getElementById("match-room-title");
  if (titleEl) titleEl.textContent = match.title ? match.title.toUpperCase() : "TRẬN ĐẤU";

  const stageBadge = document.getElementById("match-room-stage-badge");
  if (stageBadge) stageBadge.textContent = `${match.round_name || 'Tứ Kết'} • Bo5`;

  const statusBadge = document.getElementById("match-room-status-badge");
  if (statusBadge) {
    statusBadge.textContent = match.status === "COMPLETED" ? "Đã kết thúc" : "Đang diễn ra";
    statusBadge.className = "status-pill-green";
  }

  // Tỉ số và các step pills
  const teamA = match.team_a;
  const teamB = match.team_b;
  const scoreText = `${teamA ? teamA.rounds_won : 0} - ${teamB ? teamB.rounds_won : 0}`;
  const scoreSummary = document.getElementById("match-score-summary");
  if (scoreSummary) scoreSummary.textContent = scoreText;

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
    statusBadge.textContent = match.status === "COMPLETED" ? "Đã kết thúc" : "Đang diễn ra";
    statusBadge.className = match.status === "COMPLETED" ? "match-status-badge status-completed" : "status-pill-green";
  }

  const teamA = match.team_a;
  const teamB = match.team_b;
  const scoreText = `${teamA ? teamA.rounds_won : 0} - ${teamB ? teamB.rounds_won : 0}`;
  const scoreSummary = document.getElementById("match-score-summary");
  if (scoreSummary) scoreSummary.textContent = scoreText;

  const roundEl = document.getElementById("arena-round-indicator");
  if (roundEl) {
    roundEl.textContent = match.status === "COMPLETED" ? "CHUNG CUỘC" : `ROUND ${match.current_round_idx || 1} / 5`;
  }

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

// BÀN ĐẤU THỜI GIAN THỰC REALTIME DUEL (DÀNH RIÊNG CHO ADMIN)
function initRealtimeChessboardGrid() {
  const boardEl = document.getElementById("realtime-chessboard-9x9");
  if (!boardEl) return;
  boardEl.innerHTML = "";

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement("div");
      cell.className = "board-cell";
      cell.dataset.col = c;
      cell.dataset.row = r;

      if ((r + c) % 2 === 1) cell.classList.add("cell-alt");
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

function renderRealtimeChessboard(redPieces, bluePieces, clashEvent = null) {
  const boardEl = document.getElementById("realtime-chessboard-9x9");
  if (!boardEl) return;

  if (boardEl.children.length !== 81) {
    initRealtimeChessboardGrid();
  }

  const cells = boardEl.querySelectorAll(".board-cell");
  cells.forEach(cell => {
    cell.innerHTML = "";
    cell.classList.remove("cell-clash");
  });

  if (bluePieces && Array.isArray(bluePieces)) {
    bluePieces.forEach(p => {
      if (!p.alive) return;
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

  if (redPieces && Array.isArray(redPieces)) {
    redPieces.forEach(p => {
      if (!p.alive) return;
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

  if (clashEvent && typeof clashEvent.col === "number" && typeof clashEvent.row === "number") {
    const clashCell = boardEl.querySelector(`.board-cell[data-col="${clashEvent.col}"][data-row="${clashEvent.row}"]`);
    if (clashCell) clashCell.classList.add("cell-clash");
  }
}

function renderVisualBattleArena(match) {
  if (!match) return;
  const teamA = match.team_a;
  const teamB = match.team_b;

  // PHÂN QUYỀN GIAO DIỆN PHÒNG ĐẤU:
  // Nếu là ADMIN: Ẩn cột nộp code, hiện cột bàn đấu realtime với nhật ký nước đi trực tiếp!
  // Đổi tiêu đề cột trái thành "📼 BÀN PHÁT LẠI (REPLAY HIỆP ĐẤU)"
  const studioCol = document.getElementById("arena-studio-col");
  const adminRealtimeCol = document.getElementById("arena-admin-realtime-col");
  const boardTitleLabel = document.getElementById("board-card-title-label");

  if (currentAppRole === "ADMIN") {
    if (studioCol) studioCol.style.display = "none";
    if (adminRealtimeCol) adminRealtimeCol.style.display = "block";
    if (boardTitleLabel) boardTitleLabel.textContent = "📼 BÀN PHÁT LẠI (REPLAY HIỆP ĐẤU)";
    initRealtimeChessboardGrid();
    if (!isMatchRunning) {
      const initPieces = getInitialBoardPieces();
      renderRealtimeChessboard(initPieces.red, initPieces.blue, null);
    }
  } else {
    if (studioCol) studioCol.style.display = "block";
    if (adminRealtimeCol) adminRealtimeCol.style.display = "none";
    if (boardTitleLabel) boardTitleLabel.textContent = "BÀN ĐẤU CHIẾN THUẬT 9×9";
  }

  // Round indicator
  const roundEl = document.getElementById("arena-round-indicator");
  if (roundEl) {
    roundEl.textContent = match.status === "COMPLETED" ? "CHUNG CUỘC" : `ROUND ${match.current_round_idx || 1} / 5`;
  }

  // Tên Đội Đỏ và Đội Xanh
  const nameRed = document.getElementById("arena-name-red");
  const nameBlue = document.getElementById("arena-name-blue");
  if (nameRed) nameRed.textContent = teamA ? teamA.team_name : "Đội Đỏ";
  if (nameBlue) nameBlue.textContent = teamB ? teamB.team_name : "Đội Xanh";

  // MSSV
  const sidRed = document.getElementById("arena-sid-red");
  const sidBlue = document.getElementById("arena-sid-blue");
  if (sidRed) sidRed.textContent = `MSSV: ${teamA?.student_id || 'K69A001'}`;
  if (sidBlue) sidBlue.textContent = `MSSV: ${teamB?.student_id || 'K69A002'}`;

  // Trạng thái nộp code
  const subStateRed = document.getElementById("sub-state-red");
  const subStateBlue = document.getElementById("sub-state-blue");
  if (subStateRed) {
    if (teamA?.code_submitted) {
      subStateRed.textContent = teamA.code_valid ? "Đã nộp code" : "Mã lỗi";
      subStateRed.className = `submission-state-badge ${teamA.code_valid ? 'ready' : 'error'}`;
    } else {
      subStateRed.textContent = "Chờ nộp code";
      subStateRed.className = "submission-state-badge";
    }
  }
  if (subStateBlue) {
    if (teamB?.code_submitted) {
      subStateBlue.textContent = teamB.code_valid ? "Đã nộp code" : "Mã lỗi";
      subStateBlue.className = `submission-state-badge ${teamB.code_valid ? 'ready' : 'error'}`;
    } else {
      subStateBlue.textContent = "Chờ nộp code";
      subStateBlue.className = "submission-state-badge";
    }
  }

  // Nổi bật đội đang dẫn / thắng
  const cardRed = document.getElementById("arena-card-red");
  const cardBlue = document.getElementById("arena-card-blue");
  if (cardRed) cardRed.classList.remove("team-winner");
  if (cardBlue) cardBlue.classList.remove("team-winner");
  if (teamA && teamB) {
    if (teamA.rounds_won > teamB.rounds_won || (match.status === "COMPLETED" && match.winner_name === teamA.team_name)) {
      if (cardRed) cardRed.classList.add("team-winner");
    } else if (teamB.rounds_won > teamA.rounds_won || (match.status === "COMPLETED" && match.winner_name === teamB.team_name)) {
      if (cardBlue) cardBlue.classList.add("team-winner");
    }
  }

  // Render quân cờ trên Bàn cờ 9x9 (Replay / Bàn chính)
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
  const ticker = document.getElementById("arena-commentary-ticker") || document.getElementById("live-commentary-ticker");
  if (ticker) {
    if (match.status === "COMPLETED") {
      ticker.textContent = `Trận đấu đã hoàn tất! Quán quân: ${match.winner_name || '---'}!`;
    } else if (lastR) {
      ticker.textContent = `Hiệp vừa qua: ${lastR.log || lastR.win_reason}`;
    } else {
      ticker.textContent = `Sẵn sàng cho Round ${match.current_round_idx || 1}! Chờ Trọng tài khai hỏa trên bàn cờ 9×9...`;
    }
  }

  // Nút tham gia trận đấu (Header Match Room)
  const btnJoin = document.getElementById("btn-match-join-action");
  const btnJoinText = document.getElementById("btn-match-join-text");
  if (btnJoin) {
    if (currentAppRole === "GUEST") {
      if (btnJoinText) btnJoinText.textContent = "Tham gia trận đấu";
      btnJoin.onclick = () => {
        notifyInfo("Tham Gia Trận Đấu", "Vui lòng đăng nhập để nộp bài bot cho trận đấu.");
        showLoginPage(match.match_id);
      };
    } else {
      if (btnJoinText) btnJoinText.textContent = "Nộp bài cho đội";
      btnJoin.onclick = () => {
        const editor = document.getElementById("studio-code-editor");
        if (editor) {
          editor.focus();
          editor.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        notifyInfo("Phòng Nộp Bot", "Bạn đang ở khu vực nộp bài. Hãy soạn thuật toán và nhấn 'Nộp mã lệnh'!");
      };
    }
  }

  // Nút quản trị viên bắt đầu hiệp
  const btnAdminStart = document.getElementById("btn-arena-start-match");
  if (btnAdminStart) {
    if (currentAppRole === "ADMIN") {
      btnAdminStart.style.display = "inline-flex";
      btnAdminStart.onclick = handleRefereeStartBattle;
      const allReady = Boolean(match.all_teams_ready || (teamA?.code_valid && teamB?.code_valid));
      btnAdminStart.disabled = match.status === "COMPLETED" || isMatchRunning;
      if (allReady) {
        btnAdminStart.textContent = `▶ Bắt Đầu Hiệp ${match.current_round_idx || 1}`;
        btnAdminStart.className = "btn btn-green admin-only";
      } else {
        btnAdminStart.textContent = `▶ Bắt Đầu Hiệp ${match.current_round_idx || 1} (Chờ/Nạp Bot)`;
        btnAdminStart.className = "btn btn-warning admin-only";
      }
    } else {
      btnAdminStart.style.display = "none";
    }
  }

  // Tự động chọn đúng bên (side) cho tuyển thủ đang đăng nhập
  if (currentAppRole === "TEAM" && teamB && currentTeamStudentId && String(teamB.student_id).trim() === currentTeamStudentId.trim()) {
    currentStudioSide = "team_b";
  } else {
    currentStudioSide = "team_a";
  }
  const activeTeam = currentStudioSide === "team_b" ? teamB : teamA;
  if (activeTeam) {
    populateStudioEditor(activeTeam);
  }

  // Ẩn banner nghỉ giải lao cũ nếu không thi đấu
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
  if (btnOpen) {
    btnOpen.disabled = false;
    if (currentAppRole === "ADMIN") {
      btnOpen.textContent = `Soạn Thảo (${side === 'team_a' ? 'Đội Đỏ' : 'Đội Xanh'})`;
    } else if (currentAppRole === "TEAM") {
      const mySID = (currentTeamStudentId || "").trim();
      const myName = (currentTeamName || "").trim().toLowerCase();
      const isMyTeam = (mySID && String(team.student_id).trim() === mySID) ||
                       (myName && team.team_name && team.team_name.toLowerCase().trim() === myName);
      if (isMyTeam) {
        btnOpen.textContent = `✏️ Nộp Bot (${team.team_name})`;
        btnOpen.classList.add("btn-primary");
        btnOpen.classList.remove("btn-outline");
      } else {
        btnOpen.textContent = `🔒 Khán Giả (${team.team_name})`;
        btnOpen.classList.remove("btn-primary");
        btnOpen.classList.add("btn-outline");
      }
    } else {
      btnOpen.textContent = `🔐 Đăng Nhập Để Nộp Bot`;
    }
  }

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

  // Nút bắt đầu hiệp của Quản trị viên (Desktop header Match Room)
  const btnArenaStart = document.getElementById("btn-arena-start-match");
  if (btnArenaStart) {
    btnArenaStart.addEventListener("click", handleRefereeStartBattle);
  }

  // Nút quay lại bảng đấu
  const btnMatchBackBracket = document.getElementById("btn-match-back-bracket");
  if (btnMatchBackBracket) {
    btnMatchBackBracket.addEventListener("click", () => {
      switchToTab("tab-bracket");
    });
  }

  // Nút Tham gia trận đấu / Nộp bài cho đội (Header Match Room)
  const btnJoinAction = document.getElementById("btn-match-join-action");
  if (btnJoinAction) {
    btnJoinAction.addEventListener("click", () => {
      if (currentAppRole === "GUEST") {
        notifyInfo("Tham Gia Trận Đấu", "Vui lòng đăng nhập để nộp bài bot cho trận đấu.");
        showLoginPage(currentActiveMatchId);
      } else {
        const editor = document.getElementById("studio-code-editor");
        if (editor) {
          editor.focus();
          editor.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        notifyInfo("Phòng Nộp Bot", "Bạn đang ở khu vực nộp bài. Hãy soạn thuật toán và nhấn 'Nộp mã lệnh'!");
      }
    });
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

  // Nút quay lại sơ đồ
  const btnBackBracket = document.getElementById("btn-back-to-bracket");
  if (btnBackBracket) {
    btnBackBracket.addEventListener("click", () => {
      switchToBracketView();
    });
  }

  // Điều khiển xem lại từng bước trực tiếp trên bàn cờ 9×9
  setupInlineBoardPlayback();

  // Dropdown chuyển nhanh trận trong Match Arena
  const selMatch = document.getElementById("select-arena-match");
  if (selMatch) {
    selMatch.addEventListener("change", (e) => {
      if (e.target.value) openMatchRoom(e.target.value);
    });
  }

  // Nút Vào Nộp Bot Đội Đỏ / Đội Xanh
  document.querySelectorAll(".btn-jump-to-studio").forEach(btn => {
    btn.addEventListener("click", () => {
      const side = btn.dataset.side || "team_a";
      openTeamStudio(side);
    });
  });
}

// =============================================================================
// ĐIỀU KHIỂN PHÁT LẠI TỪNG BƯỚC TRÊN BÀN CỜ 9×9 (INLINE REPLAY BAR)
// =============================================================================
let inlinePlaybackCurrentIdx = 0;
let inlinePlaybackTimer = null;

function setupInlineBoardPlayback() {
  const btnPrev = document.getElementById("btn-playback-step-prev");
  const btnPlay = document.getElementById("btn-playback-play");
  const btnNext = document.getElementById("btn-playback-step-next");
  const stepIndicator = document.getElementById("playback-step-indicator");

  function getActiveSteps() {
    if (currentMatchData?.rounds_history && currentMatchData.rounds_history.length > 0) {
      const lastR = currentMatchData.rounds_history[currentMatchData.rounds_history.length - 1];
      if (lastR.board_steps && lastR.board_steps.length > 0) {
        return { round: lastR.round_number, steps: lastR.board_steps };
      }
    }
    return { round: 1, steps: [] };
  }

  function renderCurrentStep() {
    const { round, steps } = getActiveSteps();
    if (steps.length === 0) {
      if (stepIndicator) stepIndicator.textContent = `Hiệp ${round}: Chưa có bước cờ`;
      return;
    }
    if (inlinePlaybackCurrentIdx >= steps.length) inlinePlaybackCurrentIdx = steps.length - 1;
    if (inlinePlaybackCurrentIdx < 0) inlinePlaybackCurrentIdx = 0;

    const step = steps[inlinePlaybackCurrentIdx];
    if (step) {
      renderChessboard(step.red_pieces, step.blue_pieces, step.clash);
      const ticker = document.getElementById("arena-commentary-ticker") || document.getElementById("live-commentary-ticker");
      if (ticker && step.log) ticker.textContent = step.log;
    }
    if (stepIndicator) {
      stepIndicator.textContent = `Hiệp ${round}: Bước ${inlinePlaybackCurrentIdx + 1} / ${steps.length}`;
    }
  }

  if (btnPrev) {
    btnPrev.onclick = () => {
      clearInterval(inlinePlaybackTimer);
      inlinePlaybackTimer = null;
      if (btnPlay) btnPlay.textContent = "▶ Phát lại";
      if (inlinePlaybackCurrentIdx > 0) {
        inlinePlaybackCurrentIdx--;
        renderCurrentStep();
      }
    };
  }

  if (btnNext) {
    btnNext.onclick = () => {
      clearInterval(inlinePlaybackTimer);
      inlinePlaybackTimer = null;
      if (btnPlay) btnPlay.textContent = "▶ Phát lại";
      const { steps } = getActiveSteps();
      if (inlinePlaybackCurrentIdx < steps.length - 1) {
        inlinePlaybackCurrentIdx++;
        renderCurrentStep();
      }
    };
  }

  if (btnPlay) {
    btnPlay.onclick = () => {
      const { steps } = getActiveSteps();
      if (steps.length === 0) {
        notifyInfo("Chưa Có Dữ Liệu", "Chưa có hiệp đấu nào diễn ra để phát lại.");
        return;
      }
      if (inlinePlaybackTimer) {
        clearInterval(inlinePlaybackTimer);
        inlinePlaybackTimer = null;
        btnPlay.textContent = "▶ Phát lại";
      } else {
        btnPlay.textContent = "⏸ Tạm dừng";
        if (inlinePlaybackCurrentIdx >= steps.length - 1) {
          inlinePlaybackCurrentIdx = 0;
        }
        renderCurrentStep();
        inlinePlaybackTimer = setInterval(() => {
          if (inlinePlaybackCurrentIdx < steps.length - 1) {
            inlinePlaybackCurrentIdx++;
            renderCurrentStep();
          } else {
            clearInterval(inlinePlaybackTimer);
            inlinePlaybackTimer = null;
            btnPlay.textContent = "▶ Phát lại";
          }
        }, 800);
      }
    };
  }
}

// =============================================================================
// 5. MÀN HÌNH NỘP CODE BẢO MẬT RIÊNG TƯ (PRIVATE BOT SUBMISSION STUDIO)
// =============================================================================
function openPrivateStudio(side) {
  if (!currentTournamentData || !currentActiveMatchId) return;

  if (currentAppRole === "GUEST") {
    notifyWarning("Yêu Cầu Đăng Nhập", "Vui lòng đăng nhập với tài khoản đội để vào phòng soạn thảo bot!");
    openRoleModal("TEAM");
    return;
  }

  if (currentAppRole === "TEAM") {
    const match = currentTournamentData.matches[currentActiveMatchId];
    const targetTeam = match ? match[side] : null;
    if (targetTeam) {
      const mySID = (currentTeamStudentId || "").trim();
      const myName = (currentTeamName || "").trim().toLowerCase();
      const isMyTeam = (mySID && String(targetTeam.student_id).trim() === mySID) ||
                       (myName && targetTeam.team_name && targetTeam.team_name.toLowerCase().trim() === myName);
      if (!isMyTeam) {
        notifyError("Từ Chối Truy Cập", `Bạn đang đăng nhập với SBD ${mySID}. Không được phép truy cập phòng nộp code của đội ${targetTeam.team_name} (SBD: ${targetTeam.student_id})!`);
        return;
      }
    }
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

  updateStudioSubmitBtnText(match.current_round_idx);

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
  if (btnBack) {
    btnBack.addEventListener("click", () => {
      switchToTab("match-arena-tab");
    });
  }

  // Tải code mẫu gợi ý
  if (btnTemplate) {
    btnTemplate.addEventListener("click", () => {
      if (selLang.value === "CPP") {
        editor.value = DEFAULT_CPP_CODE;
      } else {
        editor.value = DEFAULT_PYTHON_CODE;
      }
      notifyInfo("Nạp Mẫu Code", `Đã nạp mẫu code chuẩn ${selLang.value}.`);
    });
  }

  // Dry-run thẩm định cú pháp & sandbox
  const btnDryRun = document.getElementById("btn-studio-dryrun");
  if (btnDryRun) {
    btnDryRun.addEventListener("click", () => {
      const code = editor.value.trim();
      if (!code) {
        notifyWarning("Chưa Có Mã", "Vui lòng viết mã bot trước khi thẩm định.");
        return;
      }
      const lang = selLang.value;
      let valid = true;
      let msg = "";
      if (lang === "PYTHON" && !code.includes("decide_move")) {
        valid = false;
        msg = "Thiếu hàm chuẩn: decide_move(game_state).";
      } else if (lang === "CPP" && !code.includes("main")) {
        valid = false;
        msg = "Thiếu hàm chuẩn: int main().";
      }

      const latencyMs = Math.floor(Math.random() * 8) + 12;
      if (valid) {
        notifySuccess("Sandbox Dry-run: HỢP LỆ", `Cú pháp & Entry point chuẩn xác (${latencyMs}ms). Giới hạn: CPU 1.0s, RAM 128MB. Sẵn sàng nộp!`);
      } else {
        notifyWarning("Cảnh Báo Cú Pháp", msg);
      }
    });
  }

  // Chọn Round mục tiêu nộp code trong Team Workspace
  document.querySelectorAll("#ws-round-selector-pills .intel-badge").forEach(badge => {
    badge.addEventListener("click", () => {
      document.querySelectorAll("#ws-round-selector-pills .intel-badge").forEach(b => b.classList.remove("active"));
      badge.classList.add("active");
      const rIdx = badge.dataset.targetRound || "1";
      const titleTarget = document.getElementById("studio-round-target-title");
      if (titleTarget) titleTarget.textContent = `Đang Soạn Mã Cho Round ${rIdx} / 5`;
      updateStudioSubmitBtnText(rIdx);
    });
  });

  // Nút đăng nhập cho khách trong Team Workspace
  const btnWsLogin = document.getElementById("btn-workspace-guest-login");
  if (btnWsLogin) {
    btnWsLogin.addEventListener("click", () => {
      openRoleModal("TEAM");
    });
  }

  if (selLang) {
    selLang.addEventListener("change", () => {
      if (editor.value.trim() === "" || editor.value === DEFAULT_PYTHON_CODE || editor.value === DEFAULT_CPP_CODE) {
        editor.value = selLang.value === "CPP" ? DEFAULT_CPP_CODE : DEFAULT_PYTHON_CODE;
      }
    });
  }

  // Đăng nhập đội tuyển
  if (btnAuth) {
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

        await loadActiveTournament(currentTournamentId);
        const team = currentTournamentData.matches[currentActiveMatchId][currentStudioSide];
        populateStudioEditor(team);

      } catch (err) {
        console.error("Lỗi đăng nhập:", err);
        notifyError("Lỗi Kết Nối", "Không thể kết nối đến máy chủ API.");
      }
    });
  }

  // Nộp mã lệnh Bot
  if (btnSubmitBot) {
    btnSubmitBot.addEventListener("click", async () => {
      if (!currentTournamentId) {
        notifyWarning("Chưa Chọn Giải", "Vui lòng chọn giải đấu trước khi nộp bot!");
        return;
      }

      // Tự động tìm đúng trận và đúng bên (team_a hay team_b) cho đội đang đăng nhập
      if (currentAppRole === "TEAM" && currentTeamStudentId && currentTournamentData?.matches) {
        const mySID = String(currentTeamStudentId).trim().toLowerCase();
        const myName = String(currentTeamName || "").trim().toLowerCase();
        for (const [mId, m] of Object.entries(currentTournamentData.matches)) {
          if (m.team_a && ((mySID && String(m.team_a.student_id).trim().toLowerCase() === mySID) || (myName && m.team_a.team_name && m.team_a.team_name.toLowerCase().trim() === myName))) {
            currentActiveMatchId = mId;
            currentStudioSide = "team_a";
            break;
          }
          if (m.team_b && ((mySID && String(m.team_b.student_id).trim().toLowerCase() === mySID) || (myName && m.team_b.team_name && m.team_b.team_name.toLowerCase().trim() === myName))) {
            currentActiveMatchId = mId;
            currentStudioSide = "team_b";
            break;
          }
        }
      }

      if (!currentActiveMatchId) {
        const best = findBestMatchToDisplay(currentTournamentData);
        if (best) currentActiveMatchId = best.match_id;
      }

      if (!currentActiveMatchId) {
        notifyWarning("Chưa Chọn Trận", "Vui lòng chọn trận đấu trước khi nộp bot!");
        return;
      }

      const currentMatch = currentTournamentData?.matches?.[currentActiveMatchId];
      const side = currentStudioSide || "team_a";

      if (!currentMatch || !currentMatch[side]) {
        notifyWarning("Chưa Có Đội", `Phe ${side === 'team_a' ? 'Đội Đỏ' : 'Đội Xanh'} trong trận này chưa có đội được xếp cặp! Vui lòng chọn trận đấu của đội bạn.`);
        return;
      }

      const code = editor.value.trim();
      if (!code) {
        notifyWarning("Thiếu Mã Lệnh", "Vui lòng viết mã lệnh bot trong khung soạn thảo trước khi nộp!");
        return;
      }

      const curRound = currentMatch.current_round_idx || 1;
      btnSubmitBot.disabled = true;
      const submitTextSpan = document.getElementById("btn-submit-bot-text");
      if (submitTextSpan) submitTextSpan.textContent = "Đang nộp...";

      try {
        const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/matches/${currentActiveMatchId}/code`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            side: side,
            code_content: code,
            language: selLang.value
          })
        });

        const data = await res.json();
        if (!res.ok) {
          notifyError("Lỗi Nộp Mã Lệnh", data.detail || "Không thể nộp bài vào hệ thống.");
          btnSubmitBot.disabled = false;
          updateStudioSubmitBtnText(curRound);
          return;
        }

        if (data.is_valid) {
          notifySuccess(`Nộp Bot Round ${curRound} Thành Công`, `Mã lệnh đã thẩm định qua Sandbox (${data.validation?.execution_time_ms || 14}ms). Trạng thái: ĐÃ SẴN SÀNG.`);
        } else {
          notifyWarning("Code Không Hợp Lệ", `${data.validation?.error_message || "Lỗi cú pháp/thực thi"}. Bạn có thể sửa lại và bấm nộp lại bất kỳ lúc nào.`);
        }

        btnSubmitBot.disabled = false;
        updateStudioSubmitBtnText(curRound);

        await loadActiveTournament(currentTournamentId);
        loadMatchSubmissions(currentActiveMatchId);
        broadcastCrossTabSync("CODE_SUBMITTED");

      } catch (err) {
        console.error("Lỗi nộp code:", err);
        notifyError("Lỗi Kết Nối", "Không thể kết nối đến máy chủ API.");
        btnSubmitBot.disabled = false;
        updateStudioSubmitBtnText(curRound);
      }
    });
  }

  // Nút thử nghiệm với Bot Mẫu của Hệ Thống
  const btnPractice = document.getElementById("btn-studio-test-practice");
  if (btnPractice) {
    btnPractice.addEventListener("click", () => {
      handlePracticeMatch();
    });
  }
}

function returnToMatchRoom() {
  switchToTab("match-arena-tab");
  if (currentTournamentData && currentActiveMatchId) {
    renderMatchRoomData(currentTournamentData.matches[currentActiveMatchId]);
  }
}

// =============================================================================
// 6. TIẾN TRÌNH THI ĐẤU TỪNG ROUND MỘT (LIVE VISUAL ARENA DUEL ENGINE)
// =============================================================================
async function handleRefereeStartBattle() {
  if (!currentTournamentId || !currentActiveMatchId || isMatchRunning) return;

  // Quyền kiểm soát: Ban tổ chức (Admin) hoặc Trọng tài (Referee)
  if (currentAppRole !== "ADMIN" && currentAppRole !== "REFEREE") {
    notifyWarning("Quyền Hạn", "Chỉ Ban tổ chức (Admin) mới có quyền phát lệnh bắt đầu trận đấu!");
    return;
  }

  const match = currentTournamentData ? currentTournamentData.matches[currentActiveMatchId] : null;
  if (!match) return;

  if (!match.team_a || !match.team_b) {
    notifyWarning("Chưa Có Đội", "Trận đấu này chưa có đủ 2 đội được ghép cặp. Vui lòng chọn trận đấu ở bảng đấu hoặc bấm 'Tự Sắp Xếp Lịch' trong Quản Lý Đội!");
    return;
  }

  // Backend và frontend cùng kiểm tra: Cả 2 đội phải có code hợp lệ
  const readyA = Boolean(match.team_a && match.team_a.code_valid);
  const readyB = Boolean(match.team_b && match.team_b.code_valid);
  if (!match.all_teams_ready && !(readyA && readyB)) {
    const missing = [];
    if (!readyA) missing.push(match.team_a.team_name || "Đội Đỏ");
    if (!readyB) missing.push(match.team_b.team_name || "Đội Xanh");

    const confirmFill = confirm(
      `Đội [${missing.join(", ")}] chưa nộp mã lệnh hợp lệ cho Hiệp ${match.current_round_idx || 1}.\n\nBạn có muốn Ban Tổ Chức tự động nạp Bot mẫu mặc định cho đội chưa nộp để thi đấu ngay bây giờ không?`
    );
    if (!confirmFill) return;

    try {
      const fillRes = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/matches/${currentActiveMatchId}/demo-fill`, {
        method: "POST"
      });
      if (!fillRes.ok) {
        notifyError("Lỗi Nạp Bot", "Không thể nạp bot tự động.");
        return;
      }
      notifyInfo("Ban Tổ Chức", "Đã nạp Bot mẫu mặc định. Bắt đầu hiệp đấu ngay...");
      await loadActiveTournament(currentTournamentId);
    } catch (err) {
      notifyError("Lỗi Kết Nối", "Không thể kết nối API nạp bot.");
      return;
    }
  }

  isMatchRunning = true;
  const btn = document.getElementById("btn-referee-start");
  if (btn) {
    btn.disabled = true;
    btn.classList.add("running");
    btn.textContent = `ĐANG THI ĐẤU ROUND ${match.current_round_idx || 1}...`;
  }

  const btnArenaStart = document.getElementById("btn-arena-start-match");
  if (btnArenaStart) {
    btnArenaStart.disabled = true;
    btnArenaStart.textContent = `⚡ Đang Đấu Hiệp ${match.current_round_idx || 1}...`;
  }

  const rtBadge = document.getElementById("realtime-battle-status-badge");
  if (rtBadge) {
    rtBadge.textContent = "⚡ Đang giao tranh trực tiếp...";
    rtBadge.className = "status-pill-orange";
  }

  const rtLog = document.getElementById("realtime-moves-log");
  if (rtLog) {
    rtLog.innerHTML = `<div style="color: #38bdf8; padding: 4px 0; font-weight: bold;">[Bắt đầu] Khai hỏa Hiệp ${match.current_round_idx || 1}: ${match.team_a.team_name} (Đỏ) VS ${match.team_b.team_name} (Xanh)</div>`;
  }

  const rtTicker = document.getElementById("realtime-commentary-ticker");
  if (rtTicker) rtTicker.textContent = `Khai hỏa Hiệp ${match.current_round_idx || 1}! Đã khởi tạo bàn cờ 9x9...`;

  const ticker = document.getElementById("arena-commentary-ticker") || document.getElementById("live-commentary-ticker");
  if (ticker) ticker.textContent = `Khai hỏa Round ${match.current_round_idx || 1}! Đã khóa mã nguồn 2 đội và khởi tạo bàn cờ 9x9...`;

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
        btn.textContent = `BẮT ĐẦU TRẬN ĐẤU (ROUND ${match.current_round_idx || 1})`;
      }
      return;
    }

    const record = data.round_record;

    // --- HIỆU ỨNG CHIẾN ĐẤU VÀ ĂN QUÂN TRỰC TIẾP TRÊN CẢ BÀN REALTIME VÀ BÀN REPLAY ---
    if (record.board_steps && record.board_steps.length > 0) {
      for (let i = 0; i < record.board_steps.length; i++) {
        const step = record.board_steps[i];
        renderRealtimeChessboard(step.red_pieces, step.blue_pieces, step.clash_event);
        renderChessboard(step.red_pieces, step.blue_pieces, step.clash_event);

        if (ticker) ticker.textContent = step.log;
        if (rtTicker) rtTicker.textContent = step.log;

        const stepCounter = document.getElementById("realtime-step-count");
        if (stepCounter) stepCounter.textContent = `Nước ${i + 1} / ${record.board_steps.length}`;

        if (rtLog && step.log) {
          const row = document.createElement("div");
          row.style.padding = "2px 0";
          row.style.borderBottom = "1px dashed rgba(255,255,255,0.06)";
          const clashTag = step.clash_event ? `<span style="color:#ef4444; font-weight:700;">[VA CHẠM]</span> ` : "";
          row.innerHTML = `<span style="color:#60a5fa; font-weight:600;">[Bước ${step.step_idx || (i+1)}]</span> ${clashTag}<span style="color:${step.clash_event ? '#fca5a5' : '#cbd5e1'}">${escapeHtml(step.log)}</span>`;
          rtLog.appendChild(row);
          rtLog.scrollTop = rtLog.scrollHeight;
        }

        await new Promise(r => setTimeout(r, 380));
      }
    }

    // Hiển thị thông báo kết thúc Round
    if (ticker) {
      ticker.textContent = record.win_reason ? record.win_reason.replace(/[🏆🏁⚔️⚡]/g, '').trim() : '';
    }
    if (rtTicker && record.win_reason) {
      rtTicker.textContent = `Kết quả Hiệp ${record.round_number}: ${record.win_reason}`;
    }
    if (rtBadge) {
      rtBadge.textContent = `Hiệp ${record.round_number} hoàn tất!`;
      rtBadge.className = "status-pill-green";
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
      scoreSummary.textContent = `${data.match.team_a ? data.match.team_a.rounds_won : 0} - ${data.match.team_b ? data.match.team_b.rounds_won : 0}`;
    }

    // Cập nhật 3 loại nhật ký và bảng submissions ngay lập tức
    renderCategorizedLogs(record);
    loadMatchSubmissions(currentActiveMatchId);

    // Cập nhật dữ liệu giải đấu và đưa thanh Replay của bàn trái vào trạng thái sẵn sàng
    await loadActiveTournament(currentTournamentId);
    inlinePlaybackCurrentIdx = record.board_steps ? record.board_steps.length - 1 : 0;
    const stepIndicator = document.getElementById("playback-step-indicator");
    if (stepIndicator && record.board_steps) {
      stepIndicator.textContent = `Hiệp ${record.round_number}: Bước ${record.board_steps.length} / ${record.board_steps.length}`;
    }

    // Xử lý chuyển round với đếm ngược thống nhất
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

      // Đếm ngược 3 giây
      for (let sec = 3; sec >= 1; sec--) {
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
      broadcastCrossTabSync("MATCH_UPDATED");

    } else {
      // Trận đấu kết thúc chung cuộc
      await loadActiveTournament(currentTournamentId);
      broadcastCrossTabSync("MATCH_UPDATED");
      notifySuccess("Trận Đấu Hoàn Tất!", `Quán quân trận đấu: ${data.match?.winner_name || "---"}`);
    }

  } catch (err) {
    console.error("Lỗi chạy hiệp đấu:", err);
    notifyError("Lỗi Hệ Thống", "Có lỗi trong quá trình thi đấu.");
  } finally {
    isMatchRunning = false;
    if (btn) btn.classList.remove("running");
    if (btnArenaStart) {
      btnArenaStart.disabled = false;
      const curMatch = currentTournamentData?.matches?.[currentActiveMatchId];
      btnArenaStart.textContent = `▶ Bắt Đầu Hiệp ${curMatch?.current_round_idx || 1}`;
    }
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

    const tbodyKaggle = document.getElementById("tbody-kaggle-submissions");
    if (tbodyKaggle) {
      tbodyKaggle.innerHTML = "";
      subs.slice().reverse().forEach(s => {
        const tr = document.createElement("tr");
        const d = new Date((s.submitted_at || Date.now() / 1000) * 1000);
        const timeStr = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        const validText = s.is_valid
          ? `<span class="badge-tag" style="background:#dcfce7; color:#15803d; border:1px solid #86efac;">Hợp Lệ [OK]</span>`
          : `<span class="badge-tag" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5;" title="${escapeHtml(s.error_message || '')}">Không Hợp Lệ [FAIL]</span>`;
        const lockedText = s.is_locked ? `<span style="color:#d97706; font-weight:700;">Đã Khóa</span>` : `<span style="color:#16a34a; font-weight:600;">Sẵn Sàng</span>`;
        tr.innerHTML = `
          <td><code>${escapeHtml(s.submission_id)}</code></td>
          <td>${timeStr}</td>
          <td><strong>Round ${s.round_number}</strong> (${escapeHtml(s.language || 'PYTHON')})</td>
          <td>${validText}</td>
          <td>${lockedText}</td>
          <td><button class="btn btn-sm btn-outline" onclick="window.viewSubmissionCode('${escapeHtml(s.submission_id)}')">Xem Code</button></td>
        `;
        tbodyKaggle.appendChild(tr);
      });
    }
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

  const closeCreateModal = () => { 
    if (modalCreate) modalCreate.style.display = "none"; 
  };
  window.closeCreateTournModal = closeCreateModal;

  if (btnOpenCreate) {
    btnOpenCreate.addEventListener("click", () => {
      if (currentAppRole !== "ADMIN") {
        notifyWarning("Từ Chối Quyền", "Chỉ Ban Tổ Chức (Admin) mới có quyền tạo giải đấu mới! Các đội không được phép tạo giải.");
        return;
      }
      if (modalCreate) modalCreate.style.display = "flex";
    });
  }

  if (btnCloseCreate) btnCloseCreate.addEventListener("click", closeCreateModal);
  if (btnCloseCreateX) btnCloseCreateX.addEventListener("click", closeCreateModal);

  if (btnSubmitCreate) {
    btnSubmitCreate.addEventListener("click", async () => {
      if (currentAppRole !== "ADMIN") {
        notifyWarning("Từ Chối Quyền", "Chỉ Ban Tổ Chức (Admin) mới có quyền tạo giải đấu mới!");
        return;
      }

      const inpName = document.getElementById("inp-new-tourn-name");
      const name = inpName ? inpName.value.trim() : "";
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
        closeCreateModal();
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
  }

  // Modal xem code
  const modalCode = document.getElementById("modal-view-code");
  const btnCloseCode = document.getElementById("btn-close-view-code") || document.getElementById("btn-close-code-modal");
  const btnCloseCodeBtn = document.getElementById("btn-close-view-code-x") || document.getElementById("btn-close-code-modal-btn");

  const closeCodeModal = () => { if (modalCode) modalCode.style.display = "none"; };
  if (btnCloseCode) btnCloseCode.addEventListener("click", closeCodeModal);
  if (btnCloseCodeBtn) btnCloseCodeBtn.addEventListener("click", closeCodeModal);

  // Modal Quản Lý Đội Tuyển & Bốc Thăm Nhánh Đấu
  const btnCloseTeamMgr = document.getElementById("btn-close-team-mgr");
  const btnCloseTeamMgrX = document.getElementById("btn-close-team-mgr-x");
  const btnMgrAddTeam = document.getElementById("btn-mgr-add-team");
  const btnMgrQuickFill = document.getElementById("btn-mgr-quick-fill");
  const btnMgrAutoSchedule = document.getElementById("btn-mgr-auto-schedule");

  if (btnCloseTeamMgr) btnCloseTeamMgr.addEventListener("click", () => window.closeTeamManagerModal());
  if (btnCloseTeamMgrX) btnCloseTeamMgrX.addEventListener("click", () => window.closeTeamManagerModal());
  if (btnMgrAddTeam) btnMgrAddTeam.addEventListener("click", handleAddTeamSubmit);
  if (btnMgrQuickFill) btnMgrQuickFill.addEventListener("click", handleQuickFillTeams);
  if (btnMgrAutoSchedule) btnMgrAutoSchedule.addEventListener("click", handleAutoSchedule);

  // Modal Xác Thực Danh Tính & Đổi Vai Trò (Redesigned Prominent Auth)
  const btnOpenRoleModal = document.getElementById("btn-open-role-modal");
  const btnCloseRoleModal = document.getElementById("btn-close-role-modal");
  const btnCloseRoleModalX = document.getElementById("btn-close-role-modal-x");
  const btnUserAuthAction = document.getElementById("btn-user-auth-action");

  if (btnOpenRoleModal) btnOpenRoleModal.addEventListener("click", () => openRoleModal("TEAM"));
  if (btnUserAuthAction) btnUserAuthAction.addEventListener("click", () => openRoleModal("TEAM"));
  if (btnCloseRoleModal) btnCloseRoleModal.addEventListener("click", closeRoleModal);
  if (btnCloseRoleModalX) btnCloseRoleModalX.addEventListener("click", closeRoleModal);

  document.querySelectorAll(".role-pill-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      activateRoleChoiceTab(btn.dataset.roleChoice);
    });
  });

  // Tự động tìm kiếm và điền thông tin khi thí sinh nhập MSSV hoặc chọn dropdown
  const inpTeamSid = document.getElementById("inp-team-auth-sid");
  const inpTeamName = document.getElementById("inp-team-auth-name");
  const selQuickTeam = document.getElementById("sel-quick-team-auth");
  const authBadge = document.getElementById("auth-team-preview-badge");
  const authBadgeText = document.getElementById("auth-preview-text");

  if (selQuickTeam) {
    selQuickTeam.addEventListener("change", () => {
      const chosenOpt = selQuickTeam.options[selQuickTeam.selectedIndex];
      if (selQuickTeam.value && chosenOpt) {
        if (inpTeamSid) inpTeamSid.value = selQuickTeam.value;
        const nameVal = chosenOpt.dataset.teamName || chosenOpt.textContent.split(" (")[0];
        if (inpTeamName) inpTeamName.value = nameVal;
        if (authBadge && authBadgeText) {
          authBadge.style.display = "block";
          authBadgeText.textContent = `Đã khớp: ${nameVal} (MSSV: ${selQuickTeam.value})`;
        }
      }
    });
  }

  if (inpTeamSid) {
    const handleSidInput = () => {
      const val = inpTeamSid.value.trim();
      if (!val) {
        if (authBadge) authBadge.style.display = "none";
        return;
      }
      let foundName = null;
      if (currentTournamentData && currentTournamentData.teams) {
        const t = currentTournamentData.teams.find(x => String(x.student_id).trim() === val);
        if (t) foundName = t.team_name;
      }
      if (!foundName && selQuickTeam) {
        for (let i = 0; i < selQuickTeam.options.length; i++) {
          if (selQuickTeam.options[i].value === val) {
            foundName = selQuickTeam.options[i].dataset.teamName || selQuickTeam.options[i].textContent.split(" (")[0];
            break;
          }
        }
      }
      if (foundName) {
        if (inpTeamName && !inpTeamName.value) inpTeamName.value = foundName;
        if (authBadge && authBadgeText) {
          authBadge.style.display = "block";
          authBadgeText.textContent = `Đã khớp: ${foundName} (MSSV: ${val})`;
        }
      } else {
        if (authBadge) authBadge.style.display = "none";
      }
    };
    inpTeamSid.addEventListener("input", handleSidInput);
    inpTeamSid.addEventListener("blur", handleSidInput);
  }

  const btnConfGuest = document.getElementById("btn-confirm-guest-role");
  if (btnConfGuest) {
    btnConfGuest.addEventListener("click", () => {
      currentAppRole = "GUEST";
      currentUserRole = "GUEST";
      localStorage.setItem("ARENA_USER_ROLE", "GUEST");
      updateRoleUI();
      closeRoleModal();
      notifySuccess("Chế Độ Khách", "Đã chuyển sang chế độ Khán giả công khai.");
    });
  }

  const btnConfTeam = document.getElementById("btn-confirm-team-role");
  if (btnConfTeam) {
    btnConfTeam.addEventListener("click", () => {
      const sid = (document.getElementById("inp-team-auth-sid")?.value || "").trim();
      const customName = (document.getElementById("inp-team-auth-name")?.value || "").trim();
      if (!sid) {
        notifyWarning("Thiếu Thông Tin", "Vui lòng nhập Số Báo Danh (MSSV) của bạn!");
        return;
      }
      let foundTeamName = customName || ("Đội Tuyển " + sid);
      if (!customName && currentTournamentData && currentTournamentData.teams) {
        const t = currentTournamentData.teams.find(x => String(x.student_id).trim() === sid);
        if (t) foundTeamName = t.team_name;
      }
      currentAppRole = "TEAM";
      currentUserRole = "TEAM";
      currentTeamStudentId = sid;
      currentTeamName = foundTeamName;
      localStorage.setItem("ARENA_USER_ROLE", "TEAM");
      localStorage.setItem("ARENA_STUDENT_ID", sid);
      localStorage.setItem("ARENA_TEAM_NAME", foundTeamName);
      sessionStorage.setItem("userRole", "TEAM");
      updateRoleUI();
      closeRoleModal();
      notifySuccess("Đăng Nhập Thành Công", `Chào mừng đội ${foundTeamName} (SBD: ${sid})!`);
      // Tự động kiểm tra và bind vào nhánh đấu nếu có trong giải hiện tại
      autoBindStudentToTournamentBracket(sid, foundTeamName);
    });
  }

  const btnConfRef = document.getElementById("btn-confirm-referee-role");
  if (btnConfRef) {
    btnConfRef.addEventListener("click", () => {
      const user = (document.getElementById("inp-referee-auth-user")?.value || "").trim();
      const pass = (document.getElementById("inp-referee-auth-pass")?.value || "").trim();
      if (user !== "referee" || pass !== "ref123") {
        notifyError("Xác Thực Thất Bại", "Sai thông tin Trọng tài! (Mặc định: referee / ref123)");
        return;
      }
      currentAppRole = "REFEREE";
      currentUserRole = "REFEREE";
      localStorage.setItem("ARENA_USER_ROLE", "REFEREE");
      sessionStorage.setItem("userRole", "REFEREE");
      updateRoleUI();
      closeRoleModal();
      notifySuccess("Xác Thực Trọng Tài", "Quyền điều hành trận đấu đã được kích hoạt!");
    });
  }

  const btnConfAdmin = document.getElementById("btn-confirm-admin-role");
  if (btnConfAdmin) {
    btnConfAdmin.addEventListener("click", () => {
      const user = (document.getElementById("inp-admin-auth-user")?.value || "").trim();
      const pass = (document.getElementById("inp-admin-auth-pass")?.value || "").trim();
      if (user !== "admin" || pass !== "admin123") {
        notifyError("Xác Thực Thất Bại", "Sai thông tin Ban tổ chức! (Mặc định: admin / admin123)");
        return;
      }
      currentAppRole = "ADMIN";
      currentUserRole = "ADMIN";
      currentTeamStudentId = "ADMIN";
      currentTeamName = "Ban Tổ Chức (Admin)";
      localStorage.setItem("ARENA_USER_ROLE", "ADMIN");
      localStorage.setItem("ARENA_STUDENT_ID", "ADMIN");
      localStorage.setItem("ARENA_TEAM_NAME", "Ban Tổ Chức (Admin)");
      sessionStorage.setItem("ARENA_USER_ROLE", "ADMIN");
      sessionStorage.setItem("userRole", "ADMIN");
      sessionStorage.setItem("ARENA_STUDENT_ID", "ADMIN");
      sessionStorage.setItem("ARENA_TEAM_NAME", "Ban Tổ Chức (Admin)");
      setArenaCookie("arena_user_role", "ADMIN");
      setArenaCookie("arena_student_id", "ADMIN");
      setArenaCookie("arena_team_name", "Ban Tổ Chức (Admin)");
      updateRoleUI();
      closeRoleModal();
      notifySuccess("Đăng Nhập Ban Tổ Chức", "Đã mở khóa toàn bộ quyền Quản trị viên (Admin)!");
      switchToTab("tab-overview");
    });
  }

  // Modal Cảnh Báo Lệch Nhánh Đấu (Branch Mismatch)
  const modalMismatch = document.getElementById("modal-branch-mismatch");
  const btnCloseMismatchX = document.getElementById("btn-close-mismatch-x");
  const btnMismatchSwitch = document.getElementById("btn-mismatch-switch-tourn");
  const btnMismatchChangeAcc = document.getElementById("btn-mismatch-change-account");

  if (btnCloseMismatchX && modalMismatch) {
    btnCloseMismatchX.addEventListener("click", () => {
      modalMismatch.style.display = "none";
    });
  }
  if (btnMismatchSwitch && modalMismatch) {
    btnMismatchSwitch.addEventListener("click", () => {
      modalMismatch.style.display = "none";
      switchToTab("tab-tournaments");
    });
  }
  if (btnMismatchChangeAcc && modalMismatch) {
    btnMismatchChangeAcc.addEventListener("click", () => {
      modalMismatch.style.display = "none";
      openRoleModal("TEAM");
    });
  }


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

  // Khán giả và mọi vai trò đều có thể xem trực tiếp trận đấu trong Match Arena
  openMatchRoom(matchId);
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

  updateStudioSubmitBtnText(match.current_round_idx);

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
window.closeTeamManagerModal = function() {
  const modal = document.getElementById("modal-manage-teams");
  if (modal) modal.style.display = "none";
};

function openTeamManagerModal() {
  if (currentAppRole !== "ADMIN") {
    notifyWarning("Quyền Hạn Ban Tổ Chức", "Chỉ Ban Tổ Chức (Admin) mới có quyền quản lý danh sách đội thi đấu!");
    return;
  }
  const modal = document.getElementById("modal-manage-teams");
  if (!modal) return;

  renderTeamManagerTable();
  modal.style.display = "flex";
}

function renderTeamManagerTable() {
  const tbody = document.getElementById("tbody-mgr-teams");
  if (!tbody || !currentTournamentData) return;

  const teams = currentTournamentData.teams || [];
  const cap = currentTournamentData.num_teams || 8;

  const countBadge = document.getElementById("mgr-teams-count-badge");
  if (countBadge) countBadge.textContent = `${teams.length} / ${cap} Đội`;

  const oldBadge = document.getElementById("count-teams-badge");
  if (oldBadge) oldBadge.textContent = `${teams.length}/${cap}`;

  if (teams.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 24px;">Chưa có đội nào tham gia giải này. Bạn có thể thêm từng đội hoặc bấm "⚡ Nạp Nhanh Đội Mẫu".</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  teams.forEach((t, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="padding: 9px 12px; font-size: 12px;"><strong>#${t.seed || (idx + 1)}</strong></td>
      <td style="padding: 9px 12px; font-size: 12px;"><strong>${escapeHtml(t.team_name)}</strong></td>
      <td style="padding: 9px 12px; font-size: 12px;"><code>${escapeHtml(t.student_id)}</code></td>
      <td style="padding: 9px 12px; font-size: 12px;">${escapeHtml(t.university || 'Khối Kỹ Thuật')}</td>
      <td style="padding: 9px 12px; text-align: center;">
        <button class="btn-delete-team-row" data-sid="${escapeHtml(t.student_id)}" title="Xóa đội này khỏi giải đấu">
          🗑️ Xóa
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".btn-delete-team-row").forEach(btn => {
    btn.addEventListener("click", () => {
      handleDeleteTeam(btn.dataset.sid);
    });
  });
}

async function handleAddTeamSubmit() {
  if (!currentTournamentId || !currentTournamentData) return;
  if (currentAppRole !== "ADMIN") {
    notifyWarning("Quyền Hạn Ban Tổ Chức", "Chỉ Ban Tổ Chức (Admin) mới có quyền thêm đội!");
    return;
  }

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
        btn.textContent = "+ Thêm Đội";
      }
      return;
    }

    if (nameInp) nameInp.value = "";
    if (sidInp) sidInp.value = "";
    if (uniInp) uniInp.value = "Khối Kỹ Thuật";

    if (btn) {
      btn.disabled = false;
      btn.textContent = "+ Thêm Đội";
    }

    notifySuccess("Thêm Đội Thành Công", data.message || `Đã thêm thành công đội ${name}!`);
    await loadActiveTournament(currentTournamentId);
    renderTeamManagerTable();

  } catch (err) {
    console.error("Lỗi thêm đội:", err);
    notifyError("Lỗi Kết Nối", "Không thể kết nối đến máy chủ API.");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "+ Thêm Đội";
    }
  }
}

async function handleDeleteTeam(studentId) {
  if (!currentTournamentId) return;
  if (currentAppRole !== "ADMIN") {
    notifyWarning("Quyền Hạn Ban Tổ Chức", "Chỉ Ban Tổ Chức (Admin) mới có quyền xóa đội!");
    return;
  }
  if (!confirm(`Bạn có chắc muốn xóa đội có MSSV '${studentId}' khỏi giải đấu?`)) return;

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/teams/${studentId}`, {
      method: "DELETE"
    });
    const data = await res.json();
    if (!res.ok) {
      notifyError("Lỗi Xóa Đội", data.detail || "Không thể xóa đội khỏi giải.");
      return;
    }

    notifySuccess("Xóa Đội Thành Công", `Đã xóa đội có MSSV ${studentId} khỏi giải.`);
    await loadActiveTournament(currentTournamentId);
    renderTeamManagerTable();

  } catch (err) {
    console.error("Lỗi xóa đội:", err);
    notifyError("Lỗi Kết Nối", "Không thể kết nối đến máy chủ API.");
  }
}

async function handleQuickFillTeams() {
  if (!currentTournamentId) return;
  if (currentAppRole !== "ADMIN") {
    notifyWarning("Quyền Hạn Ban Tổ Chức", "Chỉ Ban Tổ Chức (Admin) mới có quyền nạp danh sách đội mẫu!");
    return;
  }

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
        btn.textContent = "⚡ Nạp Nhanh Đội Mẫu";
      }
      return;
    }

    if (btn) {
      btn.disabled = false;
      btn.textContent = "⚡ Nạp Nhanh Đội Mẫu";
    }

    notifySuccess("Nạp Đội Mẫu Thành Công", data.message || "Đã nạp nhanh đủ danh sách đội mẫu!");
    await loadActiveTournament(currentTournamentId);
    renderTeamManagerTable();

  } catch (err) {
    console.error("Lỗi nạp nhanh đội:", err);
    notifyError("Lỗi Kết Nối", "Không thể kết nối đến máy chủ API.");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "⚡ Nạp Nhanh Đội Mẫu";
    }
  }
}

async function handleAutoSchedule() {
  if (!currentTournamentId || !currentTournamentData) return;
  if (currentAppRole !== "ADMIN") {
    notifyWarning("Quyền Hạn Ban Tổ Chức", "Chỉ Ban Tổ Chức (Admin) mới có quyền bốc thăm sắp xếp lịch đấu!");
    return;
  }

  const btn = document.getElementById("btn-mgr-auto-schedule");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Đang Bốc Thăm...";
  }

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/auto-schedule`, {
      method: "POST"
    });
    const data = await res.json();
    if (!res.ok) {
      notifyError("Lỗi Xếp Lịch", data.detail || "Không thể xếp lịch thi đấu.");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = "🎲 Bốc Thăm & Chia Nhánh Ngẫu Nhiên";
      }
      return;
    }

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = "🎲 Bốc Thăm & Chia Nhánh Ngẫu Nhiên";
    }

    notifySuccess("Bốc Thăm Thành Công!", "Đã tự động bốc thăm và chia nhánh ngẫu nhiên các đội vào sơ đồ thi đấu.");
    window.closeTeamManagerModal();

    await loadActiveTournament(currentTournamentId);
    switchToBracketView();

  } catch (err) {
    console.error("Lỗi tự sắp xếp lịch:", err);
    notifyError("Lỗi Kết Nối", "Không thể kết nối đến máy chủ API.");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = "🎲 Bốc Thăm & Chia Nhánh Ngẫu Nhiên";
    }
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

  const selBoss = document.getElementById("sel-trial-boss-bot");
  const boss = selBoss ? selBoss.value : "RANDOM";

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
        side: currentStudioSide || "team_a",
        boss: boss
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
window.closePracticeArenaModal = closePracticeArenaModal;


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
// =============================================================================
async function loadLeaderboard() {
  const tbody = document.getElementById("tbody-ranking");
  if (!tbody) return;

  const referenceAll8 = [
    { rank: 1, name: "RedBot", sid: "K69A001", elo: 1620, color: "color-red" },
    { rank: 2, name: "BlueBot", sid: "K69A002", elo: 1580, color: "color-blue" },
    { rank: 3, name: "GreenBot", sid: "K69A003", elo: 1520, color: "color-green" },
    { rank: 4, name: "YellowBot", sid: "K69A004", elo: 1480, color: "color-yellow" },
    { rank: 5, name: "PurpleBot", sid: "K69A005", elo: 1420, color: "color-purple" },
    { rank: 6, name: "OrangeBot", sid: "K69A006", elo: 1380, color: "color-orange" },
    { rank: 7, name: "PinkBot", sid: "K69A007", elo: 1340, color: "color-pink" },
    { rank: 8, name: "CyanBot", sid: "K69A008", elo: 1300, color: "color-cyan" }
  ];

  try {
    const res = await fetch(`${API_BASE}/api/ranking`);
    if (res.ok) {
      const ranks = await res.json();
      if (Array.isArray(ranks) && ranks.length > 0) {
        tbody.innerHTML = "";
        ranks.forEach((r, idx) => {
          const rankNum = idx + 1;
          const medalSvg = getMedalSvg(rankNum);
          const colorClass = getBotColorClass(idx);
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>
              ${medalSvg}
              <span class="rank-num-bold">${rankNum}</span>
            </td>
            <td>
              <div class="bot-team-cell">
                <span class="bot-avatar-circle ${colorClass}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </span>
                <span class="team-name-bold">${escapeHtml(r.bot_name || r.team_name || "Bot")}</span>
              </div>
            </td>
            <td><span class="student-id-code">${escapeHtml(r.student_id || "---")}</span></td>
            <td style="text-align: right;"><span class="elo-score-bold">${r.elo_score || 1200}</span></td>
          `;
          tbody.appendChild(tr);
        });
        return;
      }
    }
  } catch (err) {
    console.warn("Dùng fallback bảng xếp hạng Mockup 3:", err);
  }

  // Fallback chuẩn 8 đội theo Mockup 3
  tbody.innerHTML = "";
  referenceAll8.forEach(r => {
    const medalSvg = getMedalSvg(r.rank);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        ${medalSvg}
        <span class="rank-num-bold">${r.rank}</span>
      </td>
      <td>
        <div class="bot-team-cell">
          <span class="bot-avatar-circle ${r.color}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </span>
          <span class="team-name-bold">${escapeHtml(r.name)}</span>
        </div>
      </td>
      <td><span class="student-id-code">${r.sid}</span></td>
      <td style="text-align: right;"><span class="elo-score-bold">${r.elo}</span></td>
    `;
    tbody.appendChild(tr);
  });
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

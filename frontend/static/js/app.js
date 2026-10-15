async function initApp() {
  // 0. Luôn đóng màn hình đăng nhập modal/fullview khi nạp trang
  setupCrossTabSync();
  hideLoginPage();

  // 1. Khôi phục trạng thái Đăng nhập & Vai trò (Bảo toàn 100% khi nhấn F5 reload hoặc mở tab mới)
  const restoredToken = sessionStorage.getItem("arenaSessionToken") || localStorage.getItem("arenaSessionToken");
  if (restoredToken) sessionStorage.setItem("arenaSessionToken", restoredToken);
  const hasSession = Boolean(restoredToken);
  const rawRole = hasSession ? (sessionStorage.getItem("ARENA_USER_ROLE") || sessionStorage.getItem("userRole") || localStorage.getItem("ARENA_USER_ROLE") || "").trim().toUpperCase() : "GUEST";
  const rawSid = hasSession ? (sessionStorage.getItem("ARENA_STUDENT_ID") || localStorage.getItem("ARENA_STUDENT_ID") || "").trim() : "";
  const rawName = hasSession ? (sessionStorage.getItem("ARENA_TEAM_NAME") || localStorage.getItem("ARENA_TEAM_NAME") || "").trim() : "";

  if (rawRole === "ADMIN") {
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

  window.addEventListener("arena-session-expired", () => {
    currentAppRole = "GUEST";
    currentUserRole = "GUEST";
    currentTeamStudentId = "";
    currentTeamName = "";
    updateRoleUI();
    notifyWarning("Phiên đăng nhập đã hết hạn", "Vui lòng đăng nhập lại để tiếp tục thao tác.");
  });

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
  const savedMatchSelection = sessionStorage.getItem("matchExplicitlySelected") ?? localStorage.getItem("matchExplicitlySelected");

  if (savedTourn) currentTournamentId = savedTourn;
  if (savedMatch) currentActiveMatchId = savedMatch;
  if (savedSide) currentStudioSide = savedSide;
  if (savedMatchSelection !== null) sessionStorage.setItem("matchExplicitlySelected", savedMatchSelection);

  setupSidebarNavigation();
  setupPublicSubNav();
  setupTournamentControls();
  setupMatchRoomControls();
  setupStudioControls();
  setupAdminControls();
  setupModals();
  updateRoleUI();
  await Promise.all([restoreArenaSession(), loadArenaCapabilities()]);
  window.addEventListener("pagehide", saveTabScroll);
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  // Khôi phục tab trước khi reload nếu có
  if (savedTab && savedTab !== "tab-overview" && savedTab !== "tab-match-arena") {
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
    btnSetBackend.addEventListener("click", async () => {
      const current = localStorage.getItem("ARENA_API_URL") || "";
      const input = await promptAction("Nhập đường dẫn máy chủ Backend của bạn:\n(Ví dụ: link Cloudflare Tunnel https://xxx.trycloudflare.com hoặc link Render https://xxx.onrender.com)", current);
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
  await loadTournamentsList();
  if (savedTab === "tab-match-arena") switchToTab("tab-match-arena");

  // Tự động đồng bộ thời gian thực mỗi 2.0 giây để cập nhật trạng thái nộp bài không cần F5
  setInterval(() => {
    if (currentTournamentId && !isMatchRunning && (!matchSocket || matchSocket.readyState !== WebSocket.OPEN)) {
      loadActiveTournamentSilent(currentTournamentId);
    }
  }, 2000);
}


if (document.readyState === 'loading') {
  document.addEventListener("DOMContentLoaded", () => { window.arenaReady = initApp(); });
} else {
  window.arenaReady = initApp();
}

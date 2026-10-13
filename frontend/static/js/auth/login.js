// =============================================================================
// QUẢN LÝ MÀN HÌNH ĐĂNG NHẬP RIÊNG BIỆT (MOCKUP 4 REPLICATION)
// =============================================================================
function showLoginPage(targetMatchId = null) {
  closeRegistrationPage();
  const matches = currentTournamentData?.matches || {};
  const savedMatchId = sessionStorage.getItem("activeMatchId");
  pendingLoginMatchId = [targetMatchId, currentActiveMatchId, savedMatchId]
    .find(matchId => matchId && matches[matchId]) || null;
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
  const username = document.getElementById("inp-login-user")?.value.trim() || "";
  const password = document.getElementById("inp-login-pass")?.value || "";
  const isAdminLogin = username.toLowerCase() === "admin";
  const error = document.getElementById("login-error-msg");
  const button = document.getElementById("btn-login-submit");
  if (!username || !password) {
    if (error) { error.textContent = "Nhập tài khoản và mật khẩu."; error.style.display = "block"; }
    return;
  }
  if (button) { button.disabled = true; button.textContent = "Đang xác thực..."; }
  try {
    const loginURL = isAdminLogin
      ? `${API_BASE}/api/admin/login`
      : `${API_BASE}/api/teams/login`;
    const response = await fetch(loginURL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, tournament_id: currentTournamentId || "" })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Đăng nhập thất bại.");
    const previouslySelectedMatch = sessionStorage.getItem("matchExplicitlySelected") === "true"
      && currentTournamentId === data.tournament_id
      && currentActiveMatchId === data.match_id;
    saveArenaSessionToken(data.session_token);
    currentUserRole = data.role;
    currentAppRole = data.role === "ADMIN" ? "ADMIN" : "TEAM";
    currentStudioSide = data.side || null;
    currentTeamName = isAdminLogin ? "Ban Tổ Chức" : (data.team?.team_name || username);
    currentTeamStudentId = isAdminLogin ? "ADMIN" : (data.team?.student_id || username);
    sessionStorage.setItem("userRole", data.role);
    sessionStorage.setItem("ARENA_USER_ROLE", currentAppRole);
    sessionStorage.setItem("ARENA_STUDENT_ID", currentTeamStudentId);
    sessionStorage.setItem("ARENA_TEAM_NAME", currentTeamName);
    updateRoleUI();
    hideLoginPage();
    if (isAdminLogin) {
      pendingLoginMatchId = null;
      switchToTab("tab-admin-console");
      return;
    }
    if (!data.tournament_id) {
      resetSelectedMatch();
      pendingLoginMatchId = null;
      switchToTab('tab-bracket');
      notifySuccess('Đăng nhập thành công', 'Chọn giải và trận của đội trong Bảng đấu. Nếu đội chưa có trong giải, hãy chờ Ban tổ chức thêm đội.');
      return;
    }
    currentTournamentId = data.tournament_id;
    currentActiveMatchId = data.match_id;
    sessionStorage.setItem("activeTournamentId", currentTournamentId);
    localStorage.setItem("activeTournamentId", currentTournamentId);
    sessionStorage.setItem("activeMatchId", currentActiveMatchId);
    localStorage.setItem("activeMatchId", currentActiveMatchId);
    sessionStorage.setItem("matchExplicitlySelected", previouslySelectedMatch ? "true" : "false");
    localStorage.setItem("matchExplicitlySelected", previouslySelectedMatch ? "true" : "false");
    await loadActiveTournament(currentTournamentId);
    currentActiveMatchId = data.match_id;
    switchToTab("tab-bracket");
    notifySuccess("Đăng nhập thành công", "Đã tự tìm giải đấu và trận của đội. Chọn trận trên bảng đấu để mở tab Trận đấu.");
    pendingLoginMatchId = null;
  } catch (err) {
    if (error) { error.textContent = err.message; error.style.display = "block"; }
  } finally {
    if (button) { button.disabled = false; button.textContent = "Đăng nhập"; }
  }
}

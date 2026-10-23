// =============================================================================
// QUẢN LÝ MÀN HÌNH ĐĂNG NHẬP & QUÊN MẬT KHẨU AN TOÀN (BOT ARENA)
// =============================================================================
let forgotPasswordSID = "";

function showLoginPage(targetMatchId = null) {
  closeRegistrationPage();
  closeForgotPasswordPage();
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

function closeLoginPage() {
  hideLoginPage();
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPass = input.type === "password";
  input.type = isPass ? "text" : "password";
  if (btn) {
    const iconUse = btn.querySelector("use");
    if (iconUse) {
      iconUse.setAttribute("href", isPass ? "#icon-eye-off" : "#icon-eye");
    }
  }
}

function showForgotPasswordPage() {
  hideLoginPage();
  closeRegistrationPage();
  const forgotView = document.getElementById("view-forgot-password");
  if (forgotView) {
    forgotView.style.display = "flex";
  }
  const banner = document.getElementById("forgot-alert-banner");
  if (banner) banner.style.display = "none";
  const step1 = document.getElementById("form-forgot-step1");
  const step2 = document.getElementById("form-forgot-step2");
  if (step1) step1.style.display = "block";
  if (step2) step2.style.display = "none";
  const sidInp = document.getElementById("forgot-sid");
  if (sidInp) {
    sidInp.value = "";
    setTimeout(() => sidInp.focus(), 100);
  }
}

function closeForgotPasswordPage() {
  const forgotView = document.getElementById("view-forgot-password");
  if (forgotView) {
    forgotView.style.display = "none";
  }
}

async function handleForgotStep1(event) {
  if (event) event.preventDefault();
  const sidInp = document.getElementById("forgot-sid");
  const banner = document.getElementById("forgot-alert-banner");
  const btn = document.getElementById("btn-forgot-step1-submit");
  const sid = (sidInp?.value || "").trim();

  if (!sid) {
    if (banner) {
      banner.textContent = "Vui lòng nhập Mã sinh viên của bạn.";
      banner.style.display = "block";
    }
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Đang xử lý...";
  }
  if (banner) banner.style.display = "none";

  try {
    const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_id: sid })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Không thể yêu cầu đặt lại mật khẩu.");

    forgotPasswordSID = sid;
    const step1 = document.getElementById("form-forgot-step1");
    const step2 = document.getElementById("form-forgot-step2");
    if (step1) step1.style.display = "none";
    if (step2) step2.style.display = "block";

    notifyInfo("Khôi phục tài khoản", data.message || "Liên hệ ban tổ chức để nhận mã xác minh danh tính.");
  } catch (err) {
    if (banner) {
      banner.textContent = err.message;
      banner.style.display = "block";
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Tiếp tục";
    }
  }
}

async function handleForgotStep2(event) {
  if (event) event.preventDefault();
  const tokenInp = document.getElementById("forgot-token");
  const passInp = document.getElementById("forgot-new-password");
  const banner = document.getElementById("forgot-alert-banner");
  const btn = document.getElementById("btn-forgot-step2-submit");

  const token = (tokenInp?.value || "").trim();
  const newPass = (passInp?.value || "").trim();

  if (!token || !newPass) {
    if (banner) {
      banner.textContent = "Vui lòng nhập mã xác thực và mật khẩu mới.";
      banner.style.display = "block";
    }
    return;
  }

  if (newPass.length < 6) {
    if (banner) {
      banner.textContent = "Mật khẩu mới phải có tối thiểu 6 ký tự.";
      banner.style.display = "block";
    }
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Đang đổi mật khẩu...";
  }

  try {
    const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: forgotPasswordSID,
        reset_token: token,
        new_password: newPass
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Không thể đặt lại mật khẩu.");

    notifySuccess("Thành công", data.message || "Đặt lại mật khẩu thành công!");
    closeForgotPasswordPage();
    showLoginPage();

    const loginUser = document.getElementById("inp-login-user");
    const loginPass = document.getElementById("inp-login-pass");
    if (loginUser) loginUser.value = forgotPasswordSID;
    if (loginPass) {
      loginPass.value = newPass;
      loginPass.focus();
    }
  } catch (err) {
    if (banner) {
      banner.textContent = err.message;
      banner.style.display = "block";
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Xác nhận & Đổi mật khẩu";
    }
  }
}

async function handleLoginSubmit(event) {
  if (event) event.preventDefault();
  await handleLoginPageSubmit();
}

async function handleLoginPageSubmit() {
  const username = document.getElementById("inp-login-user")?.value.trim() || "";
  const password = document.getElementById("inp-login-pass")?.value || "";
  const isAdminLogin = username.toLowerCase() === "admin";
  const error = document.getElementById("login-error-msg");
  const button = document.getElementById("btn-login-submit");
  const btnText = document.getElementById("btn-login-text");

  if (!username || !password) {
    if (error) {
      error.textContent = "Vui lòng nhập tài khoản và mật khẩu.";
      error.style.display = "block";
    }
    return;
  }

  if (button) {
    button.disabled = true;
    if (btnText) btnText.textContent = "Đang xác thực...";
  }
  if (error) error.style.display = "none";

  try {
    const loginURL = isAdminLogin
      ? `${API_BASE}/api/admin/login`
      : `${API_BASE}/api/teams/login`;
    const response = await fetch(loginURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

    // Tải thông báo mới cho tài khoản vừa đăng nhập
    if (typeof fetchNotifications === "function") {
      fetchNotifications();
    }

    if (isAdminLogin) {
      pendingLoginMatchId = null;
      switchToTab("tab-admin-console");
      return;
    }

    if (!data.tournament_id) {
      resetSelectedMatch();
      pendingLoginMatchId = null;
      switchToTab('tab-bracket');
      notifySuccess('Đăng nhập thành công', 'Chọn giải và trận của đội trong Bảng đấu.');
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
    notifySuccess("Đăng nhập thành công", `Chào mừng đội ${currentTeamName}!`);
    pendingLoginMatchId = null;
  } catch (err) {
    if (error) {
      error.textContent = err.message;
      error.style.display = "block";
    }
  } finally {
    if (button) {
      button.disabled = false;
      if (btnText) btnText.textContent = "Đăng nhập";
    }
  }
}

function setupLoginPageHandlers() {
  const btnSubmit = document.getElementById("btn-login-submit");
  const btnBackHome = document.getElementById("btn-login-back-home");
  const passInp = document.getElementById("inp-login-pass");
  const userInp = document.getElementById("inp-login-user");

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
}

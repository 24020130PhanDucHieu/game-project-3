// =============================================================================
// HỆ THỐNG XÁC THỰC VAI TRÒ & PHÂN QUYỀN (ROLE-BASED ACCESS CONTROL)
// =============================================================================
function updateRoleUI() {
  if (typeof renderPortalShell === 'function') renderPortalShell();
  const profileNav = document.getElementById('nav-btn-profile');
  if (profileNav) profileNav.style.display=currentAppRole==='TEAM' ? 'flex' : 'none';
  renderTeamProfile();
  if (currentAppRole!=='TEAM' && document.getElementById('tab-profile')?.classList.contains('active')) switchToTab('tab-overview');
  renderMatchRule();
  if (currentAppRole === 'GUEST') {
    if (typeof qualifierDraftKeyLoaded !== 'undefined') qualifierDraftKeyLoaded = '';
    const code = document.getElementById('qualifier-code');
    if (code) { code.value = ''; code.readOnly = true; }
    document.getElementById('qualifier-my-history')?.replaceChildren();
    document.getElementById('qualifier-my-results')?.replaceChildren();
  }
  if (currentAppRole !== 'ADMIN') {
    document.getElementById('qualifier-submission-dialog')?.close();
    document.getElementById('qualifier-submission-code')?.replaceChildren();
    document.getElementById('qualifier-submission-meta')?.replaceChildren();
    document.getElementById('qualifier-submission-select')?.replaceChildren();
    registeredAccounts = [];
    enrollingAccount = null;
    document.getElementById('tbody-team-credentials')?.replaceChildren();
    document.getElementById('dialog-enroll-account')?.close();
  }
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
    if (authAvatar) authAvatar.innerHTML = arenaIcon("shield");
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
    if (authAvatar) authAvatar.innerHTML = arenaIcon("swords");
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
    if (authAvatar) { authAvatar.innerHTML = arenaIcon("bot"); authAvatar.title = initials; }
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
    authBtn.onclick = () => showLoginPage(currentActiveMatchId);
  }
  if (btnLogout) {
    btnLogout.onclick = handleUserLogout;
  }

  sessionStorage.setItem("userRole", currentUserRole);
  sessionStorage.setItem("ARENA_USER_ROLE", currentAppRole);
  localStorage.setItem("ARENA_USER_ROLE", currentAppRole);
  if (currentAppRole === "GUEST") {
    localStorage.removeItem("ARENA_STUDENT_ID");
    localStorage.removeItem("ARENA_TEAM_NAME");
  } else {
    localStorage.setItem("ARENA_STUDENT_ID", currentTeamStudentId);
    localStorage.setItem("ARENA_TEAM_NAME", currentTeamName);
    sessionStorage.setItem("ARENA_STUDENT_ID", currentTeamStudentId);
    sessionStorage.setItem("ARENA_TEAM_NAME", currentTeamName);
  }

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
  saveStudioDraft();
  fetch(`${API_BASE}/api/logout`, { method: "POST" }).catch(() => {});
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
  sessionStorage.removeItem("arenaSessionToken");
  localStorage.removeItem("arenaSessionToken");
  clearArenaCookie("arena_user_role");
  clearArenaCookie("arena_student_id");
  clearArenaCookie("arena_team_name");
  updateRoleUI();
  switchToTab("tab-overview");
  notifyInfo("Đã Đăng Xuất", "Bạn đã quay lại chế độ Khách xem Tổng quan.");
}

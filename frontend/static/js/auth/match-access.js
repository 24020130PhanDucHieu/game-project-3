// =============================================================================
// 7.1. ĐĂNG NHẬP VÀO VÁN ĐẤU (CHỈ 2 TRƯỜNG: TÀI KHOẢN & MẬT KHẨU)
// =============================================================================
async function handleMatchCardClick(matchId) {
  if (!currentTournamentData || !currentTournamentData.matches[matchId]) return;
  const match = currentTournamentData.matches[matchId];

  // Nếu trận đấu chưa có đội nào được sắp (do chưa bấm Tự Sắp Xếp Lịch)
  if (!match.team_a && !match.team_b) {
    const shouldOpen = confirm(
      `Trận đấu "${match.title}" chưa có đội nào được ghép cặp.

Bạn cần mở mục "Đội Thi Đấu" và bấm "Tự Sắp Xếp Lịch Đấu" để xếp các đội vào sơ đồ.

Bạn có muốn mở bảng Quản Lý Đội ngay không?`
    );
    if (shouldOpen) {
      openTeamManagerModal();
    }
    return;
  }

  if (currentAppRole === "TEAM" && !isTeamInMatch(match, currentTeamStudentId, currentTeamName)) {
    notifyWarning("Trận không thuộc đội", "Chỉ mở được trận có đội của bạn trong nhánh đấu.");
    return;
  }

  if (currentAppRole === "TEAM") {
    try {
      const response = await fetch(`${API_BASE}/api/tournaments/${encodeURIComponent(currentTournamentId)}/matches/${encodeURIComponent(matchId)}/select`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Không thể chọn trận đấu này.");
      saveArenaSessionToken(result.session_token);
      currentTeamName = result.team_name || currentTeamName;
      updateRoleUI();
      currentStudioSide = result.side || null;
      if (currentStudioSide) {
        sessionStorage.setItem("studioSide", currentStudioSide);
        localStorage.setItem("studioSide", currentStudioSide);
      }
      await loadActiveTournament(currentTournamentId);
    } catch (error) {
      notifyError("Không thể chọn trận", error.message || "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.");
      return;
    }
  }

  // Khán giả và mọi vai trò đều có thể xem trực tiếp trận đấu trong Match Arena
  currentActiveMatchId = matchId;
  sessionStorage.setItem("activeMatchId", matchId);
  localStorage.setItem("activeMatchId", matchId);
  sessionStorage.setItem("matchExplicitlySelected", "true");
  localStorage.setItem("matchExplicitlySelected", "true");
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
    guideTeams.textContent = `Đội Đỏ: ${nameA} | Đội Xanh: ${nameB}. Tài khoản là MSSV/SBD, mật khẩu là k69 ghép với MSSV/SBD.`;
  }

  modal.style.display = "flex";
  if (userInp) userInp.focus();
}

function closeMatchLoginModal() {
  const modal = document.getElementById("modal-match-login");
  if (modal) modal.style.display = "none";
  pendingLoginMatchId = null;
  adminLoginMode = false;
}

async function handleUnifiedLogin() {
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
    const loginURL = adminLoginMode
      ? `${API_BASE}/api/admin/login`
      : `${API_BASE}/api/teams/login`;
    const res = await fetch(loginURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: username,
        password: password,
        tournament_id: currentTournamentId || ""
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
    saveArenaSessionToken(data.session_token);
    if (adminLoginMode) {
      currentUserRole = "ADMIN";
      currentAppRole = "ADMIN";
      currentTeamStudentId = "ADMIN";
      currentTeamName = "Ban Tổ Chức";
      sessionStorage.setItem("userRole", "ADMIN");
      sessionStorage.setItem("ARENA_USER_ROLE", "ADMIN");
      sessionStorage.setItem("ARENA_STUDENT_ID", "ADMIN");
      sessionStorage.setItem("ARENA_TEAM_NAME", currentTeamName);
      closeMatchLoginModal();
      updateRoleUI();
      if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.textContent = "Đăng nhập"; }
      await loadTournamentsList();
      switchToTab("tab-admin-console");
      return;
    }
    const matchId = data.match_id;
    currentTournamentId = data.tournament_id;
    currentUserRole = data.role; // "ADMIN", "TEAM_A", "TEAM_B"
    currentAppRole = data.role === "ADMIN" ? "ADMIN" : "TEAM";
    currentTeamName = data.team?.team_name || username;
    currentTeamStudentId = data.team?.student_id || username;
    currentActiveMatchId = matchId;

    sessionStorage.setItem("userRole", data.role);
    sessionStorage.setItem("ARENA_USER_ROLE", currentAppRole);
    sessionStorage.setItem("ARENA_TEAM_NAME", currentTeamName);
    sessionStorage.setItem("ARENA_STUDENT_ID", currentTeamStudentId);
    sessionStorage.setItem("activeTournamentId", currentTournamentId);
    localStorage.setItem("activeTournamentId", currentTournamentId);
    sessionStorage.setItem("activeMatchId", matchId);
    localStorage.setItem("activeMatchId", matchId);
    sessionStorage.setItem("matchExplicitlySelected", "false");
    localStorage.setItem("matchExplicitlySelected", "false");
    updateRoleUI();

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
      currentStudioSide = data.side || null;
      await loadActiveTournament(currentTournamentId);
      currentActiveMatchId = matchId;
      switchToTab("tab-bracket");
      notifySuccess("Đăng nhập thành công", "Đã tự tìm giải đấu và trận của đội. Chọn trận trên bảng đấu để mở tab Trận đấu.");
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

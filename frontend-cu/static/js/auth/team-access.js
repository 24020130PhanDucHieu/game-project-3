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
  if (preferredRole === "ADMIN") {
    openAdminLoginModal();
    return;
  }
  const modal = document.getElementById("modal-auth-role");
  if (!modal) {
    if (currentActiveMatchId && currentTournamentData?.matches?.[currentActiveMatchId]) {
      openMatchLoginModal(currentActiveMatchId);
    } else {
      showLoginPage();
      notifyInfo("Đăng nhập đội", "Dùng mã sinh viên và mật khẩu đã đăng ký. Sau khi đăng nhập, hãy chọn trận của đội trên bảng đấu.");
    }
    return;
  }

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

function openAdminLoginModal() {
  adminLoginMode = true;
  pendingLoginMatchId = null;
  const modal = document.getElementById("modal-match-login");
  const title = document.getElementById("login-modal-match-title");
  const username = document.getElementById("inp-match-login-user");
  const password = document.getElementById("inp-match-login-pass");
  const guide = document.getElementById("login-guide-teams-info");
  const alert = document.getElementById("login-feedback-alert");
  if (!modal) return;
  if (title) title.textContent = "Đăng nhập Ban Tổ Chức";
  if (username) { username.value = "admin"; username.placeholder = "Tài khoản Ban Tổ Chức"; }
  if (password) { password.value = ""; password.placeholder = "Mật khẩu Ban Tổ Chức"; }
  if (guide) guide.textContent = "Nhập mật khẩu ADMIN_PASSWORD đã cấu hình trên máy chủ.";
  if (alert) { alert.textContent = ""; alert.style.display = "none"; }
  modal.style.display = "flex";
  if (password) password.focus();
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

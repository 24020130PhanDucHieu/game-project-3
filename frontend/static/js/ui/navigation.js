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
    btnSidebarAuth.addEventListener("click", () => showLoginPage(currentActiveMatchId));
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
    return (mySid && tSid === mySid) ||
           (myName && tName === myName);
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

    // Ưu tiên cao nhất: Trận đấu CHƯA KẾT THÚC mà đội đang tham gia (đặc biệt khi vừa thắng và nhảy lên Tứ Kết/Bán Kết)
    const activeMatch = matches.find(m => isTeamInMatch(m, mySID, myName) && m.status !== "COMPLETED");
    if (activeMatch) return activeMatch;

    // Nếu tất cả trận của đội đã kết thúc, hiển thị trận gần nhất (vòng cao nhất đã tham gia)
    const myMatches = matches.filter(m => isTeamInMatch(m, mySID, myName));
    if (myMatches.length > 0) return myMatches[myMatches.length - 1];
  }

  // 2. Nếu currentActiveMatchId đang trỏ tới trận hợp lệ: GIỮ NGUYÊN (cho phép Admin truy cập và quản lý bất kỳ trận nào)
  if (currentActiveMatchId && tournament.matches[currentActiveMatchId]) {
    return tournament.matches[currentActiveMatchId];
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

function switchToTab(tabId, { skipMatchOpen = false } = {}) {
  if (tabId==='tab-profile' && currentAppRole!=='TEAM') tabId='tab-overview';
  if (tabId==='tab-profile') renderTeamProfile();
  saveTabScroll();
  clearInterval(inlinePlaybackTimer); inlinePlaybackTimer = null;
  clearInterval(replayPlayInterval); replayPlayInterval = null;
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
  if (tabId === "tab-match-arena") {
    const hasExplicitMatch = sessionStorage.getItem("matchExplicitlySelected") === "true";
    const activeMatch = currentActiveMatchId && currentTournamentData?.matches
      ? currentTournamentData.matches[currentActiveMatchId]
      : null;
    if (!hasExplicitMatch || !activeMatch) {
      notifyWarning("Chưa chọn trận đấu", "Vào Bảng đấu, chọn đúng giải rồi bấm vào một trận trước khi mở tab Trận đấu.");
      if (document.querySelector('.tab-pane.active')?.id !== "tab-bracket") switchToTab("tab-bracket");
      return;
    }
    if (currentAppRole === "TEAM" && !isTeamInMatch(activeMatch, currentTeamStudentId, currentTeamName)) {
      sessionStorage.setItem("matchExplicitlySelected", "false");
      localStorage.setItem("matchExplicitlySelected", "false");
      notifyWarning("Trận không thuộc đội", "Chọn trận có tên đội của bạn trên nhánh đấu trước khi vào tab Trận đấu.");
      switchToTab("tab-bracket");
      return;
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
  requestAnimationFrame(() => window.scrollTo(0, Number(sessionStorage.getItem(tabScrollKey(tabId)) || 0)));

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
  } else if (tabId === "tab-match-arena" && !skipMatchOpen) {
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
  } else if (tabId === "tab-admin-console") {
    renderTeamCredentialsTable();
  } else if (tabId === "tab-qualifier") {
    loadQualifierPage();
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

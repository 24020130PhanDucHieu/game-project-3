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
  if (!match) {
    notifyWarning("Không tìm thấy trận", "Trận này chưa có trong dữ liệu giải đấu. Hãy tải lại giải hoặc xếp lịch trận trước.");
    return;
  }

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
  localStorage.setItem("activeMatchId", matchId);
  connectActiveMatchSocket(matchId);

  // Chuyển sang Tab 3: Match Arena
  switchToTab("tab-match-arena", { skipMatchOpen: true });

  renderMatchRoomData(match);
}

function renderMatchRoomData(match) {
  renderMatchRule();
  if (!match) return;
  currentMatchData = match;

  // Tiêu đề phòng đấu
  const titleEl = document.getElementById("match-room-title");
  if (titleEl) titleEl.textContent = match.title ? match.title.toUpperCase() : "TRẬN ĐẤU";

  const stageBadge = document.getElementById("match-room-stage-badge");
  if (stageBadge) stageBadge.textContent = `${match.round_name || 'Vòng Đấu'} • Bo5`;

  const statusBadge = document.getElementById("match-room-status-badge");
  if (statusBadge) {
    const isCompleted = match.status === "COMPLETED";
    statusBadge.textContent = isCompleted ? "Đã kết thúc" : "Đang diễn ra";
    statusBadge.className = isCompleted ? "status-pill-gray" : "status-pill-green";
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
    if (roundBannerText) roundBannerText.textContent = `ROUND ${match.current_round_idx || 1} / ${match.max_rounds || 5}`;
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
  restoreMatchViewState();
  syncLiveRoundBoard(match);
}

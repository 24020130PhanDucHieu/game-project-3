function renderVisualBattleArena(match) {
  if (!match) return;
  const teamA = match.team_a;
  const teamB = match.team_b;
  const configuredRule = currentTournamentData?.stage_rules?.[match.round_level];
  const previewRule = configuredRule?.rule_id || currentTournamentData?.stage_rule || "STAGE_1_STANDARD";

  // PHÂN QUYỀN GIAO DIỆN PHÒNG ĐẤU:
  // Nếu là ADMIN: Bỏ bảng phát lại ở trên (vì bên dưới đã có Replay), phóng to bàn đấu Realtime toàn màn hình
  const studioCol = document.getElementById("arena-studio-col");
  const adminRealtimeCol = document.getElementById("arena-admin-realtime-col");
  const boardCol = document.querySelector(".arena-board-column");
  const layoutContainer = document.querySelector(".match-arena-2col-layout");
  const boardTitleLabel = document.getElementById("board-card-title-label");
  const playbackBar = document.getElementById('match-playback-bar');
  if (playbackBar) playbackBar.style.display = currentAppRole === 'TEAM' ? 'none' : '';

  const lastRound = match.rounds_history?.[match.rounds_history.length - 1];
  const mysteryTiles = lastRound?.mystery_tiles || match.mystery_tiles || match.rules?.mystery_tiles;

  if (currentAppRole === "ADMIN") {
    if (studioCol) studioCol.style.display = "none";
    if (boardCol) boardCol.style.display = "none";
    if (adminRealtimeCol) adminRealtimeCol.style.display = "block";
    if (layoutContainer) layoutContainer.classList.add("admin-realtime-single-mode");

    const rtBoard = document.getElementById("realtime-chessboard-9x9");
    if (rtBoard) {
      if (rtBoard.children.length !== 81) {
        initRealtimeChessboardGrid(mysteryTiles);
      } else if (mysteryTiles) {
        applyMysteryTiles(rtBoard, mysteryTiles);
      }
    }

    if (!isMatchRunning) {
      if (typeof realtimePlaybackTimer !== "undefined" && realtimePlaybackTimer !== null) {
        // Đang tự động chạy hoạt ảnh nước đi cờ, không ghi đè bàn cờ
      } else {
        const steps = lastRound?.board_steps || [];
        const initPieces = getInitialBoardPieces(previewRule);
        if (steps.length > 0) {
          const curIdx = typeof realtimePlaybackIdx !== "undefined" && realtimePlaybackIdx < steps.length ? realtimePlaybackIdx : (steps.length - 1);
          const currentStep = steps[curIdx];
          renderRealtimeChessboard(currentStep?.red_pieces || initPieces.red, currentStep?.blue_pieces || initPieces.blue, currentStep?.clash_event, mysteryTiles);
          const slider = document.getElementById("realtime-step-slider");
          if (slider) {
            slider.max = steps.length - 1;
            slider.value = curIdx;
          }
          const label = document.getElementById("realtime-timeline-step-label");
          if (label) label.textContent = `Bước ${curIdx + 1} / ${steps.length}`;
        } else {
          renderRealtimeChessboard(initPieces.red, initPieces.blue, null, mysteryTiles);
        }
      }
    }
  } else {
    if (studioCol) studioCol.style.display = "block";
    if (boardCol) boardCol.style.display = "block";
    if (adminRealtimeCol) adminRealtimeCol.style.display = "none";
    if (layoutContainer) layoutContainer.classList.remove("admin-realtime-single-mode");
    if (boardTitleLabel) boardTitleLabel.textContent = "BÀN ĐẤU LIVE · 9×9";
    const boardEl = document.getElementById("chessboard-9x9");
    if (boardEl && mysteryTiles) {
      applyMysteryTiles(boardEl, mysteryTiles);
    }
  }

  // Round indicator
  const roundEl = document.getElementById("arena-round-indicator");
  if (roundEl) {
    roundEl.textContent = match.status === "COMPLETED" ? "CHUNG CUỘC" : `ROUND ${match.current_round_idx || 1} / ${match.max_rounds || 5}`;
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

  const lastR = currentAppRole === 'TEAM' ? match.rounds_history?.at(-1) : inlineReplayRecord(match);
  if (!isMatchRunning && lastR?.board_steps?.length) {
    const state = readArenaViewState();
    const liveProgress = match.round_status === 'ROUND_FINISHED' ? Math.max(0,Math.min(1,(Date.now()/1000-(match.intermission_ends_at-5))/5)) : 1;
    if (liveProgress === 1 && typeof liveRoundTimer !== "undefined" && liveRoundTimer) {
      clearInterval(liveRoundTimer);
      liveRoundTimer = null;
    }
    inlinePlaybackCurrentIdx = currentAppRole === 'TEAM' ? Math.min(lastR.board_steps.length-1,Math.floor(liveProgress*lastR.board_steps.length)) : state.inlineRound === lastR.round_number ? Math.min(state.inlineStep ?? lastR.board_steps.length - 1, lastR.board_steps.length - 1) : lastR.board_steps.length - 1;
    const step = lastR.board_steps[inlinePlaybackCurrentIdx];
    const tiles = step.mystery_tiles || lastR.mystery_tiles || match.mystery_tiles;
    renderChessboard(step.red_pieces, step.blue_pieces, step.clash_event, tiles);
    const indicator = document.getElementById("playback-step-indicator");
    if (indicator) indicator.textContent = `Hiệp ${lastR.round_number}: Bước ${inlinePlaybackCurrentIdx + 1} / ${lastR.board_steps.length}`;
  } else if (!isMatchRunning) {
    const pieces = getInitialBoardPieces(previewRule);
    const previewTiles = match?.mystery_tiles || lastR?.mystery_tiles || null;
    renderChessboard(pieces.red, pieces.blue, null, previewTiles);
    inlinePlaybackCurrentIdx = 0;
    const indicator = document.getElementById("playback-step-indicator");
    if (indicator) indicator.textContent = "Chưa có dữ liệu phát lại";
  }

  // Dòng bình luận (Commentary ticker)
  const ticker = document.getElementById("arena-commentary-ticker") || document.getElementById("live-commentary-ticker");
  if (ticker) {
    if (match.status === "COMPLETED") {
      setBattleCommentary(ticker, `Trận đấu đã hoàn tất! Đội thắng: ${match.winner_name || '---'}.`);
    } else if (lastR) {
      const selectedStep = lastR.board_steps?.[inlinePlaybackCurrentIdx];
      setBattleCommentary(ticker, selectedStep?.log || lastR.win_reason || lastR.log);
    } else {
      setBattleCommentary(ticker, `Hiệp ${match.current_round_idx || 1}: chờ hai đội nộp bot và Ban tổ chức bắt đầu.${/^COMBO_[1357]$/.test(previewRule) ? ' ↻ Quân của bạn sẽ được xếp ngẫu nhiên khi bắt đầu hiệp.' : ''}`);
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
      const allReady = Boolean(match.all_teams_ready || (teamA?.code_valid && teamB?.code_valid));
      const blocked = stageBlockReason(match);
      btnAdminStart.disabled = Boolean(blocked) || !allReady || match.status === "COMPLETED" || match.round_status === "ROUND_FINISHED" || match.battle_running || isMatchRunning;
      btnAdminStart.title = blocked;
      if (allReady) {
        btnAdminStart.textContent = `Bắt Đầu Hiệp ${match.current_round_idx || 1}`;
        btnAdminStart.className = "btn btn-green admin-only";
      } else {
        btnAdminStart.textContent = `Bắt Đầu Hiệp ${match.current_round_idx || 1} (Chờ/Nạp Bot)`;
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
  if (intermissionBanner) {
    intermissionBanner.style.display = match.round_status === "ROUND_FINISHED" ? "flex" : "none";
    const countdown = document.getElementById("countdown-num");
    if (countdown) countdown.textContent = Math.max(0, Math.ceil((match.intermission_ends_at || 0) - Date.now() / 1000));
  }
}

function renderRoundStepPills(currentIdx, history, isFinished) {
  const container = document.getElementById("round-step-pills");
  if (!container) return;
  container.innerHTML = "";

  const maxR = currentMatchData?.max_rounds || 5;
  for (let r = 1; r <= maxR; r++) {
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
    if (roundRec) pill.addEventListener("click", () => {
      if (currentAppRole === 'TEAM') { openReplayModal(currentActiveMatchId,r); return; }
      clearInterval(inlinePlaybackTimer); inlinePlaybackTimer = null; saveArenaViewState({ inlineRound: r, inlineStep: 0 }); renderVisualBattleArena(currentMatchData);
    });
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
  if (metaEl) metaEl.textContent = `MSSV: ${team.student_id} • ${team.university || 'BOT K69'}`;
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
        btnOpen.textContent = ` Nộp Bot (${team.team_name})`;
        btnOpen.classList.add("btn-primary");
        btnOpen.classList.remove("btn-outline");
      } else {
        btnOpen.textContent = ` Khán Giả (${team.team_name})`;
        btnOpen.classList.remove("btn-primary");
        btnOpen.classList.add("btn-outline");
      }
    } else {
      btnOpen.textContent = ` Đăng Nhập Để Nộp Bot`;
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

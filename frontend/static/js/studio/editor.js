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
  renderMatchRule();
  const editor = document.getElementById("studio-code-editor"), selLang = document.getElementById("studio-sel-lang"), statusTag = document.getElementById("studio-submission-status");
  const key = studioDraftKey();
  if (editor && currentEditorKey !== key) {
    let draft = null; try { draft = JSON.parse(localStorage.getItem(key) || "null"); } catch {}
    if (selLang) selLang.value = draft?.language || team.draft_lang || team.current_lang || "PYTHON";
    editor.value = draft?.code ?? team.draft_code ?? team.current_code ?? (selLang?.value === "CPP" ? DEFAULT_CPP_CODE : DEFAULT_PYTHON_CODE);
    editor.scrollTop = draft?.scroll || 0;
    if (draft) editor.setSelectionRange(draft.selectionStart || 0, draft.selectionEnd || 0);
    currentEditorKey = key;
    const note = document.getElementById('studio-rule-note');
    if (note) note.value = draft?.explanation || '';
  }
  const round = currentMatchData?.current_round_idx || 1, maxR = currentMatchData?.max_rounds || 5;
  if (statusTag) {
    statusTag.textContent = team.code_submitted ? (team.code_valid ? `Đã nộp mã lệnh cho Round ${round} (Sẵn sàng)` : `Mã lỗi cho Round ${round} — hãy sửa và nộp lại`) : `Chưa nộp mã cho Round ${round}`;
    statusTag.className = team.code_submitted && team.code_valid ? "ide-status-tag submitted" : "ide-status-tag";
  }
  updateStudioSubmitBtnText(round);
  const title = document.getElementById("studio-round-target-title");
  if (title) title.textContent = `Phòng nộp code bot (Round ${round}/${maxR})`;
}

function setupStudioControls() {
  const editor = document.getElementById("studio-code-editor"), language = document.getElementById("studio-sel-lang"), submit = document.getElementById("btn-studio-submit-bot");
  if (!editor || !language || !submit) return;
  let draftTimer = null;
  document.getElementById('studio-rule-note')?.addEventListener('input', saveStudioDraft);
  editor.addEventListener("input", () => {
    saveStudioDraft(); clearTimeout(draftTimer);
    if (!currentTournamentId || !currentActiveMatchId || !currentStudioSide || !["TEAM","ADMIN"].includes(currentAppRole)) return;
    const tournamentId = currentTournamentId, matchId = currentActiveMatchId;
    const payload = { side: currentStudioSide, code_content: editor.value, language: language.value, round_number: currentMatchData?.current_round_idx };
    draftTimer = setTimeout(async () => {
      if (currentTournamentId !== tournamentId || currentActiveMatchId !== matchId) return;
      try { await fetch(`${API_BASE}/api/tournaments/${tournamentId}/matches/${matchId}/draft-code`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) }); } catch {}
    },300);
  });
  editor.addEventListener("scroll", saveStudioDraft, { passive:true });
  language.addEventListener("change", () => {
    if (!editor.value.trim() || [DEFAULT_PYTHON_CODE,DEFAULT_CPP_CODE].includes(editor.value)) editor.value = language.value === "CPP" ? DEFAULT_CPP_CODE : DEFAULT_PYTHON_CODE;
    editor.dispatchEvent(new Event("input"));
  });
  document.getElementById("btn-studio-load-template")?.addEventListener("click", () => {
    editor.value = language.value === "CPP" ? DEFAULT_CPP_CODE : DEFAULT_PYTHON_CODE;
    editor.dispatchEvent(new Event("input"));
    notifyInfo("Nạp mẫu code", `Đã nạp mẫu ${language.value}.`);
  });
  const dryrun = document.getElementById("btn-studio-dryrun");
  dryrun?.addEventListener("click", async () => {
    if (!editor.value.trim()) { notifyWarning("Chưa có mã", "Hãy viết mã bot trước khi kiểm tra."); return; }
    dryrun.disabled = true;
    const dryrunLabel = dryrun.querySelector("span");
    if (dryrunLabel) dryrunLabel.textContent = "Đang kiểm tra…";
    dryrun.setAttribute("aria-busy", "true");
    try {
      const match = currentTournamentData?.matches?.[currentActiveMatchId];
      const configured = currentTournamentData?.stage_rules?.[match?.round_level];
      if (configured?.hidden || configured?.publish_at > Date.now()/1000) throw new Error('Chờ công bố luật vòng đấu.');
      const response = await fetch(`${API_BASE}/api/bots/validate`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({code_content:editor.value,language:language.value,rule_id:configured?.rule_id || currentTournamentData?.stage_rule || 'STAGE_1_STANDARD'}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Không kiểm tra được mã.");
      if (result.is_valid) notifySuccess("Mã hợp lệ", `Sandbox đã thực thi bot (${result.execution_time_ms || 0}ms).`);
      else notifyWarning("Mã không hợp lệ", result.error_message || "Bot không trả về nước đi hợp lệ.");
    } catch (error) { notifyError("Không kiểm tra được mã",error.message); }
    finally {
      dryrun.disabled = false;
      dryrun.removeAttribute("aria-busy");
      if (dryrunLabel) dryrunLabel.textContent = "Kiểm tra";
    }
  });
  submit.addEventListener("click", async () => {
    if (!["TEAM","ADMIN"].includes(currentAppRole)) { showLoginPage(); return; }
    if (!currentActiveMatchId || sessionStorage.getItem("matchExplicitlySelected") !== "true") { notifyWarning("Chưa chọn trận","Hãy chọn trận trên bảng đấu trước khi nộp bot."); return; }
    const tournamentId=currentTournamentId, matchId=currentActiveMatchId, match=currentTournamentData?.matches?.[currentActiveMatchId], side=currentStudioSide;
    if (!match?.[side]) { notifyWarning("Chưa có đội", "Hãy chọn trận của đội bạn."); return; }
    const code=editor.value.trim(), round=match.current_round_idx || 1;
    if (!code) { notifyWarning("Thiếu mã lệnh", "Hãy viết mã bot trước khi nộp."); return; }
    saveStudioDraft(); submit.disabled=true;
    const label=document.getElementById("btn-submit-bot-text"); if (label) label.textContent="Đang nộp...";
    try {
      const response=await fetch(`${API_BASE}/api/tournaments/${tournamentId}/matches/${matchId}/code`, { method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({side,code_content:code,language:language.value,round_number:round,explanation:document.getElementById('studio-rule-note')?.value || ''}) });
      const result=await response.json();
      if (!response.ok) throw new Error(result.detail || "Không nộp được mã.");
      if (result.is_valid) notifySuccess(`Nộp bot Round ${round} thành công`,"Đội đã sẵn sàng.");
      else notifyWarning("Code không hợp lệ",result.validation?.error_message || "Hãy sửa mã và nộp lại.");
      if (currentTournamentId===tournamentId && currentActiveMatchId===matchId) { await loadActiveTournament(tournamentId); loadMatchSubmissions(matchId); }
      broadcastCrossTabSync("CODE_SUBMITTED");
    } catch (error) { notifyError("Lỗi nộp mã lệnh",error.message); }
    finally { submit.disabled=false; updateStudioSubmitBtnText(currentMatchData?.current_round_idx || round); }
  });
  document.getElementById("btn-studio-back-to-room")?.addEventListener("click", () => switchToTab("tab-match-arena"));
  document.getElementById("btn-studio-test-practice")?.addEventListener("click", handlePracticeMatch);
}

function returnToMatchRoom() {
  switchToTab("match-arena-tab");
  if (currentTournamentData && currentActiveMatchId) {
    renderMatchRoomData(currentTournamentData.matches[currentActiveMatchId]);
  }
}


function openPrivateStudioDirect(side) {
  if (!currentTournamentData || !currentActiveMatchId) return;
  const match = currentTournamentData.matches[currentActiveMatchId];
  const team = match ? match[side] : null;
  if (!team) return;

  currentStudioSide = side;
  connectActiveMatchSocket(currentActiveMatchId);

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

  document.getElementById("studio-auth-card").style.display = "none";
  document.getElementById("studio-ide-card").style.display = "flex";
  populateStudioEditor(team);
}

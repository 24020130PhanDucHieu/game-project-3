function setupMatchRoomControls() {
  // Trọng tài bấm Bắt đầu thi đấu (Solo từng round một)
  const btnRefereeStart = document.getElementById("btn-referee-start");
  if (btnRefereeStart) {
    btnRefereeStart.addEventListener("click", handleRefereeStartBattle);
  }

  // Nút bắt đầu hiệp của Quản trị viên (Desktop header Match Room)
  const btnArenaStart = document.getElementById("btn-arena-start-match");
  if (btnArenaStart) {
    btnArenaStart.addEventListener("click", handleRefereeStartBattle);
  }

  // Nút quay lại bảng đấu
  const btnMatchBackBracket = document.getElementById("btn-match-back-bracket");
  if (btnMatchBackBracket) {
    btnMatchBackBracket.addEventListener("click", () => {
      switchToTab("tab-bracket");
    });
  }

  // Nút Tham gia trận đấu / Nộp bài cho đội (Header Match Room)
  const btnJoinAction = document.getElementById("btn-match-join-action");
  if (btnJoinAction) {
    btnJoinAction.addEventListener("click", () => {
      if (currentAppRole === "GUEST") {
        notifyInfo("Tham Gia Trận Đấu", "Vui lòng đăng nhập để nộp bài bot cho trận đấu.");
        showLoginPage(currentActiveMatchId);
      } else {
        const editor = document.getElementById("studio-code-editor");
        if (editor) {
          editor.focus();
          editor.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        notifyInfo("Phòng Nộp Bot", "Bạn đang ở khu vực nộp bài. Hãy soạn thuật toán và nhấn 'Nộp mã lệnh'!");
      }
    });
  }

  // Nạp code mẫu nhanh (cho ban tổ chức test)
  const btnQuickFillDemo = document.getElementById("btn-quick-fill-demo");
  if (btnQuickFillDemo) {
    btnQuickFillDemo.addEventListener("click", handleQuickFillDemo);
  }

  // Đặt lại trận đấu
  const btnReset = document.getElementById("btn-reset-current-match");
  if (btnReset) {
    btnReset.addEventListener("click", handleResetCurrentMatch);
  }

  // Nút quay lại sơ đồ
  const btnBackBracket = document.getElementById("btn-back-to-bracket");
  if (btnBackBracket) {
    btnBackBracket.addEventListener("click", () => {
      switchToBracketView();
    });
  }

  // Điều khiển xem lại từng bước trực tiếp trên bàn cờ 9×9
  setupInlineBoardPlayback();

  // Nút Vào Nộp Bot Đội Đỏ / Đội Xanh
  document.querySelectorAll(".btn-jump-to-studio").forEach(btn => {
    btn.addEventListener("click", () => {
      const side = btn.dataset.side || "team_a";
      openTeamStudio(side);
    });
  });
}


// =============================================================================
// 6. TIẾN TRÌNH THI ĐẤU TỪNG ROUND MỘT (LIVE VISUAL ARENA DUEL ENGINE)
// =============================================================================
async function handleRefereeStartBattle() {
  if (!currentTournamentId || !currentActiveMatchId || isMatchRunning) return;
  if (currentAppRole !== "ADMIN") { notifyWarning("Không đủ quyền", "Chỉ Ban Tổ Chức mới được bắt đầu hiệp."); return; }
  const match=currentTournamentData?.matches?.[currentActiveMatchId];
  if (!match?.team_a?.code_valid || !match?.team_b?.code_valid) { notifyWarning("Chưa sẵn sàng","Cả hai đội phải nộp mã hợp lệ trước khi bắt đầu."); return; }
  const tournamentId=currentTournamentId, matchId=currentActiveMatchId;
  isMatchRunning=true; renderVisualBattleArena(match);
  try {
    const response=await fetch(`${API_BASE}/api/tournaments/${tournamentId}/matches/${matchId}/play-round`,{method:"POST"});
    const result=await response.json();
    if (!response.ok) throw new Error(result.detail || "Không chạy được hiệp đấu.");
    if (currentTournamentId===tournamentId) await loadActiveTournament(tournamentId);
    broadcastCrossTabSync("MATCH_UPDATED");
    notifySuccess(`Hiệp ${result.round_record?.round_number || match.current_round_idx} đã hoàn tất`,result.reason || result.message || "");
  } catch (error) { notifyError("Không chạy được hiệp",error.message); }
  finally { isMatchRunning=false; if (currentTournamentId===tournamentId && currentTournamentData?.matches?.[matchId]) renderMatchRoomData(currentTournamentData.matches[matchId]); }
}

async function handleQuickFillDemo() {
  if (!currentTournamentId || !currentActiveMatchId) return;

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/matches/${currentActiveMatchId}/demo-fill`, {
      method: "POST"
    });
    const data = await res.json();
    if (!res.ok) {
      notifyError("Lỗi Thao Tác", data.detail || "Không thể nạp.");
      return;
    }

    notifyInfo("Thông Báo", data.message || "");
    await loadActiveTournament(currentTournamentId);

  } catch (err) {
    console.error("Lỗi:", err);
  }
}

async function handleResetCurrentMatch() {
  if (!currentTournamentId || !currentActiveMatchId) return;

  if (!confirm("Bạn có chắc chắn muốn đặt lại trận đấu này về 0-0 ban đầu không?")) return;

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/matches/${currentActiveMatchId}/reset`, {
      method: "POST"
    });
    const data = await res.json();
    if (!res.ok) {
      notifyError("Lỗi Thao Tác", data.detail || "Không thể đặt lại.");
      return;
    }

    notifyInfo("Thông Báo", data.message || "");
    await loadActiveTournament(currentTournamentId);
    broadcastCrossTabSync("MATCH_UPDATED");

  } catch (err) {
    console.error("Lỗi:", err);
  }
}

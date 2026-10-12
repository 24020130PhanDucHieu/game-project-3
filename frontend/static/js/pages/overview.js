// RENDER TRANG 1: TỔNG QUAN (MOCKUP 1 REPLICATION)
// =============================================================================
function renderDashboardOverview() {
  const titleEl = document.getElementById("dash-tourn-title");
  const statusEl = document.getElementById("dash-tourn-status");
  const teamsNumEl = document.getElementById("dash-teams-num");
  const progressEl = document.getElementById("dash-progress-status");

  if (currentTournamentData) {
    if (titleEl) titleEl.textContent = currentTournamentData.name || "Giải Đấu Tân Sinh Viên K69";
    if (statusEl) {
      statusEl.textContent = currentTournamentData.champion ? "Đã kết thúc" : "Đang diễn ra";
    }
    if (teamsNumEl) {
      const cnt = currentTournamentData.teams ? currentTournamentData.teams.length : 8;
      teamsNumEl.textContent = `${cnt} Đội`;
    }
    if (progressEl) {
      progressEl.textContent = currentTournamentData.champion ? `Quán quân: ${currentTournamentData.champion}` : "Tứ Kết → Chung Kết";
    }
  }

  // Cập nhật thông tin trận đấu nổi bật
  const teamAEl = document.getElementById("dash-match-team-a");
  const teamBEl = document.getElementById("dash-match-team-b");
  const matchStatEl = document.getElementById("dash-match-status");
  const matchScoreEl = document.getElementById("dash-match-score");
  const matchMetaEl = document.getElementById("dash-match-meta");

  const matches = currentTournamentData?.matches ? Object.values(currentTournamentData.matches) : [];
  const activeMatch = (currentActiveMatchId && currentTournamentData?.matches?.[currentActiveMatchId])
    || matches.find(m => m.status === "RUNNING")
    || matches.find(m => m.status === "IN_PROGRESS")
    || matches.find(m => m.team_a || m.team_b);

  if (activeMatch) {
    const tA = activeMatch.team_a ? activeMatch.team_a.team_name : "Đội Đỏ";
    const tB = activeMatch.team_b ? activeMatch.team_b.team_name : "Đội Xanh";
    if (teamAEl) teamAEl.textContent = tA;
    if (teamBEl) teamBEl.textContent = tB;
    if (matchStatEl) {
      matchStatEl.textContent = activeMatch.status === "COMPLETED" ? "Đã kết thúc" : (activeMatch.battle_running ? "Đang thi đấu" : "Chờ thi đấu");
    }
    if (matchScoreEl) {
      matchScoreEl.textContent = `${activeMatch.team_a?.rounds_won || 0} - ${activeMatch.team_b?.rounds_won || 0}`;
    }
    if (matchMetaEl) {
      matchMetaEl.textContent = `Vòng ${activeMatch.current_round_idx || 1} · Thể thức Bo5`;
    }

    const btnEnter = document.getElementById("btn-dash-enter-match");
    if (btnEnter) {
      btnEnter.onclick = () => {
        switchToTab("tab-bracket");
        notifyInfo("Chọn trận đấu", "Hãy chọn trận trên bảng đấu để mở tab Trận đấu.");
      };
    }
  }

  // Tải danh sách top 5 bảng xếp hạng theo Mockup 1
  if (!activeMatch) { if (teamAEl) teamAEl.textContent="Chưa xếp đội"; if (teamBEl) teamBEl.textContent="Chưa xếp đội"; if (matchScoreEl) matchScoreEl.textContent="0 - 0"; if (matchStatEl) matchStatEl.textContent="Chờ xếp lịch"; }
  loadDashboardTopRanking();
}

async function loadDashboardTopRanking() {
  const tbody=document.getElementById("tbody-dash-top-ranking");
  if (!tbody) return;
  try {
    const response=await fetch(`${API_BASE}/api/ranking`);
    if (!response.ok) throw new Error("Không tải được xếp hạng.");
    const ranks=await response.json();
    const rows=ranks.slice(0,5);
    tbody.innerHTML=rows.length ? rankingRows(rows) : '<tr><td colspan="4">Chưa có dữ liệu xếp hạng.</td></tr>';
  } catch { tbody.innerHTML='<tr><td colspan="4">Không tải được dữ liệu xếp hạng. Hãy thử lại.</td></tr>'; }
}

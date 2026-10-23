// RENDER TRANG 1: TỔNG QUAN (MOCKUP 1 REPLICATION)
// =============================================================================
function renderDashboardOverview() {
  const titleEl = document.getElementById("dash-tourn-title");
  const statusEl = document.getElementById("dash-tourn-status");
  const teamsNumEl = document.getElementById("dash-teams-num");
  const progressEl = document.getElementById("dash-progress-status");

  if (currentTournamentData) {
    const isFinished = Boolean(currentTournamentData.champion || currentTournamentData.status === "FINISHED" || currentTournamentData.status === "COMPLETED");
    if (titleEl) titleEl.textContent = currentTournamentData.name || "Giải Đấu Tân Sinh Viên K69";
    if (statusEl) {
      statusEl.textContent = isFinished ? "Đã kết thúc" : "Đang diễn ra";
      statusEl.className = isFinished ? "stat-value text-gray" : "stat-value text-green";
    }
    const headerPill = document.getElementById("overview-header-status-pill");
    const headerPillText = document.getElementById("overview-header-status-text");
    if (headerPill) {
      headerPill.className = isFinished ? "status-pill-gray" : "status-pill-green";
    }
    if (headerPillText) {
      headerPillText.textContent = isFinished ? "Đã kết thúc" : "Đang diễn ra";
    }
    if (teamsNumEl) {
      const cnt = currentTournamentData.teams ? currentTournamentData.teams.length : 0;
      teamsNumEl.textContent = `${cnt} Đội`;
    }
    if (progressEl) {
      const live = Object.values(currentTournamentData.matches || {}).find(m => m.team_a && m.team_b && m.status !== 'COMPLETED');
      progressEl.textContent = currentTournamentData.champion ? 'Đã kết thúc' : (live?.round_name || 'Chờ xếp lịch');
    }
  }

  const completed = document.getElementById('dash-completed-matches');
  if (completed) completed.textContent = currentTournamentData ? Object.values(currentTournamentData.matches || {}).filter(m => m.status === 'COMPLETED').length : '—';
  if (!currentTournamentData) {
    if (teamsNumEl) teamsNumEl.textContent = '—';
    if (progressEl) progressEl.textContent = '—';
    if (statusEl) statusEl.textContent = 'Chưa chọn giải';
  }
  renderOverviewSchedule();

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

function renderOverviewSchedule() {
  const root = document.getElementById('overview-stage-schedule');
  if (!root) return;
  root.replaceChildren();
  const tournament = currentTournamentData;
  if (!tournament) { root.textContent = 'Chọn giải đấu để xem lịch.'; return; }
  const schedule = tournament.stage_schedule || {};
  const levels = Object.keys(schedule).sort((a,b) => Number(a) - Number(b));
  if (!levels.length) { root.textContent = 'Ban tổ chức chưa đặt giờ mở và đóng các vòng.'; return; }
  const matches = Object.values(tournament.matches || {});
  for (const level of levels) {
    const entry = schedule[level] || {};
    const matching = matches.find(m => Number(m.round_level) === Number(level));
    const label = matching?.round_name || `Vòng ${level}`;
    const start = Number(entry.starts_at || 0), end = Number(entry.ends_at || 0);
    const now = typeof arenaNowSeconds === 'function' ? arenaNowSeconds() : Date.now()/1000;
    const state = start && now < start ? 'Chưa mở' : end && now >= end ? 'Đã đóng' : 'Đang mở';
    const row = document.createElement('div'); row.className = 'overview-schedule-row';
    const name = document.createElement('strong'); name.textContent = label;
    const meta = document.createElement('span'); meta.textContent = [start && `Mở ${new Date(start*1000).toLocaleString('vi-VN')}`, end && `Đóng ${new Date(end*1000).toLocaleString('vi-VN')}`].filter(Boolean).join(' · ') || 'Chưa đặt thời gian';
    const badge = document.createElement('span'); badge.className = `overview-schedule-badge ${state === 'Đang mở' ? 'is-open' : ''}`; badge.textContent = state;
    row.append(name, meta, badge); root.appendChild(row);
  }
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

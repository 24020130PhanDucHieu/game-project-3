// =============================================================================
// 8. TAB 2: XEM TOÀN DIỆN DANH SÁCH CÁC ĐỘI (TEAMS OVERVIEW)
// =============================================================================
async function loadTeamsOverview() {
  if (!currentTournamentId) return;

  const tbody = document.getElementById("tbody-teams-overview");
  tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">Đang tải danh sách các đội...</td></tr>`;

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/teams`);
    const teams = await res.json();
    allTeamsCache = teams;
    renderTeamsOverviewTable(teams);

    const searchInp = document.getElementById("inp-search-teams");
    searchInp.oninput = () => {
      const q = searchInp.value.toLowerCase().trim();
      const filtered = allTeamsCache.filter(t =>
        t.team_name.toLowerCase().includes(q) ||
        t.student_id.toLowerCase().includes(q)
      );
      renderTeamsOverviewTable(filtered);
    };

  } catch (err) {
    console.error("Lỗi tải danh sách đội:", err);
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">Không thể nạp danh sách đội.</td></tr>`;
  }
}

function renderTeamsOverviewTable(teams) {
  const tbody = document.getElementById("tbody-teams-overview");
  if (!teams || teams.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">Không có dữ liệu đội tuyển.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  teams.forEach(t => {
    const tr = document.createElement("tr");

    let statusHtml = `<span style="color:#16a34a; font-weight:700">Đang Tranh Tài</span>`;
    if (t.status === "CHAMPION") {
      statusHtml = `<span style="color:#d97706; font-weight:800">QUÁN QUÂN</span>`;
    } else if (t.status === "ELIMINATED") {
      statusHtml = `<span style="color:#64748b">Dừng Bước</span>`;
    }

    tr.innerHTML = `
      <td><strong>#${t.seed || '-'}</strong></td>
      <td><strong>${escapeHtml(t.team_name)}</strong></td>
      <td><code>${escapeHtml(t.student_id)}</code></td>
      <td>${escapeHtml(t.university || 'BOT K69')}</td>
      <td>${escapeHtml(t.current_stage || 'Tứ Kết')}</td>
      <td>${statusHtml}</td>
      <td>${t.matches_won || 0}</td>
      <td>${t.rounds_won || 0}</td>
      <td><strong>${t.elo || 1200}</strong></td>
    `;
    tbody.appendChild(tr);
  });
}

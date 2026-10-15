let allTournamentsCache = [];
async function renderAllTournamentsTable() {
  const tbody = document.getElementById("tbody-all-tournaments");
  const countEl = document.getElementById("count-total-tournaments");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Đang tải danh sách bảng đấu...</td></tr>`;

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/list`);
    if (!res.ok) throw new Error("Không thể tải danh sách");
    const list = await res.json();
    allTournamentsCache = list || [];

    if (countEl) countEl.textContent = allTournamentsCache.length;

    renderTournamentsTableRows(allTournamentsCache);

    const searchInp = document.getElementById("inp-search-tournaments");
    if (searchInp) {
      searchInp.oninput = (e) => {
        const q = (e.target.value || "").toLowerCase().trim();
        const filtered = allTournamentsCache.filter(t => (t.name || "").toLowerCase().includes(q) || (t.tournament_id || "").toLowerCase().includes(q));
        renderTournamentsTableRows(filtered);
      };
    }
  } catch (err) {
    console.error("Lỗi tải bảng đấu tập trung:", err);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Không thể kết nối đến máy chủ API.</td></tr>`;
  }
}

function renderTournamentsTableRows(list) {
  const tbody = document.getElementById("tbody-all-tournaments");
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Không tìm thấy bảng đấu nào.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  list.forEach(t => {
    const tr = document.createElement("tr");
    const isCurrent = t.tournament_id === currentTournamentId;
    const statusBadge = t.champion
      ? `<span class="badge-tag" style="background:#fef3c7; color:#b45309">Đã kết thúc</span>`
      : `<span class="badge-tag highlight">Đang diễn ra</span>`;
    const champ = t.champion ? `<strong>${escapeHtml(t.champion)}</strong>` : `<span class="text-muted">Chưa có</span>`;

    tr.innerHTML = `
      <td><code>${escapeHtml(t.tournament_id)}</code></td>
      <td>
        <strong>${escapeHtml(t.name)}</strong>
        ${isCurrent ? '<span class="badge-tag" style="margin-left:6px; background:#dcfce7; color:#15803d">Đang xem</span>' : ''}
      </td>
      <td>${t.num_teams || 8} Đội</td>
      <td>Bo5 (9x9)</td>
      <td>${statusBadge}</td>
      <td>${champ}</td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-sm btn-primary" onclick="window.selectAndLoadTournament('${t.tournament_id}')">Chọn Bảng</button>
          <button class="btn btn-sm btn-outline" onclick="window.viewTournamentBracket('${t.tournament_id}')">Xem Nhánh</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.selectAndLoadTournament = async function(tournamentId) {
  if (currentTournamentId !== tournamentId) resetSelectedMatch();
  currentTournamentId = tournamentId;
  sessionStorage.setItem("activeTournamentId", tournamentId);
  localStorage.setItem("activeTournamentId", tournamentId);
  await loadActiveTournament(tournamentId);
  notifySuccess("Chọn Bảng Đấu", "Đã nạp bảng đấu thành công!");
  switchPublicSubView("overview");
};

window.viewTournamentBracket = async function(tournamentId) {
  if (currentTournamentId !== tournamentId) resetSelectedMatch();
  currentTournamentId = tournamentId;
  sessionStorage.setItem("activeTournamentId", tournamentId);
  localStorage.setItem("activeTournamentId", tournamentId);
  await loadActiveTournament(tournamentId);
  switchPublicSubView("bracket");
};

function filterTeamsOverviewTable(query) {
  const q = (query || "").toLowerCase().trim();
  const rows = document.querySelectorAll("#tbody-teams-overview tr");
  rows.forEach(r => {
    const text = r.textContent.toLowerCase();
    r.style.display = text.includes(q) ? "" : "none";
  });
}

async function renderBracketTournamentList() {
  const body = document.getElementById("tbody-bracket-tournament-list");
  if (!body) return;
  body.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Đang tải danh sách giải...</td></tr>';
  try {
    const response = await fetch(`${API_BASE}/api/tournaments/list`);
    const tournaments = await response.json();
    if (!response.ok) throw new Error(tournaments.detail || "Không tải được danh sách giải.");
    if (!Array.isArray(tournaments) || tournaments.length === 0) {
      body.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Chưa có giải đấu nào.</td></tr>';
      return;
    }
    body.replaceChildren();
    tournaments.forEach((tournament) => {
      const row = document.createElement("tr");
      const nameCell = document.createElement("td");
      const teamsCell = document.createElement("td");
      const statusCell = document.createElement("td");
      const actionsCell = document.createElement("td");
      const name = document.createElement("strong");
      name.textContent = tournament.name || tournament.tournament_id;
      nameCell.appendChild(name);
      if (tournament.tournament_id === currentTournamentId) {
        const current = document.createElement("span");
        current.className = "badge-tag highlight";
        current.textContent = "Đang chọn";
        current.style.marginLeft = "8px";
        nameCell.appendChild(current);
      }
      teamsCell.textContent = `${tournament.num_teams || 0} đội`;
      statusCell.textContent = tournament.champion
        ? `Đã kết thúc · ${tournament.champion}`
        : (tournament.status === "CONFIGURING" ? "Đang chuẩn bị" : "Đang thi đấu");

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "8px";
      const selectButton = document.createElement("button");
      selectButton.className = "btn btn-sm btn-primary";
      selectButton.textContent = "Chọn giải";
      selectButton.addEventListener("click", () => window.selectTournamentForBracket(tournament.tournament_id));
      actions.appendChild(selectButton);
      if (currentAppRole === "ADMIN") {
        const deleteButton = document.createElement("button");
        deleteButton.className = "btn btn-sm btn-outline";
        deleteButton.textContent = "Xóa giải";
        deleteButton.addEventListener("click", () => window.deleteTournamentFromBracket(tournament.tournament_id, tournament.name));
        actions.appendChild(deleteButton);
      }
      actionsCell.appendChild(actions);
      row.append(nameCell, teamsCell, statusCell, actionsCell);
      body.appendChild(row);
    });
  } catch (error) {
    body.innerHTML = `<tr><td colspan="4" class="text-center text-muted">${escapeHtml(error.message || "Không tải được danh sách giải.")}</td></tr>`;
  }
}

window.closeTournamentListModal = function() {
  const modal = document.getElementById("modal-tournament-list");
  if (modal) modal.style.display = "none";
};

window.selectTournamentForBracket = async function(tournamentId) {
  if (!tournamentId) return;
  if (currentTournamentId !== tournamentId) resetSelectedMatch();
  currentTournamentId = tournamentId;
  sessionStorage.setItem("activeTournamentId", tournamentId);
  localStorage.setItem("activeTournamentId", tournamentId);
  await loadActiveTournament(tournamentId);
  window.closeTournamentListModal();
  switchToTab("tab-bracket");
};

window.deleteTournamentFromBracket = async function(tournamentId, tournamentName = "giải đấu này") {
  if (currentAppRole !== "ADMIN") {
    notifyWarning("Không đủ quyền", "Chỉ Ban Tổ Chức mới được xóa giải đấu.");
    return;
  }
  if (!await confirmAction(`Xóa ${tournamentName}? Toàn bộ đội, nhánh đấu và kết quả của giải sẽ bị xóa.`, {title:'Xóa giải đấu', confirmText:'Xóa giải', danger:true})) return;
  try {
    const response = await fetch(`${API_BASE}/api/tournaments/${encodeURIComponent(tournamentId)}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok && response.status !== 404) throw new Error(result.detail || "Không thể xóa giải đấu.");
    if (currentTournamentId === tournamentId) {
      resetSelectedMatch();
      currentTournamentId = null;
      currentTournamentData = null;
      sessionStorage.removeItem("activeTournamentId");
      localStorage.removeItem("activeTournamentId");
    }
    notifySuccess("Đã xóa giải đấu", `${tournamentName} đã được xóa.`);
    await loadTournamentsList();
    await renderBracketTournamentList();
    if (currentTournamentId) switchToTab("tab-bracket");
  } catch (error) {
    notifyError("Không thể xóa giải", error.message || "Lỗi kết nối máy chủ.");
  }
};

function resetSelectedMatch() {
  saveStudioDraft();
  clearInterval(liveRoundTimer);
  liveRoundKey = "";
  currentActiveMatchId = null;
  currentStudioSide = null;
  sessionStorage.removeItem("activeMatchId");
  localStorage.removeItem("activeMatchId");
  sessionStorage.removeItem("studioSide");
  localStorage.removeItem("studioSide");
  sessionStorage.setItem("matchExplicitlySelected", "false");
  localStorage.setItem("matchExplicitlySelected", "false");
}

// =============================================================================
// 7.2. QUẢN LÝ CÁC ĐỘI THI ĐẤU & TỰ ĐỘNG SẮP XẾP LỊCH ĐẤU
// =============================================================================
window.closeTeamManagerModal = function() {
  const modal = document.getElementById("modal-manage-teams");
  if (modal) modal.style.display = "none";
};

function openTeamManagerModal() {
  if (currentAppRole !== "ADMIN") {
    notifyWarning("Quyền Hạn Ban Tổ Chức", "Chỉ Ban Tổ Chức (Admin) mới có quyền quản lý danh sách đội thi đấu!");
    return;
  }
  const modal = document.getElementById("modal-manage-teams");
  if (!modal) return;

  renderTeamManagerTable();
  modal.style.display = "flex";
}

function renderTeamManagerTable() {
  const tbody = document.getElementById("tbody-mgr-teams");
  if (!tbody || !currentTournamentData) return;

  const teams = currentTournamentData.teams || [];
  const cap = currentTournamentData.num_teams || 8;

  const countBadge = document.getElementById("mgr-teams-count-badge");
  if (countBadge) countBadge.textContent = `${teams.length} / ${cap} Đội`;

  const oldBadge = document.getElementById("count-teams-badge");
  if (oldBadge) oldBadge.textContent = `${teams.length}/${cap}`;

  if (teams.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 24px;">Chưa có đội nào tham gia giải này. Bạn có thể thêm từng đội hoặc bấm " Nạp Nhanh Đội Mẫu".</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  teams.forEach((t, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="padding: 9px 12px; font-size: 12px;"><strong>#${t.seed || (idx + 1)}</strong></td>
      <td style="padding: 9px 12px; font-size: 12px;"><strong>${escapeHtml(t.team_name)}</strong></td>
      <td style="padding: 9px 12px; font-size: 12px;"><code>${escapeHtml(t.student_id)}</code></td>
      <td style="padding: 9px 12px; font-size: 12px;">${escapeHtml(t.university || 'Khối Kỹ Thuật')}</td>
      <td style="padding: 9px 12px; text-align: center;">
        <button class="btn-delete-team-row" data-sid="${escapeHtml(t.student_id)}" title="Xóa đội này khỏi giải đấu">
          Xóa
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".btn-delete-team-row").forEach(btn => {
    btn.addEventListener("click", () => {
      handleDeleteTeam(btn.dataset.sid);
    });
  });
}

async function handleAddTeamSubmit() {
  if (!currentTournamentId || !currentTournamentData) return;
  if (currentAppRole !== "ADMIN") {
    notifyWarning("Quyền Hạn Ban Tổ Chức", "Chỉ Ban Tổ Chức (Admin) mới có quyền thêm đội!");
    return;
  }

  const nameInp = document.getElementById("mgr-inp-name");
  const sidInp = document.getElementById("mgr-inp-sid");
  const uniInp = document.getElementById("mgr-inp-uni");

  const name = nameInp ? nameInp.value.trim() : "";
  const sid = sidInp ? sidInp.value.trim() : "";
  const uni = uniInp ? uniInp.value.trim() : "";

  if (!name || !sid) {
    notifyWarning("Thiếu Thông Tin", "Vui lòng nhập Tên Đội và Mã Số Sinh Viên (MSSV)!");
    return;
  }

  const btn = document.getElementById("btn-mgr-add-team");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Đang Thêm...";
  }

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team_name: name,
        student_id: sid,
        university: uni || "Khối Kỹ Thuật"
      })
    });

    const data = await res.json();
    if (!res.ok) {
      notifyError("Không Thể Thêm Đội", data.detail || "Lỗi thêm đội.");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "+ Thêm Đội";
      }
      return;
    }

    if (nameInp) nameInp.value = "";
    if (sidInp) sidInp.value = "";
    if (uniInp) uniInp.value = "Khối Kỹ Thuật";

    if (btn) {
      btn.disabled = false;
      btn.textContent = "+ Thêm Đội";
    }

    notifySuccess("Đã thêm đội", `${data.message || name}. Xem tài khoản và mật khẩu tại Bàn Quản Trị.`);
    await loadActiveTournament(currentTournamentId);
    renderTeamManagerTable();

  } catch (err) {
    console.error("Lỗi thêm đội:", err);
    notifyError("Lỗi Kết Nối", "Không thể kết nối đến máy chủ API.");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "+ Thêm Đội";
    }
  }
}

async function handleDeleteTeam(studentId) {
  if (!currentTournamentId) return;
  if (currentAppRole !== "ADMIN") {
    notifyWarning("Quyền Hạn Ban Tổ Chức", "Chỉ Ban Tổ Chức (Admin) mới có quyền xóa đội!");
    return;
  }
  const selectedTournament = currentTournamentId;
  if (!await confirmAction(`Bạn có chắc muốn xóa đội có MSSV '${studentId}' khỏi giải đấu?`, {title:'Xóa đội khỏi giải', confirmText:'Xóa đội', danger:true})) return;
  if (selectedTournament !== currentTournamentId) return;

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/teams/${studentId}`, {
      method: "DELETE"
    });
    const data = await res.json();
    if (!res.ok) {
      notifyError("Lỗi Xóa Đội", data.detail || "Không thể xóa đội khỏi giải.");
      return;
    }

    notifySuccess("Xóa Đội Thành Công", `Đã xóa đội có MSSV ${studentId} khỏi giải.`);
    await loadActiveTournament(currentTournamentId);
    renderTeamManagerTable();

  } catch (err) {
    console.error("Lỗi xóa đội:", err);
    notifyError("Lỗi Kết Nối", "Không thể kết nối đến máy chủ API.");
  }
}

async function handleQuickFillTeams() {
  if (!currentTournamentId) return;
  if (currentAppRole !== "ADMIN") {
    notifyWarning("Quyền Hạn Ban Tổ Chức", "Chỉ Ban Tổ Chức (Admin) mới có quyền nạp danh sách đội mẫu!");
    return;
  }

  const btn = document.getElementById("btn-mgr-quick-fill");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Đang Nạp...";
  }

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/teams/quick-fill`, {
      method: "POST"
    });
    const data = await res.json();
    if (!res.ok) {
      notifyError("Lỗi Nạp Đội Mẫu", data.detail || "Không thể nạp danh sách mẫu.");
      if (btn) {
        btn.disabled = false;
        btn.textContent = " Nạp Nhanh Đội Mẫu";
      }
      return;
    }

    if (btn) {
      btn.disabled = false;
      btn.textContent = " Nạp Nhanh Đội Mẫu";
    }

    notifySuccess("Nạp Đội Mẫu Thành Công", data.message || "Đã nạp nhanh đủ danh sách đội mẫu!");
    await loadActiveTournament(currentTournamentId);
    renderTeamManagerTable();

  } catch (err) {
    console.error("Lỗi nạp nhanh đội:", err);
    notifyError("Lỗi Kết Nối", "Không thể kết nối đến máy chủ API.");
    if (btn) {
      btn.disabled = false;
      btn.textContent = " Nạp Nhanh Đội Mẫu";
    }
  }
}

async function handleAutoSchedule() {
  if (!currentTournamentId || !currentTournamentData) return;
  if (currentAppRole !== "ADMIN") {
    notifyWarning("Quyền Hạn Ban Tổ Chức", "Chỉ Ban Tổ Chức (Admin) mới có quyền bốc thăm sắp xếp lịch đấu!");
    return;
  }

  const btn = document.getElementById("btn-mgr-auto-schedule");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Đang Bốc Thăm...";
  }

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/auto-schedule`, {
      method: "POST"
    });
    const data = await res.json();
    if (!res.ok) {
      notifyError("Lỗi Xếp Lịch", data.detail || "Không thể xếp lịch thi đấu.");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = " Bốc Thăm & Chia Nhánh Ngẫu Nhiên";
      }
      return;
    }

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = " Bốc Thăm & Chia Nhánh Ngẫu Nhiên";
    }

    notifySuccess("Bốc Thăm Thành Công!", "Đã tự động bốc thăm và chia nhánh ngẫu nhiên các đội vào sơ đồ thi đấu.");
    window.closeTeamManagerModal();

    await loadActiveTournament(currentTournamentId);
    switchToBracketView();

  } catch (err) {
    console.error("Lỗi tự sắp xếp lịch:", err);
    notifyError("Lỗi Kết Nối", "Không thể kết nối đến máy chủ API.");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = " Bốc Thăm & Chia Nhánh Ngẫu Nhiên";
    }
  }
}

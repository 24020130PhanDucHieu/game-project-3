// =============================================================================
// QUẢN LÝ HỒ SƠ ĐỘI THI ĐẤU (TEAM PROFILE & STATS MANAGEMENT)
// =============================================================================
let currentTeamProfileData = null;

async function fetchTeamProfile(sid) {
  try {
    const res = await fetch(`${API_BASE}/api/teams/profile?student_id=${encodeURIComponent(sid)}`, {
      headers: getArenaAuthHeaders(),
      cache: 'no-store'
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.profile || null;
  } catch {
    return null;
  }
}

async function renderTeamProfile() {
  const root = document.getElementById('tab-profile');
  if (!root) return;

  const sid = String(currentTeamStudentId || '').trim();
  const isTeam = currentAppRole === 'TEAM' && sid && sid !== 'ADMIN';

  const nameEl = document.getElementById('profile-team-name');
  const sidEl = document.getElementById('profile-student-id');
  const captEl = document.getElementById('profile-captain-name');
  const uniEl = document.getElementById('profile-university');
  const bioEl = document.getElementById('profile-bio');
  const langEl = document.getElementById('profile-pref-lang');

  if (!isTeam) {
    if (nameEl) nameEl.textContent = currentAppRole === 'ADMIN' ? 'Ban Tổ Chức (Quản trị viên)' : 'Khách tham quan';
    if (sidEl) sidEl.textContent = currentAppRole === 'ADMIN' ? 'ADMIN' : 'Chưa đăng nhập';
    if (captEl) captEl.textContent = currentAppRole === 'ADMIN' ? 'Hội đồng chuyên môn' : '—';
    if (uniEl) uniEl.textContent = 'Trường ĐH Công Nghệ - ĐHQGHN';
    if (bioEl) bioEl.textContent = currentAppRole === 'ADMIN' ? 'Tài khoản quản trị điều hành toàn bộ hệ thống giải đấu BOT ARENA.' : 'Đăng nhập tài khoản đội thi để xem hồ sơ và lịch sử trận đấu của bạn.';
    if (langEl) langEl.textContent = 'HỆ THỐNG';

    // Clear stats
    document.getElementById('stat-profile-elo').textContent = '—';
    document.getElementById('stat-profile-winrate').textContent = '—';
    document.getElementById('stat-profile-wl-ratio').textContent = '—';
    document.getElementById('stat-profile-matches').textContent = '0';
    document.getElementById('stat-profile-heats-won').textContent = '0';
    document.getElementById('stat-profile-heats-total').textContent = '0';

    const membersList = document.getElementById('profile-members-list');
    if (membersList) {
      membersList.innerHTML = `<div style="font-size: 13px; color: #64748b; padding: 12px; text-align: center;">Chỉ hiển thị thành viên khi đăng nhập tài khoản Đội thi.</div>`;
    }
    const matchesList = document.getElementById('profile-matches-container');
    if (matchesList) {
      matchesList.innerHTML = `<div style="font-size: 13px; color: #64748b; padding: 20px; text-align: center;">Chưa có lịch thi đấu của tài khoản này.</div>`;
    }
    return;
  }

  // Tải profile từ backend
  currentTeamProfileData = await fetchTeamProfile(sid);

  const isMine = team => String(team?.student_id || '').trim().toUpperCase() === sid.toUpperCase();
  const allMatches = Object.values(currentTournamentData?.matches || {});
  const myMatches = allMatches.filter(match => [match.team_a, match.team_b].some(isMine));
  const teamInTourn = currentTournamentData?.teams?.find(isMine) || myMatches.flatMap(m => [m.team_a, m.team_b]).find(isMine);

  const teamName = currentTeamProfileData?.team_name || currentTeamName || teamInTourn?.team_name || `Đội ${sid}`;
  const captain = currentTeamProfileData?.captain_name || teamName;
  const university = currentTeamProfileData?.university || teamInTourn?.university || 'Khối Kỹ Thuật';
  const bio = currentTeamProfileData?.bio || 'Đội thi đấu BOT ARENA OTV2';
  const prefLang = currentTeamProfileData?.preferred_language || teamInTourn?.language || 'PYTHON';

  if (nameEl) nameEl.textContent = teamName;
  if (sidEl) sidEl.textContent = sid;
  if (captEl) captEl.textContent = captain;
  if (uniEl) uniEl.textContent = university;
  if (bioEl) bioEl.textContent = bio;
  if (langEl) langEl.textContent = prefLang === 'CPP' ? 'C++ 17' : 'PYTHON 3';

  // Tính toán chỉ số thi đấu thực tế
  const completedMatches = myMatches.filter(m => m.status === 'COMPLETED');
  const wonMatches = completedMatches.filter(m => isMine(m[m.winner])).length;
  const lostMatches = completedMatches.length - wonMatches;
  const winRate = completedMatches.length > 0 ? Math.round((wonMatches / completedMatches.length) * 100) : 0;

  let totalHeats = 0;
  let wonHeats = 0;
  myMatches.forEach(m => {
    (m.rounds_history || []).forEach(r => {
      totalHeats++;
      if (isMine(m[r.winner])) wonHeats++;
    });
  });

  // Tải điểm ELO từ ranking API
  let eloScore = 1200;
  try {
    const rankRes = await fetch(`${API_BASE}/api/ranking`, { cache: 'no-store' });
    if (rankRes.ok) {
      const rows = await rankRes.json();
      const myRow = rows.find(r => String(r.student_id).trim().toUpperCase() === sid.toUpperCase());
      if (myRow && myRow.elo_score) eloScore = myRow.elo_score;
    }
  } catch {}

  document.getElementById('stat-profile-elo').textContent = Number(eloScore).toFixed(2);
  document.getElementById('stat-profile-winrate').textContent = `${winRate}%`;
  document.getElementById('stat-profile-wl-ratio').textContent = `${wonMatches} thắng / ${lostMatches} thua`;
  document.getElementById('stat-profile-matches').textContent = completedMatches.length;
  document.getElementById('stat-profile-heats-won').textContent = wonHeats;
  document.getElementById('stat-profile-heats-total').textContent = `Trên tổng ${totalHeats} hiệp đã đấu`;

  // Render Danh sách thành viên
  const membersList = document.getElementById('profile-members-list');
  if (membersList) {
    const members = currentTeamProfileData?.members || [];
    let html = `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
        <div>
          <strong style="color: #0f172a; font-size: 13.5px;">${escapeHtml(captain)}</strong>
          <div style="font-size: 11.5px; color: #64748b;">MSSV: ${sid}</div>
        </div>
        <span class="user-role-pill" style="font-size: 10.5px;">ĐỘI TRƯỞNG</span>
      </div>
    `;

    members.forEach(m => {
      if (!m.name) return;
      html += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
          <div>
            <strong style="color: #0f172a; font-size: 13.5px;">${escapeHtml(m.name)}</strong>
            <div style="font-size: 11.5px; color: #64748b;">MSSV: ${escapeHtml(m.student_id || 'Chưa cập nhật')}</div>
          </div>
          <span style="font-size: 11px; color: #64748b; font-weight: 500;">Thành viên</span>
        </div>
      `;
    });

    membersList.innerHTML = html;
  }

  // Render Lịch sử thi đấu
  const matchesContainer = document.getElementById('profile-matches-container');
  if (matchesContainer) {
    if (myMatches.length === 0) {
      matchesContainer.innerHTML = `<div style="font-size: 13px; color: #64748b; text-align: center; padding: 24px;">Chưa có lịch đấu của đội trong giải đang diễn ra.</div>`;
    } else {
      matchesContainer.innerHTML = myMatches.map(m => {
        const isComp = m.status === 'COMPLETED';
        const isWin = isComp && isMine(m[m.winner]);
        const scoreText = `${m.team_a?.rounds_won || 0} – ${m.team_b?.rounds_won || 0}`;
        const oppTeam = isMine(m.team_a) ? m.team_b : m.team_a;
        const oppName = oppTeam ? oppTeam.team_name : 'Chưa xác định';

        let badgeStatus = '<span style="font-size: 11px; padding: 2px 8px; border-radius: 12px; background: #e2e8f0; color: #475569; font-weight: 600;">SẮP ĐẤU</span>';
        if (isComp) {
          badgeStatus = isWin 
            ? '<span style="font-size: 11px; padding: 2px 8px; border-radius: 12px; background: #dcfce7; color: #166534; font-weight: 700;">THẮNG</span>'
            : '<span style="font-size: 11px; padding: 2px 8px; border-radius: 12px; background: #fee2e2; color: #991b1b; font-weight: 700;">THUA</span>';
        } else if (m.battle_running) {
          badgeStatus = '<span style="font-size: 11px; padding: 2px 8px; border-radius: 12px; background: #fef3c7; color: #92400e; font-weight: 700;">ĐANG ĐẤU</span>';
        }

        return `
          <div style="padding: 12px 14px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
            <div>
              <div style="font-size: 12px; color: #64748b; font-weight: 600;">${escapeHtml(m.round_name || 'Vòng Đấu')} • Bo5</div>
              <div style="font-size: 13.5px; color: #0f172a; margin-top: 2px;">
                Đối đầu: <strong>${escapeHtml(oppName)}</strong>
              </div>
            </div>
            <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
              <strong style="font-size: 15px; color: #0f172a;">${scoreText}</strong>
              ${badgeStatus}
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

function openEditProfileModal() {
  if (currentAppRole !== 'TEAM') {
    notifyWarning('Yêu cầu tài khoản Đội', 'Chỉ tài khoản đội thi mới có thể cập nhật thông tin hồ sơ.');
    return;
  }
  const modal = document.getElementById('modal-edit-profile');
  if (modal) modal.style.display = 'flex';

  const sid = currentTeamStudentId || '';
  const nameInp = document.getElementById('edit-profile-team-name');
  const captInp = document.getElementById('edit-profile-captain');
  const uniInp = document.getElementById('edit-profile-uni');
  const langSel = document.getElementById('edit-profile-lang');
  const bioInp = document.getElementById('edit-profile-bio');

  if (nameInp) nameInp.value = currentTeamProfileData?.team_name || currentTeamName || '';
  if (captInp) captInp.value = currentTeamProfileData?.captain_name || '';
  if (uniInp) uniInp.value = currentTeamProfileData?.university || 'Khối Kỹ Thuật';
  if (langSel) langSel.value = currentTeamProfileData?.preferred_language || 'PYTHON';
  if (bioInp) bioInp.value = currentTeamProfileData?.bio || '';

  const members = currentTeamProfileData?.members || [];
  const m2 = members[0] || {};
  const m3 = members[1] || {};

  const name2 = document.getElementById('edit-member-name-2');
  const sid2 = document.getElementById('edit-member-sid-2');
  const name3 = document.getElementById('edit-member-name-3');
  const sid3 = document.getElementById('edit-member-sid-3');

  if (name2) name2.value = m2.name || '';
  if (sid2) sid2.value = m2.student_id || '';
  if (name3) name3.value = m3.name || '';
  if (sid3) sid3.value = m3.student_id || '';
}

function closeEditProfileModal() {
  const modal = document.getElementById('modal-edit-profile');
  if (modal) modal.style.display = 'none';
}

async function submitEditProfile(event) {
  if (event) event.preventDefault();
  const alertBox = document.getElementById('edit-profile-alert');
  const btn = document.getElementById('btn-save-profile');

  const teamName = document.getElementById('edit-profile-team-name')?.value.trim() || '';
  const captain = document.getElementById('edit-profile-captain')?.value.trim() || '';
  const university = document.getElementById('edit-profile-uni')?.value.trim() || '';
  const preferredLang = document.getElementById('edit-profile-lang')?.value || 'PYTHON';
  const bio = document.getElementById('edit-profile-bio')?.value.trim() || '';

  const name2 = document.getElementById('edit-member-name-2')?.value.trim() || '';
  const sid2 = document.getElementById('edit-member-sid-2')?.value.trim() || '';
  const name3 = document.getElementById('edit-member-name-3')?.value.trim() || '';
  const sid3 = document.getElementById('edit-member-sid-3')?.value.trim() || '';

  if (!teamName) {
    if (alertBox) {
      alertBox.textContent = 'Vui lòng nhập tên đội thi.';
      alertBox.style.display = 'block';
    }
    return;
  }

  const members = [];
  if (name2) members.push({ name: name2, student_id: sid2, role: 'MEMBER' });
  if (name3) members.push({ name: name3, student_id: sid3, role: 'MEMBER' });

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Đang lưu...';
  }

  try {
    const res = await fetch(`${API_BASE}/api/teams/profile`, {
      method: 'PUT',
      headers: getArenaAuthHeaders(),
      body: JSON.stringify({
        student_id: currentTeamStudentId,
        team_name: teamName,
        captain_name: captain,
        university: university,
        preferred_language: preferredLang,
        bio: bio,
        members: members
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Không thể cập nhật hồ sơ.');

    notifySuccess('Hồ sơ đội', data.message || 'Cập nhật thông tin thành công!');
    currentTeamName = teamName;
    sessionStorage.setItem('ARENA_TEAM_NAME', teamName);
    closeEditProfileModal();
    renderTeamProfile();
  } catch (err) {
    if (alertBox) {
      alertBox.textContent = err.message;
      alertBox.style.display = 'block';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Lưu thay đổi';
    }
  }
}

async function refreshTeamProfile() {
  if (currentTournamentId) await loadActiveTournament(currentTournamentId);
  await renderTeamProfile();
  notifyInfo('Làm mới', 'Đã cập nhật số liệu hồ sơ mới nhất.');
}

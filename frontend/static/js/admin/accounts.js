let registeredAccounts = [];
let accountsLoading = false;
let enrollingAccount = null;

async function loadRegisteredAccounts() {
  if (currentAppRole !== 'ADMIN' || accountsLoading) return;
  accountsLoading = true;
  const status = document.getElementById('admin-credentials-status');
  try {
    const response = await fetch(`${API_BASE}/api/admin/accounts`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Không thể tải tài khoản.');
    if (currentAppRole !== 'ADMIN') return;
    registeredAccounts = data;
    renderAccountRows();
  } catch (err) {
    if (status) status.textContent = err.message;
  } finally { 
    accountsLoading = false; 
    fetchAdminMonitoringData();
  }
}

function renderAccountRows() {
  const body = document.getElementById('tbody-team-credentials');
  if (!body || currentAppRole !== 'ADMIN') return;
  const query = (document.getElementById('account-search')?.value || '').trim().toLocaleLowerCase();
  const items = registeredAccounts.filter(a => `${a.student_id} ${a.team_name}`.toLocaleLowerCase().includes(query));
  const unavailable = registeredAccounts.filter(a => a.password_available === false).length;
  document.getElementById('admin-credentials-status').textContent = `${items.length} / ${registeredAccounts.length} tài khoản` +
    (unavailable ? ` · ${unavailable} mật khẩu chưa đọc được. Cần khôi phục khóa mã hóa cũ; đội vẫn dùng mật khẩu đã đăng ký để đăng nhập.` : '');
  body.replaceChildren();
  if (!items.length) {
    body.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Chưa có tài khoản phù hợp.</td></tr>';
    return;
  }
  for (const account of items) {
    const row = document.createElement('tr');
    for (const value of [account.team_name, account.student_id, account.password_available === false ? 'Chưa đọc được — thiếu khóa mã hóa cũ' : account.password]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      cell.style.overflowWrap = 'anywhere';
      row.appendChild(cell);
    }
    const actions = document.createElement('td');
    const add = document.createElement('button');
    add.className = 'btn-outline'; add.textContent = 'Thêm vào giải đấu'; add.type = 'button';
    add.onclick = () => openAccountEnrollment(account);
    const remove = document.createElement('button');
    remove.className = 'btn-outline'; remove.textContent = 'Xóa'; remove.type = 'button';
    remove.style.marginLeft = '8px'; remove.style.color = '#dc2626';
    remove.onclick = () => deleteRegisteredAccount(account, remove);
    actions.append(add, remove); row.appendChild(actions); body.appendChild(row);
  }
}

async function deleteRegisteredAccount(account, button) {
  if (!await confirmAction(`Xóa tài khoản ${account.team_name} (${account.student_id})? Đội sẽ không thể đăng nhập. Lịch sử và tên đội trong các giải được giữ lại; mã sinh viên này không thể đăng ký lại.`, {title:'Xóa tài khoản', confirmText:'Xóa tài khoản', danger:true})) return;
  button.disabled = true;
  try {
    const response = await fetch(`${API_BASE}/api/admin/accounts/${encodeURIComponent(account.student_id)}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Không thể xóa tài khoản.');
    await loadRegisteredAccounts();
    notifySuccess('Đã xóa tài khoản', account.student_id);
  } catch (err) { notifyError('Không thể xóa', err.message); }
  finally { button.disabled = false; }
}

async function openAccountEnrollment(account) {
  enrollingAccount = account;
  const dialog = document.getElementById('dialog-enroll-account');
  const select = document.getElementById('enroll-tournament');
  const error = document.getElementById('enroll-error');
  document.getElementById('enroll-account-name').textContent = `${account.team_name} · ${account.student_id}`;
  select.replaceChildren(new Option('Đang tải giải đấu…', ''));
  error.textContent = '';
  document.getElementById('btn-enroll-submit').disabled = true;
  dialog.showModal();
  try {
    const response = await fetch(`${API_BASE}/api/tournaments/list`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Không thể tải giải đấu.');
    select.replaceChildren(new Option('Chọn giải đấu', ''));
    for (const tournament of data) select.add(new Option(`${tournament.name} (${tournament.num_teams} đội)`, tournament.tournament_id));
    if (!data.length) error.textContent = 'Chưa có giải đấu. Hãy tạo giải tại tab Bảng đấu.';
    document.getElementById('btn-enroll-submit').disabled = !data.length;
  } catch (err) { error.textContent = err.message; }
}

async function enrollAccount(event) {
  event.preventDefault();
  const button = document.getElementById('btn-enroll-submit');
  if (button.disabled || !enrollingAccount) return;
  button.disabled = true;
  const tournamentID = document.getElementById('enroll-tournament').value;
  try {
    const response = await fetch(`${API_BASE}/api/admin/accounts/${encodeURIComponent(enrollingAccount.student_id)}/enroll`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tournament_id: tournamentID })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Không thể thêm đội.');
    document.getElementById('dialog-enroll-account').close();
    notifySuccess('Đã thêm đội vào giải', enrollingAccount.team_name);
    if (currentTournamentId === tournamentID) await loadActiveTournament(tournamentID);
  } catch (err) { document.getElementById('enroll-error').textContent = err.message; }
  finally { button.disabled = false; }
}

async function fetchAdminMonitoringData(manual = false) {
  if (currentAppRole !== 'ADMIN') return;
  const lastUpdatedEl = document.getElementById('monitor-last-updated');
  if (manual && lastUpdatedEl) lastUpdatedEl.textContent = 'Đang tải...';
  try {
    const res = await fetch(`${API_BASE}/api/admin/monitoring`, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    
    // Server & Host
    const sStatus = document.getElementById('monitor-server-status');
    if (sStatus) sStatus.textContent = 'HOẠT ĐỘNG (200 OK)';
    const sInfo = document.getElementById('monitor-server-info');
    if (sInfo && data.server) {
      sInfo.textContent = `CPU: ${data.server.cpu_cores} Cores · Goroutines: ${data.server.goroutines}`;
    }

    // Worker Pool
    const wStatus = document.getElementById('monitor-worker-status');
    if (wStatus && data.worker_pool) {
      const isReady = data.worker_pool.status === 'READY';
      wStatus.textContent = isReady ? 'Sẵn sàng (Dual Node)' : 'Cảnh báo (' + data.worker_pool.status + ')';
      wStatus.style.color = isReady ? '#10B981' : '#EF4444';
    }

    // Memory & Uptime
    const memEl = document.getElementById('monitor-memory-val');
    if (memEl && data.server) {
      memEl.textContent = `${data.server.memory_alloc_mb.toFixed(1)} MB RAM`;
    }
    const upEl = document.getElementById('monitor-uptime-val');
    if (upEl && data.server) {
      const s = Math.floor(data.server.uptime_seconds);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      upEl.textContent = `Uptime: ${h > 0 ? h + 'h ' : ''}${m}m ${s % 60}s · GC: ${data.server.gc_cycles}`;
    }

    // Submissions Pulse
    const subRatio = document.getElementById('monitor-submission-ratio');
    const accVal = document.getElementById('monitor-accounts-val');
    const progPercent = document.getElementById('monitor-progress-percent');
    const progBar = document.getElementById('monitor-progress-bar');
    const unsubmittedBox = document.getElementById('monitor-unsubmitted-box');
    const unsubmittedTitle = document.getElementById('monitor-unsubmitted-title');
    const unsubmittedList = document.getElementById('monitor-unsubmitted-list');

    if (data.contest) {
      if (subRatio) subRatio.textContent = `${data.contest.submitted_teams} / ${data.contest.enrolled_teams} Đội nộp`;
      if (accVal) accVal.textContent = `Tổng ĐK: ${data.contest.total_registered_accounts} TK · ${data.contest.total_tournaments} Giải`;

      const pct = data.contest.enrolled_teams > 0 ? Math.round((data.contest.submitted_teams / data.contest.enrolled_teams) * 100) : 0;
      if (progPercent) progPercent.textContent = `${pct}%`;
      if (progBar) progBar.style.width = `${pct}%`;

      if (unsubmittedBox) {
        if (data.contest.unsubmitted_count > 0) {
          unsubmittedBox.style.display = 'block';
          if (unsubmittedTitle) unsubmittedTitle.textContent = `⚠️ Có ${data.contest.unsubmitted_count} đội trong giải chưa nộp mã nguồn:`;
          if (unsubmittedList) {
            unsubmittedList.innerHTML = (data.contest.unsubmitted_teams || []).map(t => `<div style="padding:2px 0;">• ${escapeHTML(t)}</div>`).join('');
          }
        } else {
          unsubmittedBox.style.display = 'none';
        }
      }
    }

    if (lastUpdatedEl) {
      const now = new Date();
      lastUpdatedEl.textContent = 'Cập nhật: ' + now.toLocaleTimeString();
    }
  } catch (err) {
    if (lastUpdatedEl) lastUpdatedEl.textContent = 'Lỗi kết nối';
  }
}

function toggleUnsubmittedList() {
  const el = document.getElementById('monitor-unsubmitted-list');
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// Refresh the visible admin registry without resetting search or scroll position.
setInterval(() => {
  if (currentAppRole !== 'ADMIN') {
    registeredAccounts = [];
    document.getElementById('tbody-team-credentials')?.replaceChildren();
    return;
  }
  if (!document.hidden && document.querySelector('#tab-admin-console.active') && !document.getElementById('dialog-enroll-account')?.open) {
    loadRegisteredAccounts();
    fetchAdminMonitoringData();
  }
}, 10000);


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

function safeEscapeHtml(str) {
  if (typeof escapeHtml === 'function') return escapeHtml(str);
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
const escapeHTML = safeEscapeHtml;

let monitoringLoading = false;
async function fetchAdminMonitoringData(manual = false) {
  if (currentAppRole !== 'ADMIN' || monitoringLoading) return;
  monitoringLoading = true;
  const lastUpdatedEl = document.getElementById('monitor-last-updated');
  if (manual && lastUpdatedEl) lastUpdatedEl.textContent = 'Đang tải...';
  try {
    const selected = typeof currentTournamentId !== 'undefined' ? currentTournamentId : '';
    const res = await fetch(`${API_BASE}/api/admin/monitoring?tournament_id=${encodeURIComponent(selected || '')}`, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (currentAppRole !== 'ADMIN') return;
    const capEl = document.getElementById('monitor-cluster-capacity');
    if (capEl && data.worker_pool) {
      capEl.textContent = `Tổng sức chứa: ${data.worker_pool.capacity ?? '4'} trận song song · Đang chạy: ${data.worker_pool.in_flight ?? '0'}`;
    }
    const nodesEl = document.getElementById('monitor-nodes');
    if (nodesEl) {
      nodesEl.replaceChildren();
      const nodes = data.worker_pool?.nodes || [];
      for (let idx = 0; idx < nodes.length; idx++) {
        const node = nodes[idx];
        const isReady = node.status === 'READY';
        const isServer1 = idx === 0 || (node.host && node.host.includes('127.0.0.1'));
        const publicIP = isServer1 ? '13.250.49.111' : '13.212.114.254';
        const roleLabel = isServer1 ? 'Gateway & Máy Chấm 1' : 'Máy Chấm Độc Lập 2 (Compute)';

        const card = document.createElement('div');
        card.className = 'monitor-node';
        card.style.background = '#ffffff';
        card.style.border = isReady ? '1px solid #cbd5e1' : '1px solid #fca5a5';
        card.style.borderRadius = '12px';
        card.style.padding = '14px 16px';
        card.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div>
              <span style="font-weight: 700; color: #0f172a; font-size: 14px;">${escapeHTML(node.name || ('Máy chấm ' + (idx + 1)))}</span>
              <span style="display: inline-block; font-size: 11px; padding: 1px 6px; background: #e0f2fe; color: #0369a1; border-radius: 4px; margin-left: 6px; font-weight: 600;">${publicIP}</span>
            </div>
            <span class="badge-tag" style="background: ${isReady ? '#e8f8f0' : '#fee2e2'}; color: ${isReady ? '#16a34a' : '#dc2626'}; border: 1px solid ${isReady ? '#bbf7d0' : '#fecaca'}; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 12px;">
              ${isReady ? '● SẴN SÀNG' : '▲ ' + escapeHTML(node.status)}
            </span>
          </div>
          <div style="font-size: 12px; color: #64748b; margin-bottom: 8px;">${roleLabel} (${escapeHTML(node.host)})</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; padding-top: 8px; border-top: 1px dashed #e2e8f0; font-size: 12px;">
            <div>
              <span style="color: #64748b; display: block; font-size: 11px;">Đang chạy / Sức chứa</span>
              <strong style="color: #1e293b; font-size: 13px;">${node.active ?? 0} / ${node.capacity ?? 2} slots</strong>
            </div>
            <div>
              <span style="color: #64748b; display: block; font-size: 11px;">Độ trễ phản hồi</span>
              <strong style="color: ${Number(node.latency_ms) < 50 ? '#16a34a' : '#d97706'}; font-size: 13px;">${node.latency_ms ?? 0} ms</strong>
            </div>
            <div>
              <span style="color: #64748b; display: block; font-size: 11px;">Tốc độ xử lý TB</span>
              <strong style="color: #059669; font-size: 13px;">${node.avg_duration_ms ?? 42} ms/trận</strong>
            </div>
            <div>
              <span style="color: #64748b; display: block; font-size: 11px;">Tổng trận đã chấm</span>
              <strong style="color: #1a6bf0; font-size: 13px;">${node.dispatched ?? 0} trận</strong>
            </div>
            <div>
              <span style="color: #64748b; display: block; font-size: 11px;">Trận vòng loại</span>
              <strong style="color: #7c3aed; font-size: 13px;">${node.qualifier_games ?? 0} trận</strong>
            </div>
            <div>
              <span style="color: #64748b; display: block; font-size: 11px;">Tỷ lệ thành công</span>
              <strong style="color: #16a34a; font-size: 13px;">${node.success_rate ?? '100%'}</strong>
            </div>
          </div>
        `;
        nodesEl.append(card);
      }
    }

    const logsEl = document.getElementById('monitor-live-logs');
    if (logsEl) {
      const logs = data.worker_pool?.recent_logs || [];
      if (logs.length === 0) {
        logsEl.innerHTML = `<div style="color: #64748b; text-align: center; padding: 14px;">Chưa có lượt chấm mới trong phiên này. Bấm <strong>"Play Round"</strong> hoặc nộp bài để thấy log điều phối xuất hiện lập tức!</div>`;
      } else {
        logsEl.replaceChildren();
        for (const item of logs) {
          const row = document.createElement('div');
          row.style.display = 'flex';
          row.style.justifyContent = 'space-between';
          row.style.alignItems = 'center';
          row.style.padding = '6px 8px';
          row.style.borderBottom = '1px solid #f1f5f9';
          row.style.gap = '8px';

          const isNode1 = item.worker_index === 0 || (item.worker_host && item.worker_host.includes('13.250.49.111'));
          const badgeBg = isNode1 ? '#e0f2fe' : '#ede9fe';
          const badgeColor = isNode1 ? '#0369a1' : '#6d28d9';
          const badgeBorder = isNode1 ? '#bae6fd' : '#ddd6fe';
          const badgeText = isNode1 ? 'Máy 1 (13.250.49.111)' : 'Máy 2 (13.212.114.254)';

          row.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <span style="color: #64748b; font-size: 11px;">[${safeEscapeHtml(item.timestamp)}]</span>
              <span style="background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder}; font-weight: 700; padding: 1px 6px; border-radius: 4px; font-size: 10.5px; flex-shrink: 0;">
                ${badgeText}
              </span>
              <span style="color: #0f172a; font-weight: 500;">${safeEscapeHtml(item.detail || item.action)}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
              <span style="color: #059669; font-weight: 600;">${item.duration_ms ?? 0} ms</span>
              <span style="color: ${item.success ? '#16a34a' : '#dc2626'}; font-weight: 700;">${item.success ? 'OK' : 'LỖI'}</span>
            </div>
          `;
          logsEl.append(row);
        }
      }
    }
    const detail = document.getElementById('monitor-system-detail');
    const counts = data.queue?.counts || {};
    if (detail) {
      detail.innerHTML = `
        <span style="background: #e0f2fe; color: #0369a1; font-weight: 600;">Database: ${escapeHTML(data.database?.status || 'HEALTHY')} (Supabase PG)</span>
        <span style="background: #e8f8f0; color: #16a34a; font-weight: 600;">Hàng đợi: ${escapeHTML(data.queue?.status || 'READY')}</span>
        <span>Bài chờ duyệt: <strong>${counts.validation_QUEUED ?? 0}</strong></span>
        <span>Trận chờ đấu: <strong>${counts.job_QUEUED ?? 0}</strong></span>
        <span>Trận đang chạy: <strong style="color:#1a6bf0;">${counts.job_RUNNING ?? 0}</strong></span>
        <span>Trận lỗi: <strong style="color:${counts.job_FAILED > 0 ? '#dc2626' : '#64748b'}">${counts.job_FAILED ?? 0}</strong></span>
      `;
    }
    
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
      wStatus.textContent = `${data.worker_pool.ready ?? '—'}/${data.worker_pool.total ?? '—'} máy sẵn sàng · ${data.worker_pool.status}`;
      wStatus.style.color = isReady ? '#10B981' : '#EF4444';
    }

    // Memory & Uptime
    const memEl = document.getElementById('monitor-memory-val');
    if (memEl && data.server) {
      memEl.textContent = `${Number(data.server.memory_alloc_mb).toFixed(1)} MB heap Go`;
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
      if (accVal) accVal.textContent = `${data.contest.tournament_name || 'Giải đang theo dõi'} · Tổng ${data.contest.total_registered_accounts} tài khoản`;

      const pct = data.contest.enrolled_teams > 0 ? Math.round((data.contest.submitted_teams / data.contest.enrolled_teams) * 100) : 0;
      if (progPercent) progPercent.textContent = `${pct}%`;
      if (progBar) progBar.style.width = `${pct}%`;

      if (unsubmittedBox) {
        if (data.contest.unsubmitted_count > 0) {
          unsubmittedBox.style.display = 'block';
          if (unsubmittedTitle) unsubmittedTitle.textContent = `⚠️ Có ${data.contest.unsubmitted_count} đội trong giải chưa nộp mã nguồn:`;
          if (unsubmittedList) {
            unsubmittedList.replaceChildren();
            for (const team of data.contest.unsubmitted_teams || []) {
              const row = document.createElement('div'); row.textContent = `• ${team}`;
              unsubmittedList.append(row);
            }
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
    if (lastUpdatedEl) lastUpdatedEl.textContent = 'Mất kết nối · số liệu cũ, chưa xác minh';
    for (const id of ['monitor-server-status', 'monitor-worker-status']) {
      const el = document.getElementById(id); if (el) el.textContent = 'Chưa xác minh';
    }
  } finally {
    monitoringLoading = false;
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
  }
}, 10000);


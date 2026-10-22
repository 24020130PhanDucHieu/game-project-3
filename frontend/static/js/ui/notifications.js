// =============================================================================
// PRODUCTION-GRADE TOAST & IN-APP NOTIFICATION BANNER SYSTEM
// =============================================================================
function showToast(type, title, message = "", duration = 4000) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast-item toast-${type}`;

  const badgeText = type === "success" ? "THÀNH CÔNG" : (type === "error" ? "LỖI" : (type === "warning" ? "CẢNH BÁO" : "THÔNG BÁO"));

  toast.innerHTML = `
    <span class="toast-symbol">${arenaIcon(type === "success" ? "check" : type === "error" || type === "warning" ? "warning" : "info")}</span>
    <div class="toast-body">
      <div class="toast-title"><span class="toast-badge">${badgeText}</span>${escapeHtml(title)}</div>
      ${message ? `<div class="toast-desc">${escapeHtml(message)}</div>` : ''}
    </div>
    <button class="toast-close" title="Đóng">&times;</button>
  `;

  const btnClose = toast.querySelector(".toast-close");
  if (btnClose) {
    btnClose.addEventListener("click", () => removeToast(toast));
  }

  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => {
      removeToast(toast);
    }, duration);
  }
}

function removeToast(toast) {
  if (!toast || toast.classList.contains("toast-leave")) return;
  toast.classList.add("toast-leave");
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 250);
}

function notifySuccess(title, message = "") { showToast("success", title, message); }
function notifyError(title, message = "") { showToast("error", title, message); }
function notifyWarning(title, message = "") { showToast("warning", title, message); }
function notifyInfo(title, message = "") { showToast("info", title, message); }

// Queue modal questions so simultaneous actions cannot replace each other's answers.
let appDialogQueue = Promise.resolve();
function showAppActionDialog(options) {
  const pending = appDialogQueue.then(() => new Promise(resolve => {
    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'app-action-dialog';
    dialog.id = 'app-action-dialog';
    dialog.setAttribute('aria-labelledby', 'app-action-title');
    dialog.setAttribute('aria-describedby', 'app-action-message');
    dialog.innerHTML = `<form>
      <div class="app-action-heading"><h3 id="app-action-title"></h3><button type="button" class="app-action-close" aria-label="Đóng hộp thoại">×</button></div>
      <p id="app-action-message"></p>
      <label class="app-action-input-label" hidden>Địa chỉ máy chủ<input class="login-input-field" type="text" autocomplete="off" spellcheck="false"></label>
      <div class="app-action-buttons"><button type="button" class="btn btn-outline app-action-cancel">Hủy</button><button type="submit" class="btn btn-primary app-action-submit"></button></div>
    </form>`;
    dialog.querySelector('h3').textContent = options.title;
    dialog.querySelector('p').textContent = options.message;
    const input = dialog.querySelector('input');
    const submit = dialog.querySelector('.app-action-submit');
    submit.textContent = options.confirmText || 'Xác nhận';
    if (options.danger) submit.classList.add('app-action-danger');
    if (options.input) {
      dialog.querySelector('label').hidden = false;
      input.value = options.value || '';
    }
    let answer = null;
    dialog.querySelector('form').addEventListener('submit', event => {
      event.preventDefault(); answer = options.input ? input.value : true; dialog.close();
    });
    for (const button of dialog.querySelectorAll('.app-action-cancel, .app-action-close')) {
      button.addEventListener('click', () => dialog.close());
    }
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
      resolve(answer);
    }, {once:true});
    document.body.appendChild(dialog);
    dialog.showModal();
    if (options.input) input.focus();
    else dialog.querySelector('.app-action-cancel').focus();
  }));
  appDialogQueue = pending.catch(() => {});
  return pending;
}
async function confirmAction(message, options = {}) {
  return await showAppActionDialog({title:'Xác nhận thao tác', ...options, message}) === true;
}
function promptAction(message, value = '') {
  return showAppActionDialog({title:'Cấu hình máy chủ', message, value, input:true, confirmText:'Lưu địa chỉ'});
}

// =============================================================================
// TRUNG TÂM THÔNG BÁO (NOTIFICATION CENTER) - REALTIME & PERSISTENT
// =============================================================================
let currentNotifications = [];
let unreadNotificationsCount = 0;
let notifPollInterval = null;

function getArenaAuthHeaders() {
  const token = typeof getArenaSessionToken === 'function' ? getArenaSessionToken() : (sessionStorage.getItem('arena_session_token') || '');
  return token ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } : { 'Content-Type': 'application/json' };
}

async function fetchNotifications() {
  try {
    const res = await fetch(`${API_BASE}/api/notifications`, {
      headers: getArenaAuthHeaders(),
      cache: 'no-store'
    });
    if (!res.ok) return;
    const data = await res.json();
    currentNotifications = data.notifications || [];
    unreadNotificationsCount = data.unread_count || 0;
    updateNotificationBadgeUI();
    renderNotificationsList();
  } catch {
    // Fail silently in background
  }
}

function updateNotificationBadgeUI() {
  const badge = document.getElementById("sidebar-notif-badge");
  if (badge) {
    if (unreadNotificationsCount > 0) {
      badge.textContent = unreadNotificationsCount > 99 ? "99+" : unreadNotificationsCount;
      badge.style.display = "inline-flex";
    } else {
      badge.style.display = "none";
    }
  }
}

function openNotificationModal() {
  const modal = document.getElementById("modal-notifications");
  if (modal) modal.style.display = "flex";

  const adminSection = document.getElementById("admin-broadcast-section");
  if (adminSection) {
    adminSection.style.display = currentAppRole === "ADMIN" ? "block" : "none";
  }

  fetchNotifications();
}

function closeNotificationModal() {
  const modal = document.getElementById("modal-notifications");
  if (modal) modal.style.display = "none";
}

function renderNotificationsList() {
  const itemsContainer = document.getElementById("notifications-items");
  const emptyState = document.getElementById("notifications-empty-state");
  if (!itemsContainer) return;

  if (!currentNotifications || currentNotifications.length === 0) {
    if (emptyState) emptyState.style.display = "block";
    itemsContainer.innerHTML = "";
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  itemsContainer.innerHTML = currentNotifications.map(n => {
    const isUnread = !n.is_read;
    const bg = isUnread ? "#f0f7ff" : "#ffffff";
    const border = isUnread ? "1px solid #bfdbfe" : "1px solid #e2e8f0";
    const timeStr = new Date(n.created_at).toLocaleString('vi-VN');

    let typeTag = '<span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: #e0f2fe; color: #0369a1; font-weight: 600;">HỆ THỐNG</span>';
    if (n.event_type === "ANNOUNCEMENT") {
      typeTag = '<span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: #fef3c7; color: #92400e; font-weight: 600;">BAN TỔ CHỨC</span>';
    } else if (n.event_type === "SUBMISSION_EVALUATED") {
      typeTag = '<span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: #dcfce7; color: #166534; font-weight: 600;">CHẤM ĐIỂM</span>';
    } else if (n.event_type === "ROUND_SCHEDULE") {
      typeTag = '<span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: #fae8ff; color: #86198f; font-weight: 600;">LỊCH THI</span>';
    }

    return `
      <div class="notification-item ${isUnread ? 'unread' : ''}" 
           onclick="handleNotificationClick('${n.id}', '${n.link_tab || ''}')"
           style="background: ${bg}; border: ${border}; border-radius: 8px; padding: 12px; margin-bottom: 8px; cursor: pointer; transition: all 0.15s ease; position: relative;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            ${typeTag}
            <strong style="font-size: 13.5px; color: #0f172a;">${escapeHtml(n.title)}</strong>
          </div>
          <span style="font-size: 11px; color: #64748b; white-space: nowrap;">${timeStr}</span>
        </div>
        <p style="margin: 6px 0 0; font-size: 13px; color: #334155; line-height: 1.45;">${escapeHtml(n.message)}</p>
        ${n.link_tab ? `<div style="margin-top: 6px; font-size: 11.5px; color: #2563eb; font-weight: 500;">👉 Bấm để chuyển đến xem nội dung</div>` : ''}
        ${isUnread ? '<span style="position: absolute; right: 10px; bottom: 10px; width: 8px; height: 8px; border-radius: 50%; background: #2563eb;"></span>' : ''}
      </div>
    `;
  }).join("");
}

async function handleNotificationClick(id, linkTab) {
  await markNotificationAsRead(id);
  if (linkTab) {
    closeNotificationModal();
    const tabTarget = linkTab.startsWith("tab-") ? linkTab : `tab-${linkTab}`;
    if (typeof switchToTab === "function") {
      switchToTab(tabTarget);
    }
  }
}

async function markNotificationAsRead(id) {
  try {
    await fetch(`${API_BASE}/api/notifications/read`, {
      method: 'POST',
      headers: getArenaAuthHeaders(),
      body: JSON.stringify({ id })
    });
    const found = currentNotifications.find(n => n.id === id);
    if (found && !found.is_read) {
      found.is_read = true;
      unreadNotificationsCount = Math.max(0, unreadNotificationsCount - 1);
      updateNotificationBadgeUI();
      renderNotificationsList();
    }
  } catch {}
}

async function markAllNotificationsAsRead() {
  try {
    await fetch(`${API_BASE}/api/notifications/read`, {
      method: 'POST',
      headers: getArenaAuthHeaders(),
      body: JSON.stringify({ all: true })
    });
    currentNotifications.forEach(n => { n.is_read = true; });
    unreadNotificationsCount = 0;
    updateNotificationBadgeUI();
    renderNotificationsList();
    notifySuccess("Thông báo", "Đã đánh dấu tất cả thông báo là đã đọc.");
  } catch (err) {
    notifyError("Lỗi", "Không thể cập nhật trạng thái thông báo.");
  }
}

async function handleAdminBroadcast(event) {
  if (event) event.preventDefault();
  const titleInp = document.getElementById("broadcast-title");
  const msgInp = document.getElementById("broadcast-message");
  const tabSel = document.getElementById("broadcast-tab");
  const btn = document.getElementById("btn-broadcast-submit");

  const title = (titleInp?.value || "").trim();
  const message = (msgInp?.value || "").trim();
  const linkTab = tabSel?.value || "overview";

  if (!title || !message) {
    notifyWarning("Thiếu thông tin", "Vui lòng nhập cả tiêu đề và nội dung thông báo.");
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Đang gửi...";
  }

  try {
    const res = await fetch(`${API_BASE}/api/admin/notifications/broadcast`, {
      method: 'POST',
      headers: getArenaAuthHeaders(),
      body: JSON.stringify({
        title,
        message,
        event_type: "ANNOUNCEMENT",
        link_tab: linkTab
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Không thể phát thông báo.");

    notifySuccess("Phát thông báo thành công", `Đã gửi thông báo tới toàn thể thí sinh!`);
    if (titleInp) titleInp.value = "";
    if (msgInp) msgInp.value = "";
    fetchNotifications();
  } catch (err) {
    notifyError("Lỗi phát thông báo", err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Gửi thông báo";
    }
  }
}

// Khởi chạy polling kiểm tra thông báo định kỳ mỗi 30 giây
if (!notifPollInterval) {
  notifPollInterval = setInterval(fetchNotifications, 30000);
  setTimeout(fetchNotifications, 1000);
}

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

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

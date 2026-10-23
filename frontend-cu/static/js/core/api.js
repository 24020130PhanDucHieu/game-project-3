// =============================================================================
// FRESHMAN BOT ARENA - JAVASCRIPT APP (VERTICAL SIDEBAR & 5-ROUND MATCH ENGINE)
// Hỗ trợ đa giải đấu, cây sơ đồ nhánh, màn hình nộp code riêng tư, trọng tài tự động
// =============================================================================

const ARENA_HOSTED_API = "https://arena.13.250.49.111.sslip.io";
let arenaSavedAPI = localStorage.getItem("ARENA_API_URL");
// Never send a stored session token to an arbitrary localStorage-controlled host.
if (arenaSavedAPI && ![ARENA_HOSTED_API, window.location.origin].includes(arenaSavedAPI.replace(/\/+$/, ""))) {
  localStorage.removeItem("ARENA_API_URL");
  arenaSavedAPI = null;
}
const API_BASE = arenaSavedAPI || (window.location.hostname.endsWith(".workers.dev") || window.location.hostname.endsWith(".pages.dev") || window.location.origin === "null" || window.location.protocol === "file:" ? ARENA_HOSTED_API : window.location.origin);
const arenaFetch = window.fetch.bind(window);
let arenaServerClock = null;
const arenaPendingWrites = new Map();
function arenaNowSeconds() {
  return arenaServerClock ? (arenaServerClock.epoch + performance.now() - arenaServerClock.tick) / 1000 : Date.now() / 1000;
}
window.fetch = (input, init = {}) => {
  const requestURL = typeof input === "string" ? input : (input.url || input.href || String(input));
  const token = sessionStorage.getItem("arenaSessionToken") || localStorage.getItem("arenaSessionToken");
  if (token && !sessionStorage.getItem("arenaSessionToken")) {
    sessionStorage.setItem("arenaSessionToken", token);
  }
  let url;
  try { url = new URL(requestURL, window.location.href); } catch { return arenaFetch(input, init); }
  if (url.origin !== new URL(API_BASE, window.location.href).origin || !url.pathname.startsWith('/api/')) return arenaFetch(input, init);
  const headers = new Headers(init.headers || (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined));
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const method = (init.method || input?.method || 'GET').toUpperCase();
  const key = method !== 'GET' && typeof init.body !== 'object' ? JSON.stringify([token, method, url.href, init.body, headers.get('X-Submission-Id')]) : '';
  if (key && arenaPendingWrites.has(key)) return arenaPendingWrites.get(key).then(response => response.clone());
  const pending = arenaFetch(input, { ...init, headers }).then((response) => {
    const epoch = Date.parse(response.headers.get('Date') || '');
    if (Number.isFinite(epoch)) arenaServerClock = {epoch, tick: performance.now()};
    if (token && response.status === 401 && !url.pathname.endsWith("/login") && sessionStorage.getItem("arenaSessionToken") === token) {
      sessionStorage.removeItem("arenaSessionToken");
      localStorage.removeItem("arenaSessionToken");
      sessionStorage.removeItem("ARENA_STUDENT_ID");
      sessionStorage.removeItem("ARENA_TEAM_NAME");
      sessionStorage.setItem("ARENA_USER_ROLE", "GUEST");
      sessionStorage.setItem("userRole", "GUEST");
      localStorage.setItem("ARENA_USER_ROLE", "GUEST");
      localStorage.removeItem("ARENA_STUDENT_ID");
      localStorage.removeItem("ARENA_TEAM_NAME");
      window.dispatchEvent(new Event("arena-session-expired"));
    }
    return response;
  });
  if (!key) return pending;
  arenaPendingWrites.set(key, pending);
  return pending.then(response => response.clone()).finally(() => arenaPendingWrites.delete(key));
};

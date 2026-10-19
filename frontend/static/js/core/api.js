// =============================================================================
// FRESHMAN BOT ARENA - JAVASCRIPT APP (VERTICAL SIDEBAR & 5-ROUND MATCH ENGINE)
// Hỗ trợ đa giải đấu, cây sơ đồ nhánh, màn hình nộp code riêng tư, trọng tài tự động
// =============================================================================

const ARENA_HOSTED_API = "https://arena.13.250.49.111.sslip.io";
let arenaSavedAPI = localStorage.getItem("ARENA_API_URL");
if (arenaSavedAPI && arenaSavedAPI.replace(/\/+$/, "") === "https://game-project-3.onrender.com") {
  localStorage.removeItem("ARENA_API_URL");
  arenaSavedAPI = null;
}
const API_BASE = arenaSavedAPI || (window.location.hostname.endsWith(".workers.dev") || window.location.hostname.endsWith(".pages.dev") || window.location.origin === "null" || window.location.protocol === "file:" ? ARENA_HOSTED_API : window.location.origin);
const arenaFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const requestURL = typeof input === "string" ? input : (input.url || input.href || String(input));
  const token = sessionStorage.getItem("arenaSessionToken") || localStorage.getItem("arenaSessionToken");
  if (token && !sessionStorage.getItem("arenaSessionToken")) {
    sessionStorage.setItem("arenaSessionToken", token);
  }
  if (!token || !requestURL.startsWith(API_BASE)) return arenaFetch(input, init);
  const headers = new Headers(init.headers || (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined));
  headers.set("Authorization", `Bearer ${token}`);
  return arenaFetch(input, { ...init, headers }).then((response) => {
    if (response.status === 401 && !requestURL.endsWith("/login") && sessionStorage.getItem("arenaSessionToken") === token) {
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
};

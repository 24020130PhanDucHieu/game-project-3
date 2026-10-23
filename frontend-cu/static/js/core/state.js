// Trạng thái ứng dụng & Phân quyền Role-based Access Control
let currentTournamentId = null;
let currentTournamentData = null;
let currentActiveMatchId = null;
let matchSocket = null;
let matchSocketRetry = null;
// Cookie Helpers để lưu phiên đăng nhập bền vững tuyệt đối qua F5 / reload
function setArenaCookie(name, val, days = 365) {
  try {
    const d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${encodeURIComponent(val)};expires=${d.toUTCString()};path=/;SameSite=Lax`;
  } catch (e) {}
}

function getArenaCookie(name) {
  try {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
  } catch (e) {}
  return "";
}

function clearArenaCookie(name) {
  try {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;SameSite=Lax`;
  } catch (e) {}
}

let currentMatchData = null;
let currentStudioSide = "team_a"; // "team_a" hoặc "team_b"
let currentUserRole = "GUEST"; // "GUEST", "TEAM", "REFEREE", "ADMIN"
let currentAppRole = "GUEST";
let currentTeamStudentId = "";
let currentTeamName = "";
let pendingLoginMatchId = null;
let adminLoginMode = false;
let practiceSimTimer = null;
let practiceSimCancelToken = false;
let allTeamsCache = [];
let isMatchRunning = false;

function saveArenaSessionToken(token) {
  const safeToken = String(token || "");
  if (!safeToken) return;
  sessionStorage.setItem("arenaSessionToken", safeToken);
  localStorage.setItem("arenaSessionToken", safeToken);
}

// =============================================================================

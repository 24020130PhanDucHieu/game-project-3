// All symbols live in templates/partials/icons.html; decorative SVGs keep labels readable.
const ARENA_ICON_NAMES = new Set(["home", "bracket", "chart", "swords", "book", "shield", "user", "users", "bot", "trophy", "medal", "plus", "grid", "upload", "code", "play", "check", "info", "warning", "logout", "sparkles", "clock", "trash", "chevron", "close", "activity", "hand-rock", "hand-paper", "hand-scissors"]);

function arenaIcon(name, extraClass = "") {
  if (!ARENA_ICON_NAMES.has(name)) return "";
  return `<svg class="arena-icon ${escapeHtml(extraClass)}" aria-hidden="true" focusable="false"><use href="#icon-${name}"></use></svg>`;
}

const TEAM_COLOR_PALETTES = [
  "color-red", "color-blue", "color-green", "color-yellow",
  "color-purple", "color-orange", "color-pink", "color-cyan",
  "color-emerald", "color-indigo", "color-amber", "color-rose"
];

function getDynamicTeamColor(teamName, defaultIndex = 0) {
  if (!teamName) return TEAM_COLOR_PALETTES[defaultIndex % TEAM_COLOR_PALETTES.length];
  const lower = teamName.toLowerCase();
  const aliases = [["red", "đỏ"], ["blue", "xanh dương"], ["green", "xanh lá"], ["yellow", "vàng"], ["purple", "tím"], ["orange", "cam"], ["pink", "hồng"], ["cyan", "lam"]];
  const known = aliases.findIndex(words => words.some(word => lower.includes(word)));
  if (known !== -1) return TEAM_COLOR_PALETTES[known];
  let hash = 0;
  for (const character of teamName) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return TEAM_COLOR_PALETTES[Math.abs(hash) % TEAM_COLOR_PALETTES.length];
}

function teamAvatar(name, { small = false, pending = false } = {}) {
  const color = pending ? "color-pending" : getDynamicTeamColor(name);
  return `<span class="team-avatar ${small ? "team-avatar-small" : ""} ${color}">${arenaIcon(pending ? "clock" : "bot")}</span>`;
}

function rankingRows(rows) {
  return rows.map((row, index) => {
    const name = row.bot_name || row.team_name || "Bot";
    const podium = index < 3 ? ` podium-${index + 1}` : "";
    const medal = index < 3 ? arenaIcon("medal") : "";
    return `<tr><td><span class="ranking-position${podium}">${medal}<span>${index + 1}</span></span></td>
      <td><span class="ranking-team">${teamAvatar(name)}<strong>${escapeHtml(name)}</strong></span></td>
      <td class="student-id-code">${escapeHtml(row.student_id || "---")}</td>
      <td class="elo-score-bold" style="text-align:right">${Number(row.elo_score ?? 1200)}</td></tr>`;
  }).join("");
}

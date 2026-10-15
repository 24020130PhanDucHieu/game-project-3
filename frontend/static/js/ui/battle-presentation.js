// Shared, escaped presentation for board pieces, commentary and event logs.
const BATTLE_MOVES = {
  ROCK: { label: "Búa", icon: "hand-rock" },
  PAPER: { label: "Bao", icon: "hand-paper" },
  SCISSORS: { label: "Kéo", icon: "hand-scissors" }
};

function pieceIcon(type) {
  if (!BATTLE_MOVES[String(type).toUpperCase()]) return '<span class="piece-unknown" aria-label="Quân chưa rõ loại">?</span>';
  const move = BATTLE_MOVES[String(type).toUpperCase()] || BATTLE_MOVES.ROCK;
  return arenaIcon(move.icon, "rps-icon");
}

function pieceChip(type) {
  const move = BATTLE_MOVES[String(type).toUpperCase()];
  return move ? `<span class="move-chip">${arenaIcon(move.icon)}<span>${move.label}</span></span>` : '<span class="move-unknown">—</span>';
}

function formatBattleLog(value) {
  const text = String(value ?? "");
  // Replace both historical emoji + Vietnamese labels and engine move tokens.
  const pattern = /(?<![\p{L}\p{N}_])(?:[👊✊✋🖐✌✂🔨🪨]\uFE0F?\s*)?(ROCK|PAPER|SCISSORS|Búa|Bao|Kéo)(?![\p{L}\p{N}_])/giu;
  const names = { ROCK: "ROCK", PAPER: "PAPER", SCISSORS: "SCISSORS", "BÚA": "ROCK", BAO: "PAPER", "KÉO": "SCISSORS" };
  let html = "", offset = 0;
  for (const token of text.matchAll(pattern)) {
    html += escapeHtml(text.slice(offset, token.index)) + pieceChip(names[token[1].toUpperCase()]);
    offset = token.index + token[0].length;
  }
  return html + escapeHtml(text.slice(offset));
}

function setBattleCommentary(element, text) {
  if (element) element.innerHTML = `${arenaIcon("activity", "commentary-icon")}<span>${formatBattleLog(text)}</span>`;
}

function renderLiveAction(match, record, step, index = 0) {
  const message = document.getElementById("realtime-commentary-ticker");
  const caption = document.getElementById("live-action-caption");
  const counter = document.getElementById("realtime-step-count");
  const badge = document.getElementById("realtime-battle-status-badge");
  const running = Boolean(match.battle_running);
  const ready = Boolean(match.all_teams_ready);
  if (badge) {
    badge.className = `live-state-pill ${running ? "is-running" : match.status === "COMPLETED" || match.round_status === "ROUND_FINISHED" ? "is-complete" : "is-waiting"}`;
    badge.textContent = running ? "Đang thực thi" : match.status === "COMPLETED" ? "Đã kết thúc" : match.round_status === "ROUND_FINISHED" ? "Hiệp hoàn tất" : ready ? "Sẵn sàng" : "Chờ nộp bot";
  }
  if (caption) caption.textContent = step && !running ? `Hiệp ${record.round_number} · ${step.turn_label || `Nước ${index + 1}`}` : `Hiệp ${match.current_round_idx || 1}`;
  if (counter) counter.textContent = step && !running ? `Bước ${index + 1} / ${record.board_steps.length}` : "";
  if (message) {
    const text = running ? "Hai bot đang thực thi. Chờ kết quả từ máy chủ…" : step ? step.log || record.win_reason : ready ? "Hai đội đã sẵn sàng. Bắt đầu hiệp để khai hỏa." : "Chờ hai đội nộp bot hợp lệ để bắt đầu hiệp đấu.";
    message.innerHTML = formatBattleLog(String(text).replace(/^Lượt\s+\d+\s*:\s*/i, ""));
  }
  const red = document.getElementById("live-action-red-count"), blue = document.getElementById("live-action-blue-count");
  if (red) red.textContent = `${step?.red_alive ?? 9} quân`;
  if (blue) blue.textContent = `${step?.blue_alive ?? 9} quân`;
}

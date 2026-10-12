// Replay state is shared with the replay viewer and modal controls.
let currentReplayRecord = null;
let currentReplayStepIdx = 0;
let replayPlayInterval = null;

function logEmpty(icon, title, description) {
  return `<div class="log-empty"><span class="log-empty-icon">${arenaIcon(icon)}</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p></div>`;
}

function replaceLogContent(element, html) {
  if (!element || element.arenaLogHTML === html) return;
  const pane = element.closest(".log-pane");
  const previousScroll = pane?.scrollTop || 0;
  const followLatest = pane && pane.scrollHeight > pane.clientHeight && pane.scrollHeight - pane.scrollTop - pane.clientHeight < 28;
  element.innerHTML = html;
  element.arenaLogHTML = html;
  if (pane) pane.scrollTop = followLatest ? pane.scrollHeight : previousScroll;
}

function renderCategorizedLogs(record, visibleStep = null) {
  const moveList = document.getElementById("move-log-list");
  const botList = document.getElementById("bot-log-list");
  const systemList = document.getElementById("system-log-list");
  const context = document.getElementById("match-log-context");
  const round = document.getElementById("match-log-round");

  if (!record) {
    if (context) context.textContent = "Theo dõi nước đi, kết quả thực thi bot và sự kiện của hiệp đấu.";
    if (round) round.textContent = "Chờ hiệp đấu";
    replaceLogContent(moveList, logEmpty("swords", "Chưa có nước đi", "Diễn biến sẽ xuất hiện khi hai bot bắt đầu thi đấu."));
    replaceLogContent(botList, logEmpty("code", "Chưa thực thi bot", "Nộp bot hợp lệ để sẵn sàng cho hiệp đấu."));
    replaceLogContent(systemList, logEmpty("shield", "Hệ thống sẵn sàng", "Các sự kiện của hiệp đấu sẽ được lưu tại đây."));
    return;
  }

  const allMoves = record.move_logs || (record.board_steps || []).map(step => ({ ...step, is_clash: Boolean(step.clash_event) }));
  const moves = visibleStep === null ? allMoves : allMoves.slice(0, visibleStep + 1);
  if (context) context.textContent = `${moves.length} / ${allMoves.length} diễn biến · Mỗi nước đi được lưu theo hiệp đấu.`;
  if (round) round.textContent = `Hiệp ${record.round_number}`;
  replaceLogContent(moveList, moves.length ? moves.map((move, index) => `
    <article class="event-row ${move.is_clash ? "event-clash" : ""}">
      <span class="event-marker">${move.is_clash ? arenaIcon("swords") : index + 1}</span>
      <div class="event-body">
        <div class="event-heading"><strong>${escapeHtml(move.turn_label || `Nước ${index + 1}`)}</strong>${move.is_clash ? '<span class="event-tag">Giao chiến</span>' : ""}</div>
        <p class="event-message">${formatBattleLog(String(move.log || "").replace(/^Lượt\s+\d+\s*:\s*/i, ""))}</p>
        <div class="event-survivors"><span class="red"><i class="team-color-dot"></i>Đỏ ${Number(move.red_alive ?? 0)}</span><span class="blue"><i class="team-color-dot"></i>Xanh ${Number(move.blue_alive ?? 0)}</span></div>
      </div>
    </article>`).join("") : logEmpty("swords", "Chưa có nước đi", "Đang chờ diễn biến của hiệp đấu."));

  const bots = record.bot_logs || [];
  replaceLogContent(botList, bots.length ? bots.map(bot => {
    const side = bot.side === "team_a" ? "red" : "blue";
    const success = ["EXECUTED", "SUCCESS", "OK"].includes(bot.status);
    return `<article class="event-row event-bot ${side}">
      <span class="event-marker">${arenaIcon("bot")}</span><div class="event-body">
        <div class="event-heading"><strong>${escapeHtml(bot.team_name || (side === "red" ? "Đội Đỏ" : "Đội Xanh"))}</strong><span class="event-status ${success ? "status-ok" : "status-warning"}">${success ? arenaIcon("check") : arenaIcon("info")}${escapeHtml(success ? "Đã thực thi" : bot.status || "Chưa xác định")}</span></div>
        <p class="event-message">${formatBattleLog(bot.log)}</p>
        <div class="event-meta"><span>${escapeHtml(bot.lang || "")}</span>${bot.submission_id ? `<code>${escapeHtml(bot.submission_id)}</code>` : ""}</div>
      </div></article>`;
  }).join("") : logEmpty("code", "Chưa có kết quả thực thi", "Kết quả sandbox sẽ được cập nhật khi hiệp hoàn tất."));

  const events = record.system_logs || [];
  replaceLogContent(systemList, events.length ? events.map(event => {
    const text = String(event);
    const time = text.match(/^\[(\d{2}:\d{2}:\d{2})\]\s*/);
    return `<article class="event-row event-system"><span class="event-marker">${arenaIcon("shield")}</span><div class="event-body">${time ? `<time class="event-time">${time[1]}</time>` : ""}<p class="event-message">${formatBattleLog(time ? text.slice(time[0].length) : text)}</p></div></article>`;
  }).join("") : logEmpty("shield", "Chưa có sự kiện", "Các sự kiện của hiệp đấu sẽ được lưu tại đây."));
}

function setupLogTabs() {
  const tabs = [...document.querySelectorAll(".log-tab-btn")];
  const activate = tab => {
    tabs.forEach(button => {
      const active = button === tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll(".log-pane").forEach(pane => pane.classList.toggle("active", pane.id === tab.dataset.logTab));
    saveArenaViewState({ logTab: tab.dataset.logTab });
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activate(tab));
    tab.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const target = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      activate(tabs[target]);
      tabs[target].focus();
    });
  });
}

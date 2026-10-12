// =============================================================================
// REPLAY VIEWER ENGINE & CATEGORIZED LOGS & KAGGLE SUBMISSIONS
// =============================================================================
let currentReplayRecord = null;
let currentReplayStepIdx = 0;
let replayPlayInterval = null;

function renderCategorizedLogs(lastRecord) {
  const moveList = document.getElementById("move-log-list");
  const botList = document.getElementById("bot-log-list");
  const systemList = document.getElementById("system-log-list");

  if (!lastRecord) {
    if (moveList) moveList.innerHTML = `<div class="log-empty-msg">Chưa có nước đi nào. Chờ khai hỏa trận đấu...</div>`;
    if (botList) botList.innerHTML = `<div class="log-empty-msg">Chưa có dữ liệu thực thi bot trong sandbox...</div>`;
    if (systemList) systemList.innerHTML = `<div class="log-empty-msg">Hệ thống đang ở trạng thái chờ bài nộp...</div>`;
    return;
  }

  if (moveList && lastRecord.move_logs) {
    moveList.innerHTML = lastRecord.move_logs.map(m =>
      `<div class="log-item-line ${m.is_clash ? 'clash' : ''}">[${m.turn_label}] ${escapeHtml(m.log)} (Đỏ: ${m.red_alive} vs Xanh: ${m.blue_alive})</div>`
    ).join("");
  }

  if (botList && lastRecord.bot_logs) {
    botList.innerHTML = lastRecord.bot_logs.map(b =>
      `<div class="log-item-line ${b.side === 'team_a' ? 'bot-a' : 'bot-b'}">[${b.side === 'team_a' ? 'ĐỘI ĐỎ' : 'ĐỘI XANH'}] [${b.status}] ${escapeHtml(b.log)}</div>`
    ).join("");
  }

  if (systemList && lastRecord.system_logs) {
    systemList.innerHTML = lastRecord.system_logs.map(s =>
      `<div class="log-item-line system">${escapeHtml(s)}</div>`
    ).join("");
  }
}


function setupLogTabs() {
  const tabs = document.querySelectorAll(".log-tab-btn");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".log-pane").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      const targetPane = document.getElementById(tab.dataset.logTab);
      if (targetPane) targetPane.classList.add("active");
      saveArenaViewState({ logTab:tab.dataset.logTab });
    });
  });
}

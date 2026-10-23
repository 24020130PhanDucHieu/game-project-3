function renderRoundHistoryTable(historyList) {
  const tbody = document.getElementById("tbody-round-history");
  if (!tbody) return;
  if (!historyList || historyList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Chưa đấu round nào trong trận này.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  historyList.forEach(r => {
    const tr = document.createElement("tr");

    const moveAIcon = pieceChip(r.team_a_move);
    const moveBIcon = pieceChip(r.team_b_move);

    let winText = "Hòa";
    if (r.winner === "team_a") winText = `<span class="text-danger" style="font-weight:700">Đội Đỏ Thắng</span>`;
    else if (r.winner === "team_b") winText = `<span class="text-primary" style="font-weight:700">Đội Xanh Thắng</span>`;

    tr.innerHTML = `
      <td><strong>Round ${r.round_number}</strong></td>
      <td>${moveAIcon}</td>
      <td>${moveBIcon}</td>
      <td>${winText}</td>
      <td style="font-size:12.5px">${formatBattleLog(r.log)}</td>
      <td>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn btn-sm btn-primary btn-replay-round" data-round="${r.round_number}">
             Xem Replay
          </button>
          <button class="btn btn-sm btn-outline btn-view-round-code" data-round="${r.round_number}">
            Mã Lệnh
          </button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Gắn sự kiện xem Replay từng round
  document.querySelectorAll(".btn-replay-round").forEach(btn => {
    btn.addEventListener("click", () => {
      const rNum = parseInt(btn.dataset.round);
      if (currentActiveMatchId) openReplayModal(currentActiveMatchId, rNum);
    });
  });

  // Gắn sự kiện xem code từng round
  document.querySelectorAll(".btn-view-round-code").forEach(btn => {
    btn.addEventListener("click", () => {
      const rNum = parseInt(btn.dataset.round);
      const record = historyList.find(h => h.round_number === rNum);
      if (record) openCodeViewerModal(record);
    });
  });
}


function openReplayModal(matchId, roundNum) {
  if (!currentTournamentData || !matchId) return;
  const match = currentTournamentData.matches[matchId];
  if (!match) return;

  const roundRec = match.rounds_history.find(r => r.round_number === roundNum);
  if (!roundRec || !roundRec.board_steps || roundRec.board_steps.length === 0) {
    notifyWarning("Không Tìm Thấy Replay", `Không có dữ liệu diễn biến bàn cờ cho Round ${roundNum}!`);
    return;
  }

  currentReplayRecord = roundRec;
  const replayState = readArenaViewState();
  currentReplayStepIdx = replayState.modalReplayRound === roundNum ? (replayState.modalReplayStep || 0) : 0;
  clearInterval(replayPlayInterval);
  replayPlayInterval = null;

  const modal = document.getElementById("modal-match-replay");
  const title = document.getElementById("replay-modal-title");
  const subtitle = document.getElementById("replay-modal-subtitle");
  const nameRed = document.getElementById("replay-name-red");
  const nameBlue = document.getElementById("replay-name-blue");
  const slider = document.getElementById("replay-step-slider");

  if (title) title.textContent = `Xem Lại Trận Đấu: Round ${roundNum} (${match.title.toUpperCase()})`;
  if (subtitle) subtitle.textContent = `Kết quả: ${roundRec.win_reason}`;
  if (nameRed) nameRed.textContent = roundRec.team_a_name;
  if (nameBlue) nameBlue.textContent = roundRec.team_b_name;

  if (slider) {
    slider.min = 0;
    slider.max = roundRec.board_steps.length - 1;
    slider.value = 0;
  }

  renderReplayStep(currentReplayStepIdx);
  modal.style.display = "flex";
}

function renderReplayStep(stepIdx) {
  if (!currentReplayRecord || !currentReplayRecord.board_steps) return;
  const steps = currentReplayRecord.board_steps;
  if (stepIdx < 0) stepIdx = 0;
  if (stepIdx >= steps.length) stepIdx = steps.length - 1;
  currentReplayStepIdx = stepIdx;
  saveArenaViewState({ modalReplayRound: currentReplayRecord.round_number, modalReplayStep: stepIdx });

  const step = steps[stepIdx];
  const boardEl = document.getElementById("replay-chessboard-9x9");
  if (!boardEl) return;

  if (boardEl.children.length !== 81) {
    boardEl.innerHTML = "";
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = document.createElement("div");
        cell.className = "board-cell";
        cell.dataset.col = c;
        cell.dataset.row = r;
        if ((r + c) % 2 === 1) cell.classList.add("cell-alt");
        if (c === 8 && r === 0) cell.classList.add("cell-target-red");
        if (c === 0 && r === 8) cell.classList.add("cell-target-blue");
        boardEl.appendChild(cell);
      }
    }
  }

  const cells = boardEl.querySelectorAll(".board-cell");
  cells.forEach(cell => {
    cell.innerHTML = "";
    cell.classList.remove("cell-clash");
  });

  let blueAlive = 0;
  if (step.blue_pieces) {
    step.blue_pieces.forEach(p => {
      if (!p.alive) return;
      blueAlive++;
      const cell = boardEl.querySelector(`.board-cell[data-col="${p.col}"][data-row="${p.row}"]`);
      if (cell) {
        const pieceEl = document.createElement("div");
        pieceEl.className = "board-piece piece-blue";
        pieceEl.innerHTML = pieceIcon(p.type);
        pieceEl.setAttribute("role", "img");
        pieceEl.setAttribute("aria-label", PIECE_ICONS[p.type] || "B\u00faa");
        cell.appendChild(pieceEl);
      }
    });
  }

  let redAlive = 0;
  if (step.red_pieces) {
    step.red_pieces.forEach(p => {
      if (!p.alive) return;
      redAlive++;
      const cell = boardEl.querySelector(`.board-cell[data-col="${p.col}"][data-row="${p.row}"]`);
      if (cell) {
        const pieceEl = document.createElement("div");
        pieceEl.className = "board-piece piece-red";
        pieceEl.innerHTML = pieceIcon(p.type);
        pieceEl.setAttribute("role", "img");
        pieceEl.setAttribute("aria-label", PIECE_ICONS[p.type] || "B\u00faa");
        cell.appendChild(pieceEl);
      }
    });
  }

  if (step.clash_event && typeof step.clash_event.col === "number") {
    const clashCell = boardEl.querySelector(`.board-cell[data-col="${step.clash_event.col}"][data-row="${step.clash_event.row}"]`);
    if (clashCell) clashCell.classList.add("cell-clash");
  }

  const indicator = document.getElementById("replay-step-indicator");
  const countRed = document.getElementById("replay-count-red");
  const countBlue = document.getElementById("replay-count-blue");
  const ticker = document.getElementById("replay-commentary-ticker");
  const slider = document.getElementById("replay-step-slider");
  const sliderLabel = document.getElementById("replay-slider-label");

  if (indicator) indicator.textContent = `BƯỚC ${stepIdx + 1} / ${steps.length}`;
  if (countRed) countRed.textContent = `${redAlive}/9 quân`;
  if (countBlue) countBlue.textContent = `${blueAlive}/9 quân`;
  if (ticker) setBattleCommentary(ticker, step.log || step.turn_label);
  if (slider) slider.value = stepIdx;
  if (sliderLabel) sliderLabel.textContent = `Bước: ${stepIdx + 1} / ${steps.length}`;
}

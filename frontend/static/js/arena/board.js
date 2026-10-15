function initChessboardGrid() {
  const boardEl = document.getElementById("chessboard-9x9");
  if (!boardEl) return;
  boardEl.innerHTML = "";

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement("div");
      cell.className = "board-cell";
      cell.dataset.col = c;
      cell.dataset.row = r;

      // Ô cờ xen kẽ tạo hiệu ứng bàn cờ thanh lịch
      if ((r + c) % 2 === 1) {
        cell.classList.add("cell-alt");
      }

      // Cứ điểm đích của Đội Đỏ [col 8, row 0] (góc trên bên phải)
      if (c === 8 && r === 0) {
        cell.classList.add("cell-target-red");
        cell.title = "Cứ điểm Đích của Đội Đỏ [8, 0]";
      }
      // Cứ điểm đích của Đội Xanh [col 0, row 8] (góc dưới bên trái)
      if (c === 0 && r === 8) {
        cell.classList.add("cell-target-blue");
        cell.title = "Cứ điểm Đích của Đội Xanh [0, 8]";
      }

      boardEl.appendChild(cell);
    }
  }
}

function getInitialBoardPieces(ruleId = "STAGE_1_STANDARD") {
  const counts = {
    STAGE_2_MUTATED: [5, 2, 2],
    RULE_MUTATED_FOG: [5, 2, 2],
    STAGE_4_FINALS: [2, 4, 3]
  }[ruleId];
  const moves = ["ROCK", "PAPER", "SCISSORS"];
  const typesPattern = counts
    ? moves.flatMap((type, index) => Array(counts[index]).fill(type))
    : [...moves, ...moves, ...moves];
  const red = typesPattern.map((t, i) => ({ id: `r_${i}`, col: i, row: 7, type: t, alive: true }));
  const blue = typesPattern.map((t, i) => ({ id: `b_${i}`, col: i, row: 1, type: t, alive: true }));
  return { red, blue };
}

function renderChessboard(redPieces, bluePieces, clashEvent = null) {
  const boardEl = document.getElementById("chessboard-9x9");
  if (!boardEl) return;

  if (boardEl.children.length !== 81) {
    initChessboardGrid();
  }

  const cells = boardEl.querySelectorAll(".board-cell");
  cells.forEach(cell => {
    cell.innerHTML = "";
    cell.classList.remove("cell-clash");
  });

  // Render quân Đội Xanh
  let blueAliveCount = 0;
  if (bluePieces && Array.isArray(bluePieces)) {
    bluePieces.forEach(p => {
      if (!p.alive) return;
      blueAliveCount++;
      const cell = boardEl.querySelector(`.board-cell[data-col="${p.col}"][data-row="${p.row}"]`);
      if (cell) {
        const pieceEl = document.createElement("div");
        pieceEl.className = "board-piece piece-blue";
        pieceEl.innerHTML = pieceIcon(p.type);
        pieceEl.setAttribute("role", "img");
        pieceEl.setAttribute("aria-label", PIECE_ICONS[p.type] || "B\u00faa");
        pieceEl.title = `Quân Xanh: ${p.type} (${p.col}, ${p.row})`;
        cell.appendChild(pieceEl);
      }
    });
  }

  // Render quân Đội Đỏ
  let redAliveCount = 0;
  if (redPieces && Array.isArray(redPieces)) {
    redPieces.forEach(p => {
      if (!p.alive) return;
      redAliveCount++;
      const cell = boardEl.querySelector(`.board-cell[data-col="${p.col}"][data-row="${p.row}"]`);
      if (cell) {
        const pieceEl = document.createElement("div");
        pieceEl.className = "board-piece piece-red";
        pieceEl.innerHTML = pieceIcon(p.type);
        pieceEl.setAttribute("role", "img");
        pieceEl.setAttribute("aria-label", PIECE_ICONS[p.type] || "B\u00faa");
        pieceEl.title = `Quân Đỏ: ${p.type} (${p.col}, ${p.row})`;
        cell.appendChild(pieceEl);
      }
    });
  }

  // Cập nhật số quân còn lại trên top bar
  const countRedEl = document.getElementById("board-count-red");
  const countBlueEl = document.getElementById("board-count-blue");
  if (countRedEl) countRedEl.textContent = `${redAliveCount}/9 quân`;
  if (countBlueEl) countBlueEl.textContent = `${blueAliveCount}/9 quân`;

  // Hiệu ứng lóe sáng tại ô va chạm / ăn quân
  if (clashEvent && typeof clashEvent.col === "number" && typeof clashEvent.row === "number") {
    const clashCell = boardEl.querySelector(`.board-cell[data-col="${clashEvent.col}"][data-row="${clashEvent.row}"]`);
    if (clashCell) {
      clashCell.classList.add("cell-clash");
    }
  }
}

// BÀN ĐẤU THỜI GIAN THỰC REALTIME DUEL (DÀNH RIÊNG CHO ADMIN)
function initRealtimeChessboardGrid() {
  const boardEl = document.getElementById("realtime-chessboard-9x9");
  if (!boardEl) return;
  boardEl.innerHTML = "";

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement("div");
      cell.className = "board-cell";
      cell.dataset.col = c;
      cell.dataset.row = r;

      if ((r + c) % 2 === 1) cell.classList.add("cell-alt");
      if (c === 8 && r === 0) {
        cell.classList.add("cell-target-red");
        cell.title = "Cứ điểm Đích của Đội Đỏ [8, 0]";
      }
      if (c === 0 && r === 8) {
        cell.classList.add("cell-target-blue");
        cell.title = "Cứ điểm Đích của Đội Xanh [0, 8]";
      }
      boardEl.appendChild(cell);
    }
  }
}

function renderRealtimeChessboard(redPieces, bluePieces, clashEvent = null) {
  const boardEl = document.getElementById("realtime-chessboard-9x9");
  if (!boardEl) return;

  if (boardEl.children.length !== 81) {
    initRealtimeChessboardGrid();
  }

  const cells = boardEl.querySelectorAll(".board-cell");
  cells.forEach(cell => {
    cell.innerHTML = "";
    cell.classList.remove("cell-clash");
  });

  if (bluePieces && Array.isArray(bluePieces)) {
    bluePieces.forEach(p => {
      if (!p.alive) return;
      const cell = boardEl.querySelector(`.board-cell[data-col="${p.col}"][data-row="${p.row}"]`);
      if (cell) {
        const pieceEl = document.createElement("div");
        pieceEl.className = "board-piece piece-blue";
        pieceEl.innerHTML = pieceIcon(p.type);
        pieceEl.setAttribute("role", "img");
        pieceEl.setAttribute("aria-label", PIECE_ICONS[p.type] || "B\u00faa");
        pieceEl.title = `Quân Xanh: ${p.type} (${p.col}, ${p.row})`;
        cell.appendChild(pieceEl);
      }
    });
  }

  if (redPieces && Array.isArray(redPieces)) {
    redPieces.forEach(p => {
      if (!p.alive) return;
      const cell = boardEl.querySelector(`.board-cell[data-col="${p.col}"][data-row="${p.row}"]`);
      if (cell) {
        const pieceEl = document.createElement("div");
        pieceEl.className = "board-piece piece-red";
        pieceEl.innerHTML = pieceIcon(p.type);
        pieceEl.setAttribute("role", "img");
        pieceEl.setAttribute("aria-label", PIECE_ICONS[p.type] || "B\u00faa");
        pieceEl.title = `Quân Đỏ: ${p.type} (${p.col}, ${p.row})`;
        cell.appendChild(pieceEl);
      }
    });
  }

  if (clashEvent && typeof clashEvent.col === "number" && typeof clashEvent.row === "number") {
    const clashCell = boardEl.querySelector(`.board-cell[data-col="${clashEvent.col}"][data-row="${clashEvent.row}"]`);
    if (clashCell) clashCell.classList.add("cell-clash");
  }
}

function applyMysteryTiles(boardEl, mysteryTiles) {
  if (!boardEl) return;
  // Xóa các ô đặc biệt cũ nếu có
  boardEl.querySelectorAll(".cell-evolve, .cell-portal, .cell-trap").forEach(el => {
    el.classList.remove("cell-evolve", "cell-portal", "cell-trap");
    if (!el.classList.contains("cell-target-red") && !el.classList.contains("cell-target-blue")) {
      el.removeAttribute("title");
    }
  });

  const evolveList = mysteryTiles?.evolve || [[4, 4]];
  for (const item of evolveList) {
    const c = Array.isArray(item) ? item[0] : item.col;
    const r = Array.isArray(item) ? item[1] : item.row;
    const cell = boardEl.querySelector(`.board-cell[data-col="${c}"][data-row="${r}"]`);
    if (cell && !cell.classList.contains("cell-target-red") && !cell.classList.contains("cell-target-blue")) {
      cell.classList.add("cell-evolve");
      cell.title = `Ô Tiến Hóa [${c}, ${r}]: Đổi hệ Kéo ➔ Búa ➔ Bao ➔ Kéo`;
    }
  }

  const portalList = mysteryTiles?.portals || [[[2, 2], [6, 6]], [[2, 6], [6, 2]]];
  for (const pair of portalList) {
    const p1 = pair[0], p2 = pair[1];
    const cell1 = boardEl.querySelector(`.board-cell[data-col="${p1[0]}"][data-row="${p1[1]}"]`);
    const cell2 = boardEl.querySelector(`.board-cell[data-col="${p2[0]}"][data-row="${p2[1]}"]`);
    if (cell1 && !cell1.classList.contains("cell-target-red") && !cell1.classList.contains("cell-target-blue")) {
      cell1.classList.add("cell-portal");
      cell1.title = `Cổng Dịch Chuyển Không Gian: Nhảy tức thì tới [${p2[0]}, ${p2[1]}]`;
    }
    if (cell2 && !cell2.classList.contains("cell-target-red") && !cell2.classList.contains("cell-target-blue")) {
      cell2.classList.add("cell-portal");
      cell2.title = `Cổng Dịch Chuyển Không Gian: Nhảy tức thì tới [${p1[0]}, ${p1[1]}]`;
    }
  }

  const trapList = mysteryTiles?.traps || [[3, 4], [5, 4], [4, 1], [4, 7]];
  for (const item of trapList) {
    const c = Array.isArray(item) ? item[0] : item.col;
    const r = Array.isArray(item) ? item[1] : item.row;
    const cell = boardEl.querySelector(`.board-cell[data-col="${c}"][data-row="${r}"]`);
    if (cell && !cell.classList.contains("cell-target-red") && !cell.classList.contains("cell-target-blue")) {
      cell.classList.add("cell-trap");
      cell.title = `Ô Bẫy Mìn Ẩn [${c}, ${r}]: Kích nổ loại bỏ quân dẫm phải`;
    }
  }
}

function initChessboardGrid(mysteryTiles = null) {
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
  applyMysteryTiles(boardEl, mysteryTiles);
}

function getInitialBoardPieces(ruleId = "STAGE_1_STANDARD") {
  const counts = {
    STAGE_2_MUTATED: [5, 2, 2],
    RULE_MUTATED_FOG: [5, 2, 2],
    STAGE_4_FINALS: [2, 4, 3]
  }[ruleId];
  const moves = ["ROCK", "PAPER", "SCISSORS"];
  let typesPattern;
  if (ruleId === "RULE_SPECIAL_TILES" || (typeof ruleBits === "function" && (ruleBits(ruleId) & 8))) {
    typesPattern = ["ROCK", "PAPER", "SCISSORS", "ROCK", "JOKER", "PAPER", "SCISSORS", "ROCK", "PAPER"];
  } else if (/^COMBO_[13579]$/.test(ruleId) || /^COMBO_1[135]$/.test(ruleId)) {
    typesPattern = Array(9).fill('PENDING');
  } else {
    typesPattern = counts
      ? moves.flatMap((type, index) => Array(counts[index]).fill(type))
      : [...moves, ...moves, ...moves];
  }
  const red = typesPattern.map((t, i) => ({ id: `r_${i}`, col: i, row: 7, type: t, alive: true, ...(t === "JOKER" ? { steps_left: 5 } : {}) }));
  const blue = typesPattern.map((t, i) => ({ id: `b_${i}`, col: i, row: 1, type: t, alive: true, ...(t === "JOKER" ? { steps_left: 5 } : {}) }));
  return { red, blue };
}

function renderChessboard(redPieces, bluePieces, clashEvent = null, mysteryTiles = null) {
  const match = currentTournamentData?.matches?.[currentActiveMatchId] || currentMatchData;
  const rule = currentTournamentData?.stage_rules?.[match?.round_level]?.rule_id || currentTournamentData?.stage_rule;
  if (currentAppRole === 'TEAM' && (ruleBits(rule) & 4)) {
    const mine = String(currentTeamStudentId || '').trim().toUpperCase();
    const hide = pieces => pieces?.map(piece => ({...piece, type:'UNKNOWN'}));
    if (!mine || String(match?.team_a?.student_id).trim().toUpperCase() !== mine) redPieces=hide(redPieces);
    if (!mine || String(match?.team_b?.student_id).trim().toUpperCase() !== mine) bluePieces=hide(bluePieces);
  }
  const boardEl = document.getElementById("chessboard-9x9");
  if (!boardEl) return;

  if (boardEl.children.length !== 81) {
    initChessboardGrid(mysteryTiles);
  } else if (mysteryTiles) {
    applyMysteryTiles(boardEl, mysteryTiles);
  }

  updateBoardPieces(boardEl, redPieces, bluePieces, clashEvent);
  const redAliveCount = (redPieces || []).filter(p => p.alive).length;
  const blueAliveCount = (bluePieces || []).filter(p => p.alive).length;

  // Cập nhật số quân còn lại trên top bar
  const countRedEl = document.getElementById("board-count-red");
  const countBlueEl = document.getElementById("board-count-blue");
  if (countRedEl) countRedEl.textContent = `${redAliveCount}/9 quân`;
  if (countBlueEl) countBlueEl.textContent = `${blueAliveCount}/9 quân`;

  // Hiệu ứng lóe sáng tại ô va chạm / kích hoạt ô đặc biệt
  boardEl.querySelectorAll('.cell-clash, .cell-trap-explode, .cell-warp-active, .cell-evolve-active').forEach(cell => {
    cell.classList.remove('cell-clash', 'cell-trap-explode', 'cell-warp-active', 'cell-evolve-active');
  });

  if (clashEvent && typeof clashEvent.col === "number" && typeof clashEvent.row === "number") {
    const clashCell = boardEl.querySelector(`.board-cell[data-col="${clashEvent.col}"][data-row="${clashEvent.row}"]`);
    if (clashCell) {
      if (clashEvent.type === 'TRAP') {
        clashCell.classList.add('cell-trap-explode');
      } else if (clashEvent.type === 'WARP') {
        clashCell.classList.add('cell-warp-active');
        if (typeof clashEvent.from_col === "number" && typeof clashEvent.from_row === "number") {
          const fromCell = boardEl.querySelector(`.board-cell[data-col="${clashEvent.from_col}"][data-row="${clashEvent.from_row}"]`);
          if (fromCell) fromCell.classList.add('cell-warp-active');
        }
      } else if (clashEvent.type === 'EVOLVE') {
        clashCell.classList.add('cell-evolve-active');
      } else {
        clashCell.classList.add('cell-clash');
      }
    }
  }
}

// BÀN ĐẤU THỜI GIAN THỰC REALTIME DUEL (DÀNH RIÊNG CHO ADMIN)
function initRealtimeChessboardGrid(mysteryTiles = null) {
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
  applyMysteryTiles(boardEl, mysteryTiles);
}

function renderRealtimeChessboard(redPieces, bluePieces, clashEvent = null, mysteryTiles = null) {
  const boardEl = document.getElementById("realtime-chessboard-9x9");
  if (!boardEl) return;

  if (boardEl.children.length !== 81) {
    initRealtimeChessboardGrid(mysteryTiles);
  } else if (mysteryTiles) {
    applyMysteryTiles(boardEl, mysteryTiles);
  }

  updateBoardPieces(boardEl, redPieces, bluePieces, clashEvent);
}

function updateBoardPieces(board, red, blue, clash) {
  const existing = new Map(Array.from(board.querySelectorAll('.board-piece'), el => [el.dataset.key, el]));
  for (const [color, pieces] of [['blue', blue], ['red', red]]) {
    for (const [i, p] of (pieces || []).entries()) {
      if (!p.alive) continue;
      const cell = board.children[p.row * 9 + p.col];
      if (!cell) continue;
      const key = `${color}:${p.id ?? i}`;
      let node = existing.get(key);
      existing.delete(key);
      if (!node) {
        node = document.createElement('div'); node.dataset.key = key;
        node.className = `board-piece piece-${color}`; node.setAttribute('role', 'img');
      }
      if (node.dataset.type !== p.type) {
        node.dataset.type = p.type; node.innerHTML = pieceIcon(p.type);
        node.setAttribute('aria-label', PIECE_ICONS[p.type] || '?');
      }
      node.title = `${color === 'red' ? 'Đỏ' : 'Xanh'}: ${p.type} (${p.col}, ${p.row})${p.steps_left !== undefined ? ` · ${p.steps_left}/5 bước` : ''}`;
      if (node.parentNode !== cell) {
        const previous = node.parentElement;
        const dx = previous ? previous.offsetLeft - cell.offsetLeft : 0;
        const dy = previous ? previous.offsetTop - cell.offsetTop : 0;
        node.getAnimations().forEach(animation => animation.cancel());
        cell.appendChild(node);
        if (previous && (dx || dy) && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          node.animate([{transform:`translate(${dx}px, ${dy}px)`}, {transform:'translate(0, 0)'}], {duration:150, easing:'ease-out'});
        }
      }
    }
  }
  existing.forEach(node => node.remove());
  const clashCell = clash ? board.children[clash.row * 9 + clash.col] : null;
  board.querySelectorAll('.cell-clash, .cell-trap-explode, .cell-warp-active, .cell-evolve-active').forEach(cell => {
    if (cell !== clashCell) {
      cell.classList.remove('cell-clash', 'cell-trap-explode', 'cell-warp-active', 'cell-evolve-active');
    }
  });
  if (clashCell && clash) {
    if (clash.type === 'TRAP') {
      clashCell.classList.add('cell-trap-explode');
    } else if (clash.type === 'WARP') {
      clashCell.classList.add('cell-warp-active');
    } else if (clash.type === 'EVOLVE') {
      clashCell.classList.add('cell-evolve-active');
    } else {
      clashCell.classList.add('cell-clash');
    }
  }
}

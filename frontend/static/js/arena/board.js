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

      // Ô Tiến Hóa (Evolve Tile) tại trung tâm [4, 4]
      if (c === 4 && r === 4) {
        cell.classList.add("cell-evolve");
        cell.title = "Ô Tiến Hóa [4, 4]: Đổi hệ Kéo ➔ Búa ➔ Bao ➔ Kéo";
      }

      // Ô Cổng Dịch Chuyển (Portal / Warp) đối xứng [2, 2] <-> [6, 6] và [2, 6] <-> [6, 2]
      if ((c === 2 && r === 2) || (c === 6 && r === 6)) {
        cell.classList.add("cell-portal");
        cell.title = "Cổng Dịch Chuyển Không Gian: Nhảy tức thì giữa [2, 2] ⟷ [6, 6]";
      }
      if ((c === 2 && r === 6) || (c === 6 && r === 2)) {
        cell.classList.add("cell-portal");
        cell.title = "Cổng Dịch Chuyển Không Gian: Nhảy tức thì giữa [2, 6] ⟷ [6, 2]";
      }

      // Ô Bẫy / Mìn (Trap Tile) ẩn tại các vị trí xung yếu
      if ((c === 3 && r === 4) || (c === 5 && r === 4) || (c === 4 && r === 1) || (c === 4 && r === 7)) {
        cell.classList.add("cell-trap");
        cell.title = "Ô Bẫy Mìn Ẩn: Kích nổ loại bỏ quân dẫm phải";
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

function renderChessboard(redPieces, bluePieces, clashEvent = null) {
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
    initChessboardGrid();
  }

  updateBoardPieces(boardEl, redPieces, bluePieces, clashEvent);
  const redAliveCount = (redPieces || []).filter(p => p.alive).length;
  const blueAliveCount = (bluePieces || []).filter(p => p.alive).length;

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

      // Ô Tiến Hóa tại trung tâm [4, 4]
      if (c === 4 && r === 4) {
        cell.classList.add("cell-evolve");
        cell.title = "Ô Tiến Hóa [4, 4]: Đổi hệ Kéo ➔ Búa ➔ Bao ➔ Kéo";
      }

      // Ô Cổng Dịch Chuyển đối xứng
      if ((c === 2 && r === 2) || (c === 6 && r === 6)) {
        cell.classList.add("cell-portal");
        cell.title = "Cổng Dịch Chuyển Không Gian: Nhảy tức thì giữa [2, 2] ⟷ [6, 6]";
      }
      if ((c === 2 && r === 6) || (c === 6 && r === 2)) {
        cell.classList.add("cell-portal");
        cell.title = "Cổng Dịch Chuyển Không Gian: Nhảy tức thì giữa [2, 6] ⟷ [6, 2]";
      }

      // Ô Bẫy / Mìn ẩn
      if ((c === 3 && r === 4) || (c === 5 && r === 4) || (c === 4 && r === 1) || (c === 4 && r === 7)) {
        cell.classList.add("cell-trap");
        cell.title = "Ô Bẫy Mìn Ẩn: Kích nổ loại bỏ quân dẫm phải";
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

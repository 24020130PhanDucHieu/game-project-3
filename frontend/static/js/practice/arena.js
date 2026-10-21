// =============================================================================
// 7.3. THỬ NGHIỆM VỚI BOT MẪU TRÊN BÀN CỜ 9x9 (PRACTICE MODE)
// =============================================================================
async function handlePracticeMatch(source = "studio") {
  if (!navigator.onLine) { notifyInfo('Đang mất kết nối', 'Bạn vẫn có thể soạn và lưu bài. Chạy thử với boss cần kết nối lại máy chủ.'); return; }
  const qualifier = source === "qualifier";
  if (currentAppRole !== "TEAM" && currentAppRole !== "ADMIN") return;

  const editor = document.getElementById(qualifier ? "qualifier-code" : "studio-code-editor");
  const selLang = document.getElementById(qualifier ? "qualifier-language" : "studio-sel-lang");
  const code = editor.value.trim();

  if (!code) {
    notifyWarning("Thiếu Mã Lệnh", "Vui lòng viết mã bot trong khung soạn thảo trước khi thử nghiệm!");
    return;
  }

  const selBoss = document.getElementById(qualifier ? "qualifier-boss" : "sel-trial-boss-bot");
  const boss = selBoss ? selBoss.value : "RANDOM";

  const btnPractice = document.getElementById(qualifier ? "qualifier-practice" : "btn-studio-test-practice");
  if (btnPractice.disabled) return;
  const originalLabel = btnPractice.textContent;
  btnPractice.disabled = true;
  btnPractice.textContent = "Đang Chạy Thử Nghiệm...";

  try {
    const res = await fetch(`${API_BASE}/api/bots/practice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code_content: code,
        language: selLang.value,
        side: "team_a",
        boss: boss
      })
    });

    const data = await res.json();
    if (!res.ok) {
      notifyError("Lỗi Thử Nghiệm", data.detail || "Không thể mô phỏng trận đấu.");
      btnPractice.disabled = false;
      btnPractice.textContent = originalLabel;
      return;
    }

    btnPractice.disabled = false;
    btnPractice.textContent = originalLabel;

    // Mở modal bàn đấu thử nghiệm
    openPracticeArenaModal(data);

  } catch (err) {
    console.error("Lỗi thử nghiệm:", err);
    notifyError("Lỗi Kết Nối", "Không thể kết nối đến máy chủ API.");
    btnPractice.disabled = false;
    btnPractice.textContent = originalLabel;
  }
}

function initPracticeChessboardGrid() {
  const boardEl = document.getElementById("practice-chessboard-9x9");
  if (!boardEl) return;
  boardEl.innerHTML = "";

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement("div");
      cell.className = "board-cell";
      cell.dataset.col = c;
      cell.dataset.row = r;

      if ((r + c) % 2 === 1) {
        cell.classList.add("cell-alt");
      }
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

function renderPracticeChessboard(redPieces, bluePieces, clashEvent = null) {
  const boardEl = document.getElementById("practice-chessboard-9x9");
  if (!boardEl) return;

  if (boardEl.children.length !== 81) {
    initPracticeChessboardGrid();
  }

  const cells = boardEl.querySelectorAll(".board-cell");
  cells.forEach(cell => {
    cell.innerHTML = "";
    cell.classList.remove("cell-clash");
  });

  let blueAlive = 0;
  if (bluePieces && Array.isArray(bluePieces)) {
    bluePieces.forEach(p => {
      if (!p.alive) return;
      blueAlive++;
      const cell = boardEl.querySelector(`.board-cell[data-col="${p.col}"][data-row="${p.row}"]`);
      if (cell) {
        const pieceEl = document.createElement("div");
        pieceEl.className = "board-piece piece-blue";
        pieceEl.innerHTML = pieceIcon(p.type);
        pieceEl.setAttribute("role", "img");
        pieceEl.setAttribute("aria-label", PIECE_ICONS[p.type] || "B\u00faa");
        pieceEl.title = `Quân Bot Mẫu: ${p.type}`;
        cell.appendChild(pieceEl);
      }
    });
  }

  let redAlive = 0;
  if (redPieces && Array.isArray(redPieces)) {
    redPieces.forEach(p => {
      if (!p.alive) return;
      redAlive++;
      const cell = boardEl.querySelector(`.board-cell[data-col="${p.col}"][data-row="${p.row}"]`);
      if (cell) {
        const pieceEl = document.createElement("div");
        pieceEl.className = "board-piece piece-red";
        pieceEl.innerHTML = pieceIcon(p.type);
        pieceEl.setAttribute("role", "img");
        pieceEl.setAttribute("aria-label", PIECE_ICONS[p.type] || "B\u00faa");
        pieceEl.title = `Quân Của Bạn: ${p.type}`;
        cell.appendChild(pieceEl);
      }
    });
  }

  const badgeUser = document.getElementById("practice-count-user");
  const badgeBench = document.getElementById("practice-count-bench");
  if (badgeUser) badgeUser.textContent = `${redAlive}/9 quân`;
  if (badgeBench) badgeBench.textContent = `${blueAlive}/9 quân`;

  if (clashEvent && typeof clashEvent.col === "number" && typeof clashEvent.row === "number") {
    const clashCell = boardEl.querySelector(`.board-cell[data-col="${clashEvent.col}"][data-row="${clashEvent.row}"]`);
    if (clashCell) {
      clashCell.classList.add("cell-clash");
    }
  }
}

async function openPracticeArenaModal(simResult) {
  practiceSimCancelToken = false;
  const modal = document.getElementById("modal-practice-arena");
  modal.style.display = "flex";

  const banner = document.getElementById("practice-result-banner");
  if (banner) banner.style.display = "none";

  const ticker = document.getElementById("practice-commentary-ticker");
  if (ticker) setBattleCommentary(ticker, "Bắt đầu trận đấu thử nghiệm 9x9… Đang triển khai quân cờ!");

  initPracticeChessboardGrid();

  const initPieces = getInitialBoardPieces();
  renderPracticeChessboard(initPieces.red, initPieces.blue);

  const steps = simResult.board_steps || [];
  if (steps.length > 0) {
    for (let i = 0; i < steps.length; i++) {
      if (modal.style.display === "none" || practiceSimCancelToken) break;
      const st = steps[i];
      renderPracticeChessboard(st.red_pieces, st.blue_pieces, st.clash_event);
      if (ticker) setBattleCommentary(ticker, st.log || `Bước ${st.step}`);
      await new Promise(r => setTimeout(r, 220));
    }
  }

  if (banner && modal.style.display !== "none" && !practiceSimCancelToken) {
    banner.style.display = "block";
    const titleEl = document.getElementById("practice-result-title");
    const descEl = document.getElementById("practice-result-desc");

    banner.className = "practice-result-banner";
    if (simResult.winner === "team_a") {
      banner.classList.add("win");
      if (titleEl) titleEl.textContent = "CHIẾN THẮNG TRẬN THỬ NGHIỆM!";
      if (descEl) descEl.textContent = `Thuật toán của bạn đã đánh bại Bot Mẫu của Hệ Thống (${simResult.win_reason}). Bạn đã sẵn sàng nộp mã cho giải chính!`;
    } else if (simResult.winner === "team_b") {
      banner.classList.add("loss");
      if (titleEl) titleEl.textContent = "CHƯA CHIẾN THẮNG TRẬN THỬ!";
      if (descEl) descEl.textContent = `Bot Mẫu đã giành chiến thắng (${simResult.win_reason}). Hãy kiểm tra và tinh chỉnh lại thuật toán decide_move!`;
    } else {
      if (titleEl) titleEl.textContent = "KẾT QUẢ HÒA!";
      if (descEl) descEl.textContent = `Hai bên bất phân thắng bại (${simResult.win_reason}). Bạn có thể tối ưu thêm chiến thuật di chuyển.`;
    }
  }
}

function closePracticeArenaModal() {
  practiceSimCancelToken = true;
  const modal = document.getElementById("modal-practice-arena");
  if (modal) modal.style.display = "none";
}
window.closePracticeArenaModal = closePracticeArenaModal;

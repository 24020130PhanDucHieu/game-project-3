// =============================================================================
// ĐIỀU KHIỂN PHÁT LẠI TỪNG BƯỚC TRÊN BÀN CỜ 9×9 (INLINE REPLAY BAR)
// =============================================================================
let inlinePlaybackCurrentIdx = 0;
let inlinePlaybackTimer = null;

function setupInlineBoardPlayback() {
  const btnPrev = document.getElementById("btn-playback-step-prev");
  const btnPlay = document.getElementById("btn-playback-play");
  const btnNext = document.getElementById("btn-playback-step-next");
  const stepIndicator = document.getElementById("playback-step-indicator");

  function getActiveSteps() {
    if (currentMatchData?.rounds_history && currentMatchData.rounds_history.length > 0) {
      const lastR = inlineReplayRecord(currentMatchData);
      if (lastR.board_steps && lastR.board_steps.length > 0) {
        return { round: lastR.round_number, steps: lastR.board_steps };
      }
    }
    return { round: 1, steps: [] };
  }

  function renderCurrentStep() {
    const { round, steps } = getActiveSteps();
    if (steps.length === 0) {
      if (stepIndicator) stepIndicator.textContent = `Hiệp ${round}: Chưa có bước cờ`;
      return;
    }
    if (inlinePlaybackCurrentIdx >= steps.length) inlinePlaybackCurrentIdx = steps.length - 1;
    if (inlinePlaybackCurrentIdx < 0) inlinePlaybackCurrentIdx = 0;

    const step = steps[inlinePlaybackCurrentIdx];
    saveArenaViewState({ inlineRound: round, inlineStep: inlinePlaybackCurrentIdx });
    if (step) {
      const stepTiles = step.mystery_tiles || currentMatchData?.mystery_tiles;
      renderChessboard(step.red_pieces, step.blue_pieces, step.clash_event || step.clash, stepTiles);
      const ticker = document.getElementById("arena-commentary-ticker") || document.getElementById("live-commentary-ticker");
      if (ticker && step.log) setBattleCommentary(ticker, step.log);
    }
    if (stepIndicator) {
      stepIndicator.textContent = `Hiệp ${round}: Bước ${inlinePlaybackCurrentIdx + 1} / ${steps.length}`;
    }
  }

  if (btnPrev) {
    btnPrev.onclick = () => {
      clearInterval(inlinePlaybackTimer);
      inlinePlaybackTimer = null;
      if (btnPlay) btnPlay.textContent = " Phát lại";
      if (inlinePlaybackCurrentIdx > 0) {
        inlinePlaybackCurrentIdx--;
        renderCurrentStep();
      }
    };
  }

  if (btnNext) {
    btnNext.onclick = () => {
      clearInterval(inlinePlaybackTimer);
      inlinePlaybackTimer = null;
      if (btnPlay) btnPlay.textContent = " Phát lại";
      const { steps } = getActiveSteps();
      if (inlinePlaybackCurrentIdx < steps.length - 1) {
        inlinePlaybackCurrentIdx++;
        renderCurrentStep();
      }
    };
  }

  if (btnPlay) {
    btnPlay.onclick = () => {
      const { steps } = getActiveSteps();
      if (steps.length === 0) {
        notifyInfo("Chưa Có Dữ Liệu", "Chưa có hiệp đấu nào diễn ra để phát lại.");
        return;
      }
      if (inlinePlaybackTimer) {
        clearInterval(inlinePlaybackTimer);
        inlinePlaybackTimer = null;
        btnPlay.textContent = " Phát lại";
      } else {
        btnPlay.textContent = " Tạm dừng";
        if (inlinePlaybackCurrentIdx >= steps.length - 1) {
          inlinePlaybackCurrentIdx = 0;
        }
        renderCurrentStep();
        inlinePlaybackTimer = setInterval(() => {
          if (inlinePlaybackCurrentIdx < steps.length - 1) {
            inlinePlaybackCurrentIdx++;
            renderCurrentStep();
          } else {
            clearInterval(inlinePlaybackTimer);
            inlinePlaybackTimer = null;
            btnPlay.textContent = " Phát lại";
          }
        }, 800);
      }
    };
  }
}

// =============================================================================
// ĐIỀU KHIỂN PHÁT LẠI TRÊN BÀN ĐẤU REALTIME CHO ADMIN
// =============================================================================
let realtimePlaybackIdx = 0;
let realtimePlaybackTimer = null;

function getActiveRealtimeSteps() {
  const match = currentTournamentData?.matches?.[currentActiveMatchId];
  if (match?.rounds_history && match.rounds_history.length > 0) {
    const lastR = match.rounds_history[match.rounds_history.length - 1];
    if (lastR.board_steps && lastR.board_steps.length > 0) {
      return { round: lastR.round_number, steps: lastR.board_steps, record: lastR, match };
    }
  }
  return { round: 1, steps: [], record: null, match: null };
}

function renderRealtimeStep(index) {
  const { round, steps, record, match } = getActiveRealtimeSteps();
  if (steps.length === 0) {
    const label = document.getElementById("realtime-timeline-step-label");
    if (label) label.textContent = `Hiệp ${round}: Chưa có bước cờ`;
    return;
  }
  if (index < 0) index = 0;
  if (index >= steps.length) index = steps.length - 1;
  realtimePlaybackIdx = index;

  const slider = document.getElementById("realtime-step-slider");
  if (slider) {
    slider.max = steps.length - 1;
    slider.value = index;
  }
  const label = document.getElementById("realtime-timeline-step-label");
  if (label) {
    label.textContent = `Bước ${index + 1} / ${steps.length}`;
  }

  const step = steps[index];
  const stepTiles = step.mystery_tiles || record?.mystery_tiles;
  renderRealtimeChessboard(step.red_pieces, step.blue_pieces, step.clash_event, stepTiles);
  if (match && record) {
    renderLiveAction(match, record, step, index);
    if (typeof renderCategorizedLogs === "function") {
      renderCategorizedLogs(record, index);
    }
  }
}

function startRealtimeAutoPlay(fromBeginning = false) {
  const { steps } = getActiveRealtimeSteps();
  if (steps.length === 0) return;

  if (realtimePlaybackTimer) {
    clearInterval(realtimePlaybackTimer);
    realtimePlaybackTimer = null;
  }

  if (fromBeginning || realtimePlaybackIdx >= steps.length - 1) {
    realtimePlaybackIdx = 0;
  }
  renderRealtimeStep(realtimePlaybackIdx);

  const btnPlay = document.getElementById("btn-rt-play");
  if (btnPlay) btnPlay.textContent = "⏸ Tạm dừng";

  const getSpeed = () => {
    const sel = document.getElementById("realtime-playback-speed");
    return sel ? parseInt(sel.value, 10) || 250 : 250;
  };

  const tick = () => {
    if (realtimePlaybackIdx < steps.length - 1) {
      realtimePlaybackIdx++;
      renderRealtimeStep(realtimePlaybackIdx);
    } else {
      clearInterval(realtimePlaybackTimer);
      realtimePlaybackTimer = null;
      if (btnPlay) btnPlay.textContent = "▶ Chạy trận đấu";
    }
  };

  realtimePlaybackTimer = setInterval(tick, getSpeed());
}

function setupRealtimeBoardPlayback() {
  const btnFirst = document.getElementById("btn-rt-first");
  const btnPrev = document.getElementById("btn-rt-prev");
  const btnPlay = document.getElementById("btn-rt-play");
  const btnNext = document.getElementById("btn-rt-next");
  const btnLast = document.getElementById("btn-rt-last");
  const slider = document.getElementById("realtime-step-slider");
  const speedSel = document.getElementById("realtime-playback-speed");

  if (btnFirst) {
    btnFirst.onclick = () => {
      clearInterval(realtimePlaybackTimer);
      realtimePlaybackTimer = null;
      if (btnPlay) btnPlay.textContent = "▶ Chạy trận đấu";
      renderRealtimeStep(0);
    };
  }

  if (btnPrev) {
    btnPrev.onclick = () => {
      clearInterval(realtimePlaybackTimer);
      realtimePlaybackTimer = null;
      if (btnPlay) btnPlay.textContent = "▶ Chạy trận đấu";
      if (realtimePlaybackIdx > 0) {
        renderRealtimeStep(realtimePlaybackIdx - 1);
      }
    };
  }

  if (btnNext) {
    btnNext.onclick = () => {
      clearInterval(realtimePlaybackTimer);
      realtimePlaybackTimer = null;
      if (btnPlay) btnPlay.textContent = "▶ Chạy trận đấu";
      const { steps } = getActiveRealtimeSteps();
      if (realtimePlaybackIdx < steps.length - 1) {
        renderRealtimeStep(realtimePlaybackIdx + 1);
      }
    };
  }

  if (btnLast) {
    btnLast.onclick = () => {
      clearInterval(realtimePlaybackTimer);
      realtimePlaybackTimer = null;
      if (btnPlay) btnPlay.textContent = "▶ Chạy trận đấu";
      const { steps } = getActiveRealtimeSteps();
      if (steps.length > 0) {
        renderRealtimeStep(steps.length - 1);
      }
    };
  }

  if (btnPlay) {
    btnPlay.onclick = () => {
      const { steps } = getActiveRealtimeSteps();
      if (steps.length === 0) {
        notifyInfo("Chưa có diễn biến", "Chưa có bước cờ nào trong hiệp này để chạy.");
        return;
      }
      if (realtimePlaybackTimer) {
        clearInterval(realtimePlaybackTimer);
        realtimePlaybackTimer = null;
        btnPlay.textContent = "▶ Chạy trận đấu";
      } else {
        startRealtimeAutoPlay(realtimePlaybackIdx >= steps.length - 1);
      }
    };
  }

  if (slider) {
    slider.oninput = (e) => {
      clearInterval(realtimePlaybackTimer);
      realtimePlaybackTimer = null;
      if (btnPlay) btnPlay.textContent = "▶ Chạy trận đấu";
      const val = parseInt(e.target.value, 10);
      renderRealtimeStep(val);
    };
  }

  if (speedSel) {
    speedSel.onchange = () => {
      if (realtimePlaybackTimer) {
        startRealtimeAutoPlay(false);
      }
    };
  }
}

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
      renderChessboard(step.red_pieces, step.blue_pieces, step.clash);
      const ticker = document.getElementById("arena-commentary-ticker") || document.getElementById("live-commentary-ticker");
      if (ticker && step.log) ticker.textContent = step.log;
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

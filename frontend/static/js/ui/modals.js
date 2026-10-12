function setupModals() {
  const btnOpenTournamentList = document.getElementById("btn-open-tournament-list");
  const tournamentListModal = document.getElementById("modal-tournament-list");
  if (btnOpenTournamentList) {
    btnOpenTournamentList.addEventListener("click", async () => {
      if (tournamentListModal) tournamentListModal.style.display = "flex";
      await renderBracketTournamentList();
    });
  }

  const modalCreate = document.getElementById("modal-create-tournament");
  const btnOpenCreate = document.getElementById("btn-open-create-tourn");
  const btnCloseCreate = document.getElementById("btn-close-create-tourn");
  const btnCloseCreateX = document.getElementById("btn-close-create-tourn-x");
  const btnSubmitCreate = document.getElementById("btn-submit-create-tourn");

  const closeCreateModal = () => {
    if (modalCreate) modalCreate.style.display = "none";
  };
  window.closeCreateTournModal = closeCreateModal;

  if (btnOpenCreate) {
    btnOpenCreate.addEventListener("click", () => {
      if (currentAppRole !== "ADMIN") {
        notifyWarning("Từ Chối Quyền", "Chỉ Ban Tổ Chức (Admin) mới có quyền tạo giải đấu mới! Các đội không được phép tạo giải.");
        return;
      }
      if (modalCreate) modalCreate.style.display = "flex";
    });
  }

  if (btnCloseCreate) btnCloseCreate.addEventListener("click", closeCreateModal);
  if (btnCloseCreateX) btnCloseCreateX.addEventListener("click", closeCreateModal);

  if (btnSubmitCreate) {
    btnSubmitCreate.addEventListener("click", async () => {
      if (currentAppRole !== "ADMIN") {
        notifyWarning("Từ Chối Quyền", "Chỉ Ban Tổ Chức (Admin) mới có quyền tạo giải đấu mới!");
        return;
      }

      const inpName = document.getElementById("inp-new-tourn-name");
      const name = inpName ? inpName.value.trim() : "";
      const teamsInp = document.getElementById("inp-new-tourn-teams");
      const numTeams = teamsInp ? parseInt(teamsInp.value, 10) : 8;

      if (!name) {
        notifyWarning("Thiếu Tên Giải Đấu", "Vui lòng nhập tên giải đấu!");
        return;
      }

      if (isNaN(numTeams) || numTeams < 4 || (numTeams & (numTeams - 1)) !== 0) {
        notifyWarning("Quy Mô Không Hợp Lệ", "Số lượng đội phải là lũy thừa của 2 (4, 8, 16, 32...) để tạo nhánh đấu loại trực tiếp!");
        return;
      }

      btnSubmitCreate.disabled = true;
      btnSubmitCreate.textContent = "Đang khởi tạo...";

      try {
        const res = await fetch(`${API_BASE}/api/tournaments/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name, num_teams: numTeams })
        });

        const data = await res.json();
        if (!res.ok) {
          notifyError("Lỗi Tạo Giải Đấu", data.detail || "Không thể tạo giải đấu mới.");
          btnSubmitCreate.disabled = false;
          btnSubmitCreate.textContent = "Khởi Tạo Giải Đấu";
          return;
        }

        notifySuccess("Khởi Tạo Giải Đấu", data.message || "Khởi tạo giải đấu thành công!");
        closeCreateModal();
        btnSubmitCreate.disabled = false;
        btnSubmitCreate.textContent = "Khởi Tạo Giải Đấu";

        // Nạp lại danh sách giải đấu và chọn giải vừa tạo
        resetSelectedMatch();
        currentTournamentId = data.tournament.tournament_id;
        sessionStorage.setItem("activeTournamentId", currentTournamentId);
        localStorage.setItem("activeTournamentId", currentTournamentId);
        await loadTournamentsList();

      } catch (err) {
        console.error("Lỗi tạo giải đấu:", err);
        notifyError("Lỗi Kết Nối", "Không thể kết nối đến máy chủ API.");
        btnSubmitCreate.disabled = false;
        btnSubmitCreate.textContent = "Khởi Tạo Giải Đấu";
      }
    });
  }

  // Modal xem code
  const modalCode = document.getElementById("modal-view-code");
  const btnCloseCode = document.getElementById("btn-close-view-code") || document.getElementById("btn-close-code-modal");
  const btnCloseCodeBtn = document.getElementById("btn-close-view-code-x") || document.getElementById("btn-close-code-modal-btn");

  const closeCodeModal = () => { if (modalCode) modalCode.style.display = "none"; };
  if (btnCloseCode) btnCloseCode.addEventListener("click", closeCodeModal);
  if (btnCloseCodeBtn) btnCloseCodeBtn.addEventListener("click", closeCodeModal);

  // Modal Quản Lý Đội Tuyển & Bốc Thăm Nhánh Đấu
  const btnCloseTeamMgr = document.getElementById("btn-close-team-mgr");
  const btnCloseTeamMgrX = document.getElementById("btn-close-team-mgr-x");
  const btnMgrAddTeam = document.getElementById("btn-mgr-add-team");
  const btnMgrQuickFill = document.getElementById("btn-mgr-quick-fill");
  const btnMgrAutoSchedule = document.getElementById("btn-mgr-auto-schedule");

  if (btnCloseTeamMgr) btnCloseTeamMgr.addEventListener("click", () => window.closeTeamManagerModal());
  if (btnCloseTeamMgrX) btnCloseTeamMgrX.addEventListener("click", () => window.closeTeamManagerModal());
  if (btnMgrAddTeam) btnMgrAddTeam.addEventListener("click", handleAddTeamSubmit);
  if (btnMgrQuickFill) btnMgrQuickFill.addEventListener("click", handleQuickFillTeams);
  if (btnMgrAutoSchedule) btnMgrAutoSchedule.addEventListener("click", handleAutoSchedule);

  // Modal Xác Thực Danh Tính & Đổi Vai Trò (Redesigned Prominent Auth)
  const btnOpenRoleModal = document.getElementById("btn-open-role-modal");
  const btnCloseRoleModal = document.getElementById("btn-close-role-modal");
  const btnCloseRoleModalX = document.getElementById("btn-close-role-modal-x");

  if (btnOpenRoleModal) btnOpenRoleModal.addEventListener("click", openAdminLoginModal);
  if (btnCloseRoleModal) btnCloseRoleModal.addEventListener("click", closeRoleModal);
  if (btnCloseRoleModalX) btnCloseRoleModalX.addEventListener("click", closeRoleModal);

  document.querySelectorAll(".role-pill-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      activateRoleChoiceTab(btn.dataset.roleChoice);
    });
  });

  // Tự động tìm kiếm và điền thông tin khi thí sinh nhập MSSV hoặc chọn dropdown
  const inpTeamSid = document.getElementById("inp-team-auth-sid");
  const inpTeamName = document.getElementById("inp-team-auth-name");
  const selQuickTeam = document.getElementById("sel-quick-team-auth");
  const authBadge = document.getElementById("auth-team-preview-badge");
  const authBadgeText = document.getElementById("auth-preview-text");

  if (selQuickTeam) {
    selQuickTeam.addEventListener("change", () => {
      const chosenOpt = selQuickTeam.options[selQuickTeam.selectedIndex];
      if (selQuickTeam.value && chosenOpt) {
        if (inpTeamSid) inpTeamSid.value = selQuickTeam.value;
        const nameVal = chosenOpt.dataset.teamName || chosenOpt.textContent.split(" (")[0];
        if (inpTeamName) inpTeamName.value = nameVal;
        if (authBadge && authBadgeText) {
          authBadge.style.display = "block";
          authBadgeText.textContent = `Đã khớp: ${nameVal} (MSSV: ${selQuickTeam.value})`;
        }
      }
    });
  }

  if (inpTeamSid) {
    const handleSidInput = () => {
      const val = inpTeamSid.value.trim();
      if (!val) {
        if (authBadge) authBadge.style.display = "none";
        return;
      }
      let foundName = null;
      if (currentTournamentData && currentTournamentData.teams) {
        const t = currentTournamentData.teams.find(x => String(x.student_id).trim() === val);
        if (t) foundName = t.team_name;
      }
      if (!foundName && selQuickTeam) {
        for (let i = 0; i < selQuickTeam.options.length; i++) {
          if (selQuickTeam.options[i].value === val) {
            foundName = selQuickTeam.options[i].dataset.teamName || selQuickTeam.options[i].textContent.split(" (")[0];
            break;
          }
        }
      }
      if (foundName) {
        if (inpTeamName && !inpTeamName.value) inpTeamName.value = foundName;
        if (authBadge && authBadgeText) {
          authBadge.style.display = "block";
          authBadgeText.textContent = `Đã khớp: ${foundName} (MSSV: ${val})`;
        }
      } else {
        if (authBadge) authBadge.style.display = "none";
      }
    };
    inpTeamSid.addEventListener("input", handleSidInput);
    inpTeamSid.addEventListener("blur", handleSidInput);
  }

  const btnConfGuest = document.getElementById("btn-confirm-guest-role");
  if (btnConfGuest) {
    btnConfGuest.addEventListener("click", () => {
      currentAppRole = "GUEST";
      currentUserRole = "GUEST";
      localStorage.setItem("ARENA_USER_ROLE", "GUEST");
      updateRoleUI();
      closeRoleModal();
      notifySuccess("Chế Độ Khách", "Đã chuyển sang chế độ Khán giả công khai.");
    });
  }

  const requireMatchSession = () => {
    closeRoleModal();
    notifyWarning("Đăng nhập theo trận", "Hãy mở trận đấu và dùng tài khoản do Ban tổ chức cấp.");
  };
  ["btn-confirm-team-role", "btn-confirm-referee-role", "btn-confirm-admin-role"].forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.addEventListener("click", requireMatchSession);
  });
  const modalMismatch = document.getElementById("modal-branch-mismatch");
  const btnCloseMismatchX = document.getElementById("btn-close-mismatch-x");
  const btnMismatchSwitch = document.getElementById("btn-mismatch-switch-tourn");
  const btnMismatchChangeAcc = document.getElementById("btn-mismatch-change-account");

  if (btnCloseMismatchX && modalMismatch) {
    btnCloseMismatchX.addEventListener("click", () => {
      modalMismatch.style.display = "none";
    });
  }
  if (btnMismatchSwitch && modalMismatch) {
    btnMismatchSwitch.addEventListener("click", () => {
      modalMismatch.style.display = "none";
      switchToTab("tab-tournaments");
    });
  }
  if (btnMismatchChangeAcc && modalMismatch) {
    btnMismatchChangeAcc.addEventListener("click", () => {
      modalMismatch.style.display = "none";
      openRoleModal("TEAM");
    });
  }


  // Modal Đăng Nhập Trận Đấu (2 Trường Duy Nhất: Tài Khoản & Mật Khẩu)
  const btnCloseMatchLogin = document.getElementById("btn-close-match-login");
  const btnCloseMatchLoginX = document.getElementById("btn-close-match-login-x");
  const btnSubmitUnifiedLogin = document.getElementById("btn-submit-unified-login");
  const inpMatchLoginPass = document.getElementById("inp-match-login-pass");

  if (btnCloseMatchLogin) btnCloseMatchLogin.addEventListener("click", closeMatchLoginModal);
  if (btnCloseMatchLoginX) btnCloseMatchLoginX.addEventListener("click", closeMatchLoginModal);
  if (btnSubmitUnifiedLogin) btnSubmitUnifiedLogin.addEventListener("click", handleUnifiedLogin);
  if (inpMatchLoginPass) {
    inpMatchLoginPass.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleUnifiedLogin();
    });
  }

  // Modal Bàn Đấu Thử Nghiệm với Bot Mẫu (Hỗ trợ nút X và nút thoát tức thì)
  const btnClosePractice = document.getElementById("btn-close-practice");
  const btnClosePracticeX = document.getElementById("btn-close-practice-x");
  const btnPracticeExitInline = document.getElementById("btn-practice-exit-inline");

  if (btnClosePractice) btnClosePractice.addEventListener("click", closePracticeArenaModal);
  if (btnClosePracticeX) btnClosePracticeX.addEventListener("click", closePracticeArenaModal);
  if (btnPracticeExitInline) btnPracticeExitInline.addEventListener("click", closePracticeArenaModal);

  // Hỗ trợ phím Escape thoát nhanh chế độ thử nghiệm
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const modalPractice = document.getElementById("modal-practice-arena");
      if (modalPractice && modalPractice.style.display !== "none") {
        closePracticeArenaModal();
      }
      const modalReplay = document.getElementById("modal-match-replay");
      if (modalReplay && modalReplay.style.display !== "none") {
        clearInterval(replayPlayInterval);
        replayPlayInterval = null;
        modalReplay.style.display = "none";
      }
    }
  });

  // Modal Xem Lại Trận Đấu Step-by-Step (Match Replay Viewer)
  const btnCloseReplay = document.getElementById("btn-close-replay");
  const btnCloseReplayX = document.getElementById("btn-close-replay-x");
  const btnReplayPrev = document.getElementById("btn-replay-prev");
  const btnReplayNext = document.getElementById("btn-replay-next");
  const btnReplayPlayPause = document.getElementById("btn-replay-play-pause");
  const replaySlider = document.getElementById("replay-step-slider");

  const closeReplay = () => {
    clearInterval(replayPlayInterval);
    replayPlayInterval = null;
    const modal = document.getElementById("modal-match-replay");
    if (modal) modal.style.display = "none";
  };
  if (btnCloseReplay) btnCloseReplay.addEventListener("click", closeReplay);
  if (btnCloseReplayX) btnCloseReplayX.addEventListener("click", closeReplay);

  if (btnReplayPrev) {
    btnReplayPrev.addEventListener("click", () => {
      clearInterval(replayPlayInterval);
      replayPlayInterval = null;
      if (btnReplayPlayPause) btnReplayPlayPause.textContent = " Tự Động Chạy";
      renderReplayStep(currentReplayStepIdx - 1);
    });
  }

  if (btnReplayNext) {
    btnReplayNext.addEventListener("click", () => {
      clearInterval(replayPlayInterval);
      replayPlayInterval = null;
      if (btnReplayPlayPause) btnReplayPlayPause.textContent = " Tự Động Chạy";
      renderReplayStep(currentReplayStepIdx + 1);
    });
  }

  if (btnReplayPlayPause) {
    btnReplayPlayPause.addEventListener("click", () => {
      if (replayPlayInterval) {
        clearInterval(replayPlayInterval);
        replayPlayInterval = null;
        btnReplayPlayPause.textContent = " Tự Động Chạy";
      } else {
        btnReplayPlayPause.textContent = "Tạm Dừng";
        if (currentReplayRecord && currentReplayStepIdx >= currentReplayRecord.board_steps.length - 1) {
          renderReplayStep(0);
        }
        replayPlayInterval = setInterval(() => {
          if (!currentReplayRecord || currentReplayStepIdx >= currentReplayRecord.board_steps.length - 1) {
            clearInterval(replayPlayInterval);
            replayPlayInterval = null;
            btnReplayPlayPause.textContent = " Tự Động Chạy";
            return;
          }
          renderReplayStep(currentReplayStepIdx + 1);
        }, 600);
      }
    });
  }

  if (replaySlider) {
    replaySlider.addEventListener("input", (e) => {
      clearInterval(replayPlayInterval);
      replayPlayInterval = null;
      if (btnReplayPlayPause) btnReplayPlayPause.textContent = " Tự Động Chạy";
      renderReplayStep(parseInt(e.target.value));
    });
  }

  // Nút làm mới danh sách bài nộp Kaggle Submissions
  const btnRefreshSubs = document.getElementById("btn-refresh-submissions");
  if (btnRefreshSubs) {
    btnRefreshSubs.addEventListener("click", () => {
      if (currentActiveMatchId) loadMatchSubmissions(currentActiveMatchId);
    });
  }

  // Khởi tạo chuyển tabs nhật ký
  setupLogTabs();
}

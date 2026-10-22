function renderBracketTree(tourn) {
  const canvas = document.getElementById("bracket-tree-canvas");
  if (!canvas) return;
  const previousScroll = canvas.querySelector(".bracket-tree-scroll-container")?.scrollLeft ?? Number(sessionStorage.getItem(`arena-bracket-scroll:${currentTournamentId}`) || 0);

  const numTeams = tourn?.num_teams || 8;
  const k = Math.max(1, Math.round(Math.log2(numTeams))); // e.g. 5 for 32, 4 for 16, 3 for 8, 2 for 4

  // Lấy tên vòng theo khoảng cách tới chung kết
  const getRoundTitle = (distanceToFinal) => {
    if (distanceToFinal === 0) return "Chung kết";
    if (distanceToFinal === 1) return "Bán Kết";
    if (distanceToFinal === 2) return "Tứ kết";
    if (distanceToFinal === 3) return "Vòng 1/8";
    if (distanceToFinal === 4) return "Vòng 1/16";
    return `Vòng 1/${Math.pow(2, distanceToFinal)}`;
  };

  const firstRoundTitle = getRoundTitle(k - 1);

  // Cập nhật tiêu đề và thể thức trên header trang & card
  const tournTitleEl = document.getElementById("bracket-tourn-name-display");
  if (tournTitleEl) {
    tournTitleEl.textContent = tourn?.name || "Giải Đấu Tân Sinh Viên K69";
  }

  const formatEl = document.getElementById("bracket-tourn-format-display");
  if (formatEl) {
    const maxRounds = 5;
    formatEl.textContent = `Thể thức: ${firstRoundTitle} → Chung Kết · Tối đa ${maxRounds} hiệp/trận`;
  }

  const roundTitleCard = document.getElementById("bracket-card-round-title");
  if (roundTitleCard) {
    roundTitleCard.textContent = firstRoundTitle;
  }

  const matches = tourn?.matches || {};
  const teamsList = tourn?.teams || [];

  const isTeamMatch = (matchRef, nameA, nameB) => {
    if (currentAppRole !== "TEAM") return false;
    if (matchRef && isTeamInMatch(matchRef, currentTeamStudentId, currentTeamName)) return true;
    return isTeamInMatch({ team_a: { team_name: nameA }, team_b: { team_name: nameB } }, currentTeamStudentId, currentTeamName);
  };

  const renderNodeHtml = (nodeData) => {
    const isMyMatch = isTeamMatch(nodeData.matchRef, nodeData.team_a, nodeData.team_b);
    const isOtherMatch = (currentAppRole === "TEAM" && !isMyMatch);
    let nodeClass = "bracket-match-node";
    if (isMyMatch) nodeClass += " my-team-match";
    else if (isOtherMatch) nodeClass += " other-team-match";

    const nodeTitle = isMyMatch
      ? "Trận đấu của bạn - Bấm để vào phòng thi đấu và nộp bài"
      : (isOtherMatch
          ? "Trận đấu của đội khác - Bạn không được phép bấm vào"
          : "Bấm để xem và nộp bài cho trận đấu");

    return `
      <div class="${nodeClass}" data-match-id="${nodeData.id}" title="${nodeTitle}">
        <div class="node-title-row">
          <span>${nodeData.title}</span>
          ${isMyMatch ? '<span class="badge-my-match" style="background:#2563eb;color:#ffffff;font-size:9.5px;font-weight:700;padding:1px 6px;border-radius:10px;margin-left:6px;"> Trận của bạn</span>' : ''}
        </div>
        <div class="node-team-row">
          <div class="node-team-info">
            ${teamAvatar(nodeData.team_a, {small: true, pending: !nodeData.matchRef?.team_a?.student_id})}<span class="node-team-name">${escapeHtml(nodeData.team_a)}</span>
          </div>
          <span class="node-score">${nodeData.score_a}</span>
        </div>
        <div class="node-team-row">
          <div class="node-team-info">
            ${teamAvatar(nodeData.team_b, {small: true, pending: !nodeData.matchRef?.team_b?.student_id})}<span class="node-team-name">${escapeHtml(nodeData.team_b)}</span>
          </div>
          <span class="node-score">${nodeData.score_b}</span>
        </div>
      </div>
    `;
  };

  let columnsHtml = "";

  for (let lvl = 1; lvl <= k; lvl++) {
    const dist = k - lvl;
    const colTitle = getRoundTitle(dist);
    const numMatchesInCol = Math.pow(2, dist);
    const isFinalRound = (lvl === k);

    let roundMatchesData = [];
    for (let i = 0; i < numMatchesInCol; i++) {
      const isGf = isFinalRound;
      const mId = isGf ? "m_gf" : `m_lvl${lvl}_${i + 1}`;

      // Fallback aliases cho các phiên bản cũ
      let refMatch = matches[mId];
      if (!refMatch) {
        if (dist === 2) refMatch = matches[`m_qf_${i + 1}`];
        else if (dist === 1) refMatch = matches[`m_sf_${i + 1}`];
        else if (isGf) refMatch = matches["m_gf"];
      }

      let teamAName = refMatch?.team_a?.team_name || refMatch?.team_a?.student_id;
      let teamBName = refMatch?.team_b?.team_name || refMatch?.team_b?.student_id;
      let scoreA = "-";
      let scoreB = "-";

      if (refMatch) {
        if (refMatch.rounds_history?.length || refMatch.status === "COMPLETED") {
          scoreA = refMatch.team_a?.rounds_won ?? 0;
          scoreB = refMatch.team_b?.rounds_won ?? 0;
        }
      }

      // Nạp tên mặc định từ danh sách đăng ký hoặc demo bots nếu chưa gán
      if (lvl === 1) {
        if (!teamAName) {
          teamAName = "Chưa xếp đội";
        }
        if (!teamBName) {
          teamBName = "Chưa xếp đội";
        }
      } else {
        if (!teamAName) teamAName = `Chờ đội thắng trận ${2 * i + 1} vòng trước`;
        if (!teamBName) teamBName = `Chờ đội thắng trận ${2 * i + 2} vòng trước`;
      }

      const colorA = getDynamicTeamColor(teamAName, (lvl === 1 ? 2 * i : 0));
      const colorB = getDynamicTeamColor(teamBName, (lvl === 1 ? 2 * i + 1 : 1));

      roundMatchesData.push({
        id: refMatch?.match_id || mId,
        title: `Trận ${i + 1}`,
        isFinal: isGf,
        team_a: teamAName,
        team_b: teamBName,
        score_a: scoreA,
        score_b: scoreB,
        color_a: colorA,
        color_b: colorB,
        matchRef: refMatch
      });
    }

    // Ghép cặp và đường nhánh kết nối (Connector branches)
    let matchesContentHtml = "";
    if (isFinalRound) {
      matchesContentHtml = `
        <div class="bracket-match-pair final-pair">
          ${renderNodeHtml(roundMatchesData[0])}
        </div>
      `;
    } else {
      const numPairs = numMatchesInCol / 2;
      for (let p = 0; p < numPairs; p++) {
        const m1 = roundMatchesData[2 * p];
        const m2 = roundMatchesData[2 * p + 1];
        matchesContentHtml += `
          <div class="bracket-match-pair">
            ${renderNodeHtml(m1)}
            ${renderNodeHtml(m2)}
            <div class="bracket-connector-branch">

              <span class="connector-status-badge">Nhánh đấu</span>
            </div>
          </div>
        `;
      }
    }

    columnsHtml += `
      <div class="bracket-column-dynamic">
        <div class="bracket-col-header-dynamic ${isFinalRound ? "final-round-header" : ""}">${isFinalRound ? arenaIcon("trophy") : ""}${colTitle}</div>
        <div class="bracket-column-matches-flex">
          ${matchesContentHtml}
        </div>
      </div>
    `;
  }

  canvas.innerHTML = `
    <div class="bracket-tree-scroll-container">
      <div class="bracket-columns-flex">
        ${columnsHtml}
      </div>
    </div>
  `;

  // Gán sự kiện bấm vào từng trận để mở phòng thi đấu (Phân quyền kiểm tra trận của đội)
  canvas.querySelectorAll(".bracket-match-node").forEach(node => {
    node.addEventListener("click", () => {
      const mid = node.dataset.matchId;
      const refMatch = matches[mid] || matches[mid.replace("lvl1_", "qf_").replace("lvl2_", "sf_")];
      if (currentAppRole === "TEAM") {
        const isMyMatch = isTeamInMatch(refMatch, currentTeamStudentId, currentTeamName);
        if (!isMyMatch) {
          notifyWarning(
            "Từ Chối Truy Cập",
            `Bạn đang đăng nhập với tài khoản ${currentTeamName || currentTeamStudentId || "của đội"}. Bạn không được phép bấm vào trận đấu của đội khác! Vui lòng chọn đúng trận đấu của đội mình.`
          );
          return;
        }
      }
      handleMatchCardClick(mid);
    });
  });

  const scrollContainer = canvas.querySelector(".bracket-tree-scroll-container");
  if (scrollContainer) { scrollContainer.scrollLeft = previousScroll; scrollContainer.addEventListener("scroll", () => sessionStorage.setItem(`arena-bracket-scroll:${currentTournamentId}`, String(scrollContainer.scrollLeft)), { passive: true }); }

  // Hỗ trợ các nút filter pills
  document.querySelectorAll(".bracket-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".bracket-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
    });
  });
}



function createBracketColumn(title, matchArr) {
  const col = document.createElement("div");
  col.className = "bracket-column";

  const titleEl = document.createElement("div");
  titleEl.className = "bracket-column-title";
  titleEl.textContent = title;
  col.appendChild(titleEl);

  const listEl = document.createElement("div");
  listEl.className = "bracket-matches-list";

  matchArr.forEach(m => {
    if (m) listEl.appendChild(createMatchCard(m));
  });

  col.appendChild(listEl);
  return col;
}

function createMatchCard(match) {
  const card = document.createElement("div");
  card.className = "bracket-match-card";
  if (match.status === "COMPLETED") card.classList.add("is-completed");

  const header = document.createElement("div");
  header.className = "bracket-card-header";

  let statusClass = "status-waiting";
  let statusText = "Chờ";
  if (match.status === "READY") { statusClass = "status-ready"; statusText = "Sẵn Sàng"; }
  else if (match.status === "IN_PROGRESS") { statusClass = "status-inprogress"; statusText = `Round ${match.current_round_idx}/5`; }
  else if (match.status === "COMPLETED") { statusClass = "status-completed"; statusText = "Đã Kết Thúc"; }

  header.innerHTML = `
    <span class="bracket-match-title">${match.title}</span>
    <span class="bracket-match-status ${statusClass}">${statusText}</span>
  `;
  card.appendChild(header);

  const body = document.createElement("div");
  body.className = "bracket-card-body";

  const teamA = match.team_a;
  const teamB = match.team_b;

  const isWinA = match.winner === "team_a";
  const isWinB = match.winner === "team_b";

  const rowA = `
    <div class="bracket-team-row ${isWinA ? 'winner' : ''}">
      <div class="team-row-left">
        <span class="team-pill-indicator ${teamA ? 'red' : 'empty'}"></span>
        <span class="bracket-team-name ${!teamA ? 'empty' : ''}">${teamA ? escapeHtml(teamA.team_name) : 'Chờ xác định...'}</span>
      </div>
      <span class="bracket-team-score">${teamA ? teamA.rounds_won : '-'}</span>
    </div>
  `;

  const rowB = `
    <div class="bracket-team-row ${isWinB ? 'winner' : ''}">
      <div class="team-row-left">
        <span class="team-pill-indicator ${teamB ? 'blue' : 'empty'}"></span>
        <span class="bracket-team-name ${!teamB ? 'empty' : ''}">${teamB ? escapeHtml(teamB.team_name) : 'Chờ xác định...'}</span>
      </div>
      <span class="bracket-team-score">${teamB ? teamB.rounds_won : '-'}</span>
    </div>
  `;

  body.innerHTML = rowA + rowB;
  card.appendChild(body);

  const footer = document.createElement("div");
  footer.className = "bracket-card-footer";
  const btn = document.createElement("button");
  btn.className = "btn-open-match";
  btn.textContent = match.status === "COMPLETED" ? "Xem Lịch Sử 5 Round" : "Vào Bàn Đấu";
  footer.appendChild(btn);
  card.appendChild(footer);

  card.addEventListener("click", () => {
    handleMatchCardClick(match.match_id);
  });

  return card;
}

function createChampionColumn(championName) {
  const col = document.createElement("div");
  col.className = "bracket-column";

  const titleEl = document.createElement("div");
  titleEl.className = "bracket-column-title";
  titleEl.textContent = "Cúp Vô Địch";
  col.appendChild(titleEl);

  const card = document.createElement("div");
  card.className = "champion-column-card";
  card.innerHTML = `
    <div class="champ-title">QUÁN QUÂN GIẢI ĐẤU</div>
    <div class="champ-name">${championName ? escapeHtml(championName) : 'Đang Tranh Hùng...'}</div>
  `;

  col.appendChild(card);
  return col;
}

// =============================================================================
// QUẢN LÝ BẢNG ĐẤU - HOÁN ĐỔI CẶP ĐẤU & XỬ LOẠI ĐỘI (ADMIN)
// =============================================================================
function openBracketSwapModal() {
  if (currentAppRole !== 'ADMIN') {
    notifyWarning('Quyền Admin', 'Chỉ Quản trị viên mới có thể can thiệp sơ đồ bảng đấu.');
    return;
  }
  const modal = document.getElementById('modal-bracket-swap');
  if (modal) modal.style.display = 'flex';

  switchBracketModalTab('swap');
  populateBracketSwapSelects();
}

function closeBracketSwapModal() {
  const modal = document.getElementById('modal-bracket-swap');
  if (modal) modal.style.display = 'none';
}

function switchBracketModalTab(tab) {
  const btnSwap = document.getElementById('btn-tab-swap-teams');
  const btnDq = document.getElementById('btn-tab-disqualify-team');
  const secSwap = document.getElementById('section-swap-action');
  const secDq = document.getElementById('section-disqualify-action');
  const alertBox = document.getElementById('bracket-swap-alert');

  if (alertBox) alertBox.style.display = 'none';

  if (tab === 'swap') {
    if (btnSwap) btnSwap.className = 'btn btn-sm btn-primary';
    if (btnDq) btnDq.className = 'btn btn-sm btn-outline';
    if (secSwap) secSwap.style.display = 'block';
    if (secDq) secDq.style.display = 'none';
  } else {
    if (btnSwap) btnSwap.className = 'btn btn-sm btn-outline';
    if (btnDq) btnDq.className = 'btn btn-sm btn-primary';
    if (secSwap) secSwap.style.display = 'none';
    if (secDq) secDq.style.display = 'block';
  }
}

function populateBracketSwapSelects() {
  const sel1 = document.getElementById('swap-sel-team-1');
  const sel2 = document.getElementById('swap-sel-team-2');
  const selDq = document.getElementById('dq-sel-team');

  if (!sel1 || !sel2 || !selDq || !currentTournamentData) return;

  const matches = Object.values(currentTournamentData.matches || {});
  // Chỉ hoán đổi các trận chưa hoàn tất hoặc ở vòng 1
  const round1Matches = matches.filter(m => m.round_level === 1 || !m.round_level || m.status !== 'COMPLETED');

  const options = [];
  const dqOptions = [];

  round1Matches.forEach(m => {
    if (m.team_a && m.team_a.student_id) {
      options.push({
        match_id: m.match_id,
        side: 'team_a',
        student_id: m.team_a.student_id,
        team_name: m.team_a.team_name,
        match_title: m.title || m.round_name || m.match_id
      });
      dqOptions.push({
        student_id: m.team_a.student_id,
        team_name: m.team_a.team_name,
        match_title: m.title || m.round_name || m.match_id
      });
    }
    if (m.team_b && m.team_b.student_id) {
      options.push({
        match_id: m.match_id,
        side: 'team_b',
        student_id: m.team_b.student_id,
        team_name: m.team_b.team_name,
        match_title: m.title || m.round_name || m.match_id
      });
      dqOptions.push({
        student_id: m.team_b.student_id,
        team_name: m.team_b.team_name,
        match_title: m.title || m.round_name || m.match_id
      });
    }
  });

  const renderOpts = (selectedIdx) => {
    return options.map((opt, idx) => {
      const val = JSON.stringify(opt);
      const isSel = idx === selectedIdx ? 'selected' : '';
      const sideName = opt.side === 'team_a' ? 'Đỏ' : 'Xanh';
      return `<option value='${escapeHtml(val)}' ${isSel}>${escapeHtml(opt.team_name)} (MSSV: ${opt.student_id} • ${opt.match_title} - Bên ${sideName})</option>`;
    }).join('');
  };

  sel1.innerHTML = renderOpts(0);
  sel2.innerHTML = renderOpts(options.length > 1 ? 1 : 0);

  selDq.innerHTML = dqOptions.map(opt => {
    return `<option value="${escapeHtml(opt.student_id)}">${escapeHtml(opt.team_name)} (MSSV: ${opt.student_id} • ${opt.match_title})</option>`;
  }).join('');

  updateBracketSwapPreview();
}

function updateBracketSwapPreview() {
  const sel1 = document.getElementById('swap-sel-team-1');
  const sel2 = document.getElementById('swap-sel-team-2');
  const previewBox = document.getElementById('swap-diff-preview');
  const previewContent = document.getElementById('swap-diff-content');

  if (!sel1 || !sel2 || !previewBox || !previewContent) return;

  try {
    const item1 = JSON.parse(sel1.value);
    const item2 = JSON.parse(sel2.value);

    if (item1.student_id === item2.student_id && item1.match_id === item2.match_id && item1.side === item2.side) {
      previewBox.style.display = 'block';
      previewContent.innerHTML = `<span style="color:#ef4444; font-weight:600;">⚠️ Hai đội được chọn đang trùng nhau! Vui lòng chọn 2 vị trí khác nhau để hoán đổi.</span>`;
      return;
    }

    const side1 = item1.side === 'team_a' ? 'Đội Đỏ' : 'Đội Xanh';
    const side2 = item2.side === 'team_a' ? 'Đội Đỏ' : 'Đội Xanh';

    previewBox.style.display = 'block';
    previewContent.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 6px; font-size: 13px;">
        <div style="color: #1e293b;">
          <strong>Vị trí 1:</strong> <code>${escapeHtml(item1.match_title)} (${side1})</code> 
          sẽ chuyển từ <strong>${escapeHtml(item1.team_name)}</strong> ➔ <span style="color: #2563eb; font-weight: 700;">${escapeHtml(item2.team_name)}</span>
        </div>
        <div style="color: #1e293b;">
          <strong>Vị trí 2:</strong> <code>${escapeHtml(item2.match_title)} (${side2})</code> 
          sẽ chuyển từ <strong>${escapeHtml(item2.team_name)}</strong> ➔ <span style="color: #2563eb; font-weight: 700;">${escapeHtml(item1.team_name)}</span>
        </div>
        <div style="font-size: 11.5px; color: #64748b; margin-top: 4px;">
          Lưu ý: Mọi thay đổi cặp đấu sẽ được ghi nhật ký hệ thống và tự động cập nhật cây thi đấu.
        </div>
      </div>
    `;
  } catch {
    previewBox.style.display = 'none';
  }
}

async function confirmAndExecuteSwap() {
  const sel1 = document.getElementById('swap-sel-team-1');
  const sel2 = document.getElementById('swap-sel-team-2');
  const alertBox = document.getElementById('bracket-swap-alert');
  const btn = document.getElementById('btn-confirm-swap');

  if (!sel1 || !sel2 || !currentTournamentId) return;

  let item1, item2;
  try {
    item1 = JSON.parse(sel1.value);
    item2 = JSON.parse(sel2.value);
  } catch (err) {
    if (alertBox) { alertBox.textContent = 'Dữ liệu chọn không hợp lệ.'; alertBox.style.display = 'block'; }
    return;
  }

  if (item1.student_id === item2.student_id && item1.match_id === item2.match_id && item1.side === item2.side) {
    if (alertBox) { alertBox.textContent = 'Vui lòng chọn 2 đội khác nhau để hoán đổi.'; alertBox.style.display = 'block'; }
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Đang hoán đổi...';
  }
  if (alertBox) alertBox.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/swap-bracket`, {
      method: 'POST',
      headers: getArenaAuthHeaders(),
      body: JSON.stringify({
        match_a_id: item1.match_id,
        side_a: item1.side,
        match_b_id: item2.match_id,
        side_b: item2.side
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Không thể hoán đổi cặp đấu.');

    notifySuccess('Hoán đổi thành công', `Đã hoán đổi vị trí của ${item1.team_name} và ${item2.team_name}.`);
    closeBracketSwapModal();
    await loadActiveTournament(currentTournamentId);
    renderBracketTree(currentTournamentData);
  } catch (err) {
    if (alertBox) {
      alertBox.textContent = err.message;
      alertBox.style.display = 'block';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Xác nhận hoán đổi';
    }
  }
}

async function confirmAndExecuteDisqualification() {
  const selDq = document.getElementById('dq-sel-team');
  const reasonInp = document.getElementById('dq-reason');
  const alertBox = document.getElementById('bracket-swap-alert');
  const btn = document.getElementById('btn-confirm-dq');

  const sid = selDq?.value;
  const reason = (reasonInp?.value || '').trim();

  if (!sid) {
    if (alertBox) { alertBox.textContent = 'Vui lòng chọn đội cần xử loại.'; alertBox.style.display = 'block'; }
    return;
  }
  if (!reason) {
    if (alertBox) { alertBox.textContent = 'Vui lòng nêu rõ lý do xử loại đội thi.'; alertBox.style.display = 'block'; }
    return;
  }

  const confirmed = await confirmAction(`Bạn có chắc chắn muốn xử loại đội (MSSV: ${sid}) khỏi giải đấu? Đối thủ sẽ được xử thắng trực tiếp.`);
  if (!confirmed) return;

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Đang xử loại...';
  }

  try {
    const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/disqualify-team`, {
      method: 'POST',
      headers: getArenaAuthHeaders(),
      body: JSON.stringify({
        student_id: sid,
        reason: reason
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Không thể xử loại đội thi.');

    notifySuccess('Đã xử loại đội', data.message || `Đã loại đội ${sid} khỏi giải đấu.`);
    closeBracketSwapModal();
    await loadActiveTournament(currentTournamentId);
    renderBracketTree(currentTournamentData);
  } catch (err) {
    if (alertBox) {
      alertBox.textContent = err.message;
      alertBox.style.display = 'block';
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Xác nhận xử loại';
    }
  }
}


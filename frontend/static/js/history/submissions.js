window.viewSubmissionCode = function(subId) {
  const modal = document.getElementById("modal-view-code");
  const title = document.getElementById("code-viewer-title") || document.getElementById("view-code-modal-title");
  const meta = document.getElementById("code-viewer-meta");
  const box = document.getElementById("code-viewer-box") || document.getElementById("view-code-content-a");
  if (!modal) return;

  const sub = (window._lastSubmissionsCache || []).find(s => s.submission_id === subId);
  if (title) title.textContent = `Bài nộp: ${subId}`;
  if (meta) meta.textContent = sub ? `Đội: ${sub.team_name} • Round ${sub.round_number} (${sub.language || 'PYTHON'})` : "";
  const codeContent = sub ? (sub.code || sub.code_content || "") : "";
  if (box) box.textContent = codeContent || "# Không thể tải nội dung mã nguồn của bài nộp này.";

  modal.style.display = "flex";
};

async function loadMatchSubmissions(matchId) {
  if (!currentTournamentId || !matchId || currentAppRole === "GUEST" || !sessionStorage.getItem("arenaSessionToken")) return;
  const tournamentId = currentTournamentId;

  const tbody = document.getElementById("tbody-match-submissions");
  const tbodyKaggle = document.getElementById("tbody-kaggle-submissions");
  if (!tbody && !tbodyKaggle) return;

  try {
    const roleParam = currentAppRole || currentUserRole || "ADMIN";
    const sidParam = currentTeamStudentId || "";
    const res = await fetch(`${API_BASE}/api/tournaments/${currentTournamentId}/matches/${matchId}/submissions?role=${encodeURIComponent(roleParam)}&student_id=${encodeURIComponent(sidParam)}`);
    if (!res.ok) return;
    const subs = await res.json();
    if (tournamentId !== currentTournamentId || matchId !== currentActiveMatchId) return;
    window._lastSubmissionsCache = subs || [];

    if (!subs || subs.length === 0) {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Chưa có bài nộp nào cho trận đấu này.</td></tr>`;
      }
      if (tbodyKaggle) {
        tbodyKaggle.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Chưa có bài nộp nào.</td></tr>`;
      }
      return;
    }

    if (tbody) {
      tbody.innerHTML = "";
      subs.slice().reverse().forEach(s => {
        const tr = document.createElement("tr");
        const d = new Date((s.submitted_at || Date.now() / 1000) * 1000);
        const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        const sideText = s.side === "team_a" ? `<span class="text-danger" style="font-weight:700">Đội Đỏ (${escapeHtml(s.team_name)})</span>` : `<span class="text-primary" style="font-weight:700">Đội Xanh (${escapeHtml(s.team_name)})</span>`;
        const validText = s.is_valid
          ? `<span class="badge-tag" style="background:#dcfce7; color:#15803d; border:1px solid #86efac;">Hợp Lệ [OK] (${s.execution_time_ms || 0}ms)</span>`
          : `<span class="badge-tag" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5;" title="${escapeHtml(s.error_message || '')}">Không Hợp Lệ [FAIL]</span>`;
        const lockedText = s.is_locked
          ? `<span style="color:#d97706; font-weight:700;">Đã Khóa [LOCKED]</span>`
          : `<span style="color:#16a34a; font-weight:600;">Sẵn Sàng</span>`;

        tr.innerHTML = `
          <td><code>${escapeHtml(s.submission_id)}</code></td>
          <td>${sideText}</td>
          <td><strong>Round ${s.round_number}</strong>${s.explanation ? `<p class="submission-explanation">${escapeHtml(s.explanation)}</p>` : ''}</td>
          <td><span class="badge-tag">${escapeHtml(s.language || 'PYTHON')}</span></td>
          <td>${validText}</td>
          <td>${timeStr}</td>
          <td>${lockedText}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    if (tbodyKaggle) {
      tbodyKaggle.innerHTML = "";
      subs.slice().reverse().forEach(s => {
        const tr = document.createElement("tr");
        const d = new Date((s.submitted_at || Date.now() / 1000) * 1000);
        const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        const validText = s.is_valid
          ? `<span class="badge-tag" style="background:#dcfce7; color:#15803d; border:1px solid #86efac;">Hợp Lệ [OK]</span>`
          : `<span class="badge-tag" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5;" title="${escapeHtml(s.error_message || '')}">Không Hợp Lệ [FAIL]</span>`;
        tr.innerHTML = `
          <td><code>${escapeHtml(s.submission_id)}</code></td>
          <td>${timeStr}</td>
          <td><strong>Round ${s.round_number}</strong> (${escapeHtml(s.language || 'PYTHON')})</td>
          <td>${validText}</td>
          <td><button class="btn btn-sm btn-outline" onclick="window.viewSubmissionCode('${escapeHtml(s.submission_id)}')">Xem Code</button></td>
        `;
        tbodyKaggle.appendChild(tr);
      });
    }
  } catch (err) {
    console.error("Lỗi tải submissions:", err);
  }
}


function openCodeViewerModal(record) {
  document.getElementById("code-viewer-title").textContent=`Mã lệnh đã chạy ở hiệp ${record.round_number}`;
  document.getElementById("code-viewer-meta").textContent="Chỉ hiển thị mã nguồn mà tài khoản được phép xem.";
  const sources=[];
  if (record.team_a_code) sources.push(`Đội Đỏ (${record.team_a_lang || "PYTHON"})\n${record.team_a_code}`);
  if (record.team_b_code) sources.push(`Đội Xanh (${record.team_b_lang || "PYTHON"})\n${record.team_b_code}`);
  document.getElementById("code-viewer-box").textContent=sources.join("\n\n") || "Không có quyền xem mã nguồn hiệp này.";
  document.getElementById("modal-view-code").style.display="flex";
}

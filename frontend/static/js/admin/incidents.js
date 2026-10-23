function updateSubmissionWindowNotice() {
  const notice = document.getElementById('submission-window-notice');
  const match = currentTournamentData?.matches?.[currentActiveMatchId];
  if (!notice || !match) { if (notice) notice.hidden = true; return; }
  const blocked = stageBlockReason(match) || (match.status === 'COMPLETED' ? 'Trận đã kết thúc. Bạn có thể xem lại kết quả và lịch sử hiệp đấu.' : match.battle_running ? 'Hiệp đang chạy, đã khóa nhận bài.' : match.round_status === 'ROUND_FINISHED' ? 'Đang nghỉ giữa hai hiệp. Chờ hiệp tiếp theo để nộp bài.' : '');
  notice.hidden = !blocked && !match.admin_decision;
  notice.textContent = [blocked, match.admin_decision ? `Quyết định của ban tổ chức: ${match.admin_decision}` : ''].filter(Boolean).join(' ');
}
setInterval(() => { if (!document.hidden) updateSubmissionWindowNotice(); }, 1000);

async function openMatchCorrection() {
  if (currentAppRole !== 'ADMIN' || !currentActiveMatchId || document.getElementById('incident-dialog')) return;
  const tournamentId = currentTournamentId, matchId = currentActiveMatchId;
  await loadActiveTournament(tournamentId);
  if (currentTournamentId !== tournamentId || currentActiveMatchId !== matchId) return;
  // Correction tokens must come from the latest server snapshot. The normal
  // refresh path coalesces in-flight realtime requests and can return an older snapshot.
  const response = await fetch(`${API_BASE}/api/tournaments/${encodeURIComponent(tournamentId)}`, {cache: 'no-store'});
  if (!response.ok) { notifyWarning('Chưa thể sửa', 'Không tải được dữ liệu mới nhất của trận đấu.'); return; }
  const latest = await response.json();
  if (currentTournamentId !== tournamentId || currentActiveMatchId !== matchId) return;
  currentTournamentData = latest;
  const match = latest?.matches?.[matchId];
  const token = latest?.correction_token;
  if (!match?.team_a || !match?.team_b || !token) { notifyWarning('Chưa thể sửa', 'Trận phải có đủ hai đội và dữ liệu mới nhất.'); return; }
  const priorFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.id = 'incident-dialog'; dialog.className = 'app-action-dialog incident-dialog';
  dialog.setAttribute('aria-labelledby', 'incident-title');
  dialog.innerHTML = `<form class="incident-form">
    <h3 id="incident-title">Xử lý sự cố trận đấu</h3>
    <p class="text-muted">Chỉ xác nhận sau khi đối chiếu với trọng tài. Kết quả sẽ cập nhật đội đi tiếp. Nhánh đã nhận bài hoặc thi đấu sẽ được bảo vệ.</p>
    <div class="incident-scores"><label><span id="incident-team-a"></span><input name="scoreA" type="number" min="0" max="3" required></label><label><span id="incident-team-b"></span><input name="scoreB" type="number" min="0" max="3" required></label></div>
    <label>Lý do quyết định<textarea name="reason" required minlength="5" maxlength="500" rows="3" placeholder="Mô tả sự cố và quyết định của trọng tài"></textarea></label>
    <p class="incident-error" role="alert"></p>
    <details><summary>Nhật ký xử lý gần đây</summary><ul class="incident-history"></ul></details>
    <div class="app-action-buttons"><button type="button" class="btn btn-outline" data-action="close">Đóng</button><button type="button" class="btn btn-outline" data-action="rollback">Hoàn tác lần sửa</button><button class="btn btn-primary" type="submit">Xác nhận kết quả</button></div>
  </form>`;
  dialog.querySelector('#incident-team-a').textContent = match.team_a.team_name;
  dialog.querySelector('#incident-team-b').textContent = match.team_b.team_name;
  const form = dialog.querySelector('form');
  form.elements.scoreA.value = match.team_a.rounds_won || 0;
  form.elements.scoreB.value = match.team_b.rounds_won || 0;
  const events = (currentTournamentData.incident_log || []).filter(row => row.match_id === matchId).slice(-5).reverse();
  for (const row of events) {
    const item = document.createElement('li');
    item.textContent = `${new Date(row.at).toLocaleString('vi-VN')} · ${row.action === 'rollback' ? 'Hoàn tác' : 'Sửa kết quả'} · ${row.reason}`;
    dialog.querySelector('ul').appendChild(item);
  }
  if (!events.length) dialog.querySelector('ul').textContent = 'Chưa có quyết định sửa kết quả.';
  let busy = false;
  async function save(action) {
    if (busy || !form.elements.reason.reportValidity()) return;
    if (action === 'result' && !form.reportValidity()) return;
    busy = true;
    dialog.querySelectorAll('button').forEach(button => button.disabled = true);
    try {
      const response = await fetch(`${API_BASE}/api/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/correction`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({token, action, reason:form.elements.reason.value.trim(), score_a:Number(form.elements.scoreA.value), score_b:Number(form.elements.scoreB.value)})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Không lưu được quyết định.');
      dialog.close();
      await loadActiveTournament(tournamentId);
      notifySuccess('Đã lưu quyết định', result.message);
      broadcastCrossTabSync('MATCH_UPDATED');
    } catch (error) { dialog.querySelector('.incident-error').textContent = error.message; }
    finally { busy = false; dialog.querySelectorAll('button').forEach(button => button.disabled = false); }
  }
  form.addEventListener('submit', event => { event.preventDefault(); save('result'); });
  dialog.querySelector('[data-action="rollback"]').onclick = () => save('rollback');
  dialog.querySelector('[data-action="close"]').onclick = () => dialog.close();
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => { dialog.remove(); priorFocus?.focus(); }, {once:true});
  document.body.appendChild(dialog); dialog.showModal(); form.elements.reason.focus();
}

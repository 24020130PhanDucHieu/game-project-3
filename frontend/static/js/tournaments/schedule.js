let scheduleTournamentId = null;
function editSavedStageSchedule() {
  document.querySelectorAll('#stage-schedule-fields input[data-editable="true"]').forEach(input => input.disabled=false);
  document.getElementById('stage-schedule-error').textContent='Sửa giờ rồi bấm Lưu lịch. Vòng đã đấu chỉ được gia hạn giờ đóng. Đóng cửa sổ để bỏ thay đổi chưa lưu.';
  document.querySelector('#stage-schedule-fields input:not(:disabled)')?.focus();
}

function tournamentStages(tournament) {
  const groups = new Map();
  for (const match of Object.values(tournament?.matches || {})) {
    const level = Number(match.round_level);
    if (!groups.has(level)) groups.set(level, { level, name: match.round_name, matches: [] });
    groups.get(level).matches.push(match);
  }
  return [...groups.values()].sort((a, b) => a.level - b.level);
}

function stageBlockReason(match, tournament = currentTournamentData) {
  const rule = tournament?.stage_rules?.[match.round_level];
  const now = typeof arenaNowSeconds === 'function' ? arenaNowSeconds() : Date.now()/1000;
  if (rule?.hidden || rule?.publish_at > now) return 'Chờ công bố luật vòng đấu';
  if (Object.values(tournament?.matches || {}).some(previous => previous.round_level < match.round_level && previous.status !== 'COMPLETED')) return 'Chờ vòng trước hoàn tất';
  const window = tournament?.stage_schedule?.[match.round_level];
  if (!window) return '';
  if (now < window.starts_at) return 'Chưa đến giờ mở vòng';
  if (now >= window.ends_at) return 'Đã hết giờ vòng đấu';
  return '';
}

function renderStageTimeline(tournament = currentTournamentData) {
  const container = document.getElementById('stage-timeline');
  if (!container) return;
  container.replaceChildren();
  for (const stage of tournamentStages(tournament)) {
    const item = document.createElement('div'); item.className = 'stage-timeline-item';
    const title = document.createElement('strong'); title.textContent = stage.name;
    const window = tournament?.stage_schedule?.[stage.level];
    const times = document.createElement('span');
    times.textContent = window ? `${new Date(window.starts_at * 1000).toLocaleString('vi-VN')} → ${new Date(window.ends_at * 1000).toLocaleString('vi-VN')}` : 'Chưa đặt giờ';
    const status = document.createElement('small');
    status.textContent = stage.matches.every(match => match.status === 'COMPLETED') ? 'Hoàn tất' : stageBlockReason(stage.matches[0], tournament) || 'Có thể thi đấu';
    const ruleLabel = document.createElement('span');
    const ruleInfo = stageRuleInfo(tournament, stage.matches[0]);
    ruleLabel.textContent = ruleInfo.name; ruleLabel.title = ruleInfo.description;
    item.append(title, times, ruleLabel, status); container.appendChild(item);
  }
}

function localDatetime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function openStageSchedule() {
  if (currentAppRole !== 'ADMIN') { notifyWarning('Chỉ dành cho Admin', 'Ban tổ chức mới được đặt lịch vòng đấu.'); return; }
  if (!currentTournamentData) { notifyWarning('Chưa chọn giải', 'Hãy chọn giải đấu trước.'); return; }
  scheduleTournamentId = currentTournamentId;
  document.getElementById('stage-schedule-tournament').textContent = currentTournamentData.name;
  const fields = document.getElementById('stage-schedule-fields'); fields.replaceChildren();
  document.getElementById('stage-schedule-error').textContent = '';
  for (const stage of tournamentStages(currentTournamentData)) {
    const row = document.createElement('fieldset'); row.dataset.level = stage.level;
    const legend = document.createElement('legend'); legend.textContent = stage.name; row.appendChild(legend);
    const window = currentTournamentData.stage_schedule?.[stage.level];
    if (window) row.dataset.originalStart = window.starts_at;
    const played = stage.matches.some(match => match.rounds_history?.length || match.battle_running);
    for (const [key, label] of [['starts_at', 'Giờ mở'], ['ends_at', 'Giờ đóng']]) {
      const wrapper = document.createElement('label'); wrapper.textContent = label;
      const input = document.createElement('input'); input.type = 'datetime-local'; input.className = 'login-input-field';
      input.dataset.time = key; input.value = localDatetime(window?.[key]);
      input.disabled = currentTournamentData.status === 'FINISHED' || (played && window && key === 'starts_at');
      input.dataset.editable = String(!input.disabled);
      if (window) input.disabled = true;
      input.dataset.originalValue = input.value;
      input.dataset.originalTimestamp = window?.[key] || 0;
      wrapper.appendChild(input); row.appendChild(wrapper);
    }
    fields.appendChild(row);
    if (played) {
      const note = document.createElement('p'); note.className = 'stage-schedule-note';
      note.textContent = window ? 'Vòng đã thi đấu: giữ giờ mở, chỉ gia hạn giờ đóng.' : 'Vòng đã thi đấu nhưng chưa đặt lịch: chọn giờ mở trong quá khứ và giờ đóng trong tương lai.';
      row.appendChild(note);
    }
  }
  document.getElementById('btn-save-stage-schedule').disabled = currentTournamentData.status === 'FINISHED';
  document.getElementById('btn-edit-stage-schedule').disabled = currentTournamentData.status === 'FINISHED';
  document.getElementById('dialog-stage-schedule').showModal();
}

async function saveStageSchedule(event) {
  event.preventDefault();
  const button = document.getElementById('btn-save-stage-schedule');
  if (button.disabled) return;
  const windows = [];
  const error = document.getElementById('stage-schedule-error'); error.textContent = '';
  for (const row of document.querySelectorAll('#stage-schedule-fields fieldset')) {
    const start = row.querySelector('[data-time="starts_at"]').value;
    const end = row.querySelector('[data-time="ends_at"]').value;
    if (!start && !end) continue;
    if (!start || !end) { error.textContent = 'Nhập đủ giờ mở và giờ đóng cho mỗi vòng.'; return; }
    const timestamp = key => { const input=row.querySelector(`[data-time="${key}"]`); return input.value===input.dataset.originalValue ? Number(input.dataset.originalTimestamp) : new Date(input.value).getTime()/1000; };
    windows.push({ level: Number(row.dataset.level), starts_at: timestamp('starts_at'), ends_at: timestamp('ends_at') });
  }
  button.disabled = true;
  try {
    const response = await fetch(`${API_BASE}/api/tournaments/${encodeURIComponent(scheduleTournamentId)}/stage-schedule`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ windows })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Không thể lưu lịch.');
    document.getElementById('dialog-stage-schedule').close();
    if (currentTournamentId === scheduleTournamentId) await loadActiveTournament(scheduleTournamentId);
    notifySuccess('Đã lưu lịch vòng đấu', 'Lịch được áp dụng cho tất cả đội và Ban tổ chức.');
  } catch (err) { error.textContent = err.message; }
  finally { button.disabled = false; }
}

setInterval(() => {
  if (!document.hidden && currentTournamentData) {
    renderStageTimeline();
    const button = document.getElementById('btn-arena-start-match');
    const match = currentMatchData;
    if (currentAppRole === 'ADMIN' && match && button) {
      const blocked = stageBlockReason(match);
      button.title = blocked;
      button.disabled = Boolean(blocked) || !(match.team_a?.code_valid && match.team_b?.code_valid) || match.status === 'COMPLETED' || match.round_status === 'ROUND_FINISHED' || match.battle_running || isMatchRunning;
    }
  }
}, 1000);

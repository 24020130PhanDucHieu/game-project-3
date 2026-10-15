const BOARD_RULE_PRESETS = {
  STAGE_1_STANDARD: { name: 'Luật chuẩn', description: '3 Búa, 3 Bao, 3 Kéo. Búa thắng Kéo, Kéo thắng Bao, Bao thắng Búa. Thấy loại quân đối phương.' },
  STAGE_2_MUTATED: { name: 'Đổi cơ cấu quân', description: '5 Búa, 2 Bao, 2 Kéo. Tương khắc chuẩn, thấy loại quân đối phương.' },
  RULE_REVERSE: { name: 'Đảo tương khắc', description: '3 Búa, 3 Bao, 3 Kéo. Búa thắng Bao, Bao thắng Kéo, Kéo thắng Búa trong mọi nước đi.' },
  RULE_FOG: { name: 'Sương mù', description: '3 Búa, 3 Bao, 3 Kéo. Tương khắc chuẩn. Bot thấy vị trí nhưng không thấy loại quân đối phương hoặc nước chọn trong lịch sử đối thủ.' },
  RULE_MUTATED_FOG: { name: 'Quân lệch + sương mù', description: '5 Búa, 2 Bao, 2 Kéo. Tương khắc chuẩn. Bot không thấy loại quân hoặc nước chọn của đối thủ.' },
  STAGE_3_REVERSE_FOG: { name: 'Sương mù + đảo lượt lẻ (luật cũ)', description: '3 quân mỗi loại; ẩn loại quân đối phương, đảo tương khắc ở lượt lẻ của mỗi đội.' },
  STAGE_4_FINALS: { name: 'Chung kết biến thể (luật cũ)', description: '2 Búa, 4 Bao, 3 Kéo; sương mù, đảo tương khắc mỗi lượt chia hết cho 3.' }
};
const RULE_OPTIONS = [
  {bit:1, name:'Trộn quân', detail:'9 quân mỗi bên, số lượng từng loại và vị trí ngẫu nhiên theo hiệp.'},
  {bit:2, name:'Đảo tương khắc', detail:'Búa thắng Bao · Bao thắng Kéo · Kéo thắng Búa.'},
  {bit:4, name:'Sương mù', detail:'Quân đối thủ hiện dấu ?; bot không nhận loại quân đối thủ.'}
];
function ruleBits(id) {
  if (/^COMBO_[0-7]$/.test(id)) return Number(id.slice(-1));
  return {STAGE_2_MUTATED:1,RULE_REVERSE:2,RULE_FOG:4,RULE_MUTATED_FOG:5,STAGE_3_REVERSE_FOG:6,STAGE_4_FINALS:7}[id] || 0;
}
for (let bits=0; bits<8; bits++) {
  const chosen = RULE_OPTIONS.filter(option => bits & option.bit);
  BOARD_RULE_PRESETS[`COMBO_${bits}`] = {
    name: chosen.map(option => option.name).join(' + ') || 'Luật chuẩn',
    description: chosen.map(option => option.detail).join(' ') || BOARD_RULE_PRESETS.STAGE_1_STANDARD.description
  };
}
let rulesTournamentId = null;
let correctingStageRules = false;
function editSavedStageRules() {
  correctingStageRules = true;
  for (const row of document.querySelectorAll('#stage-rules-fields fieldset[data-played="false"]')) {
    row.dataset.locked='false';
    row.querySelectorAll('input').forEach(input => input.disabled=false);
    row.querySelector(':scope > small').textContent='Đang sửa. Lưu lại sẽ yêu cầu các đội nộp lại bot hợp lệ.';
  }
  document.getElementById('btn-save-stage-rules').disabled=!document.querySelector('#stage-rules-fields input:not(:disabled)');
  document.getElementById('stage-rules-error').textContent='Đã mở sửa các vòng chưa thi đấu. Thay đổi chỉ áp dụng khi bấm Lưu luật.';
}
function stageRuleInfo(tournament, match) {
  const configured = tournament?.stage_rules?.[match?.round_level];
  if (configured?.hidden || configured?.publish_at > Date.now()/1000) return { name: 'Chưa công bố luật', description: `Công bố lúc ${new Date(configured.publish_at*1000).toLocaleString('vi-VN')}`, hidden:true };
  return BOARD_RULE_PRESETS[configured?.rule_id || tournament?.stage_rule || 'STAGE_1_STANDARD'] || BOARD_RULE_PRESETS.STAGE_1_STANDARD;
}
function renderMatchRule() {
  const match = currentTournamentData?.matches?.[currentActiveMatchId];
  const info = stageRuleInfo(currentTournamentData, match);
  const configured = currentTournamentData?.stage_rules?.[match?.round_level];
  const ruleId = configured?.rule_id || currentTournamentData?.stage_rule;
  const fogNote = !info.hidden && (ruleBits(ruleId) & 4)
    ? ' Bàn của đội thi ẩn loại quân đối thủ bằng dấu ?.' : '';
  for (const id of ['match-rule-summary','studio-rule-summary']) {
    const element = document.getElementById(id);
    if (element) element.textContent = match ? `${match.round_name} · ${info.name}: ${info.description}${fogNote}` : '';
  }
  const button = document.getElementById('btn-stage-rules');
  if (button) button.style.display = currentAppRole === 'ADMIN' ? 'inline-flex' : 'none';
}
function openStageRules() {
  if (currentAppRole !== 'ADMIN') { notifyWarning('Chỉ dành cho Admin', 'Ban tổ chức mới được thiết lập luật.'); return; }
  if (!currentTournamentData) { notifyWarning('Chưa chọn giải', 'Hãy chọn giải đấu trước.'); return; }
  rulesTournamentId = currentTournamentId;
  correctingStageRules = false;
  document.getElementById('stage-rules-tournament').textContent = currentTournamentData.name;
  document.getElementById('stage-rules-error').textContent = '';
  const fields = document.getElementById('stage-rules-fields'); fields.replaceChildren();
  for (const stage of tournamentStages(currentTournamentData)) {
    const row = document.createElement('fieldset'); row.dataset.level = stage.level;
    const legend = document.createElement('legend'); legend.textContent = stage.name;
    const saved = currentTournamentData.stage_rules?.[stage.level];
    const locked = currentTournamentData.status === 'FINISHED' || stage.matches.some(m => m.rounds_history?.length || m.battle_running || m.status === 'COMPLETED') || (saved && saved.publish_at <= Date.now()/1000);
    row.dataset.locked = locked ? 'true' : 'false';
    row.dataset.played = String(currentTournamentData.status === 'FINISHED' || stage.matches.some(m => m.rounds_history?.length || m.battle_running || m.status === 'COMPLETED'));
    const existingRule = saved?.rule_id || currentTournamentData.stage_rule || 'STAGE_1_STANDARD';
    row.dataset.ruleId = existingRule;
    const choices = document.createElement('div'); choices.className = 'stage-rule-choices';
    for (const option of RULE_OPTIONS) {
      const label = document.createElement('label'); label.className = 'stage-rule-choice';
      const checkbox = document.createElement('input'); checkbox.type='checkbox'; checkbox.value=option.bit;
      checkbox.checked=Boolean(ruleBits(existingRule) & option.bit); checkbox.disabled=locked;
      const text=document.createElement('span');
      const title=document.createElement('strong'); title.textContent=option.name;
      const hint=document.createElement('small'); hint.textContent=option.detail;
      text.append(title,hint); label.append(checkbox,text); choices.append(label);
      checkbox.addEventListener('change', () => {
        row.dataset.dirty='true';
        row.dataset.ruleId=`COMBO_${[...choices.querySelectorAll('input:checked')].reduce((bits, item) => bits | Number(item.value),0)}`;
        describe();
      });
    }
    const description = document.createElement('p'); description.className = 'stage-rule-description';
    const describe = () => { description.textContent = (BOARD_RULE_PRESETS[row.dataset.ruleId] || BOARD_RULE_PRESETS.STAGE_1_STANDARD).description; }; describe();
    const timeLabel = document.createElement('label'); timeLabel.textContent = 'Giờ công bố (trống = ngay khi lưu)';
    const input = document.createElement('input'); input.type = 'datetime-local'; input.className = 'login-input-field'; input.value = localDatetime(saved?.publish_at); input.disabled = locked; timeLabel.append(input);
    input.dataset.originalValue = input.value; input.dataset.originalTimestamp = saved?.publish_at || 0;
    input.addEventListener('input', () => { row.dataset.dirty='true'; });
    const note = document.createElement('small'); note.textContent = locked ? 'Đã khóa luật của vòng này.' : 'Kiểm tra trước khi lưu: công bố ngay sẽ khóa cấu hình.';
    row.append(legend,choices,timeLabel,description,note); fields.append(row);
  }
  document.getElementById('btn-save-stage-rules').disabled = !fields.querySelector('input:not(:disabled)');
  document.getElementById('btn-edit-stage-rules').disabled = !fields.querySelector('fieldset[data-played="false"]');
  document.getElementById('dialog-stage-rules').showModal();
}
async function saveStageRules(event) {
  event.preventDefault(); const button = document.getElementById('btn-save-stage-rules'); if (button.disabled) return;
  const rules = [...document.querySelectorAll('#stage-rules-fields fieldset')].filter(row => row.dataset.locked !== 'true' && row.dataset.dirty === 'true').map(row => {
    const input = row.querySelector('input[type="datetime-local"]');
    return {level:Number(row.dataset.level),rule_id:row.dataset.ruleId,publish_at:input.value === input.dataset.originalValue ? Number(input.dataset.originalTimestamp) : input.value ? new Date(input.value).getTime()/1000 : 0};
  });
  if (!rules.length) { document.getElementById('stage-rules-error').textContent = 'Hãy chọn luật cho ít nhất một vòng chưa khóa.'; return; }
  button.disabled=true;
  try {
    const response = await fetch(`${API_BASE}/api/tournaments/${encodeURIComponent(rulesTournamentId)}/stage-rules`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({rules,correction:correctingStageRules})});
    const data = await response.json(); if (!response.ok) throw new Error(data.detail || 'Không lưu được luật.');
    document.getElementById('dialog-stage-rules').close();
    if (currentTournamentId === rulesTournamentId) await loadActiveTournament(rulesTournamentId);
    notifySuccess('Đã lưu luật từng vòng','Các đội xem luật công bố trong bảng đấu và phòng nộp code.');
  } catch(error) { document.getElementById('stage-rules-error').textContent = error.message; }
  finally { button.disabled=false; }
}

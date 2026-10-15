function renderTeamProfile() {
  const root=document.getElementById('tab-profile');
  if (!root) return;
  if (currentAppRole !== 'TEAM') {
    root.querySelectorAll('#profile-team-name,#profile-student-id,#profile-stats,#profile-details,#profile-matches').forEach(el=>el.replaceChildren());
    return;
  }
  const sid=String(currentTeamStudentId || '').trim();
  const matches=Object.values(currentTournamentData?.matches || {}).filter(match => [match.team_a,match.team_b].some(team=>String(team?.student_id || '').trim()===sid));
  const team=currentTournamentData?.teams?.find(team=>String(team.student_id).trim()===sid) || matches.flatMap(match=>[match.team_a,match.team_b]).find(team=>String(team?.student_id || '').trim()===sid);
  document.getElementById('profile-team-name').textContent=currentTeamName || team?.team_name || 'Đội thi';
  document.getElementById('profile-student-id').textContent=`Mã sinh viên · ${sid || '—'}`;
  const finished=matches.filter(match=>match.status==='COMPLETED');
  const wins=finished.filter(match=>match.winner_name===(team?.team_name || currentTeamName)).length;
  const heats=matches.reduce((sum,match)=>sum+(match.rounds_history?.length || 0),0);
  const stats=document.getElementById('profile-stats'); stats.replaceChildren();
  for (const [label,value] of [['Trận hoàn tất',finished.length],['Trận thắng',wins],['Hiệp đã đấu',heats]]) {
    const card=document.createElement('div'); card.className='content-card profile-stat';
    const number=document.createElement('strong'); number.textContent=value;
    const text=document.createElement('span'); text.textContent=label;
    card.append(number,text); stats.append(card);
  }
  const details=document.getElementById('profile-details'); details.replaceChildren();
  for (const [label,value] of [['Mã sinh viên',sid],['Tên đội',currentTeamName || team?.team_name],['Trường / đơn vị',team?.university],['Giải đang xem',currentTournamentData?.name],['Trạng thái',team ? 'Đã có tên trong giải' : 'Chờ Ban tổ chức thêm vào giải']]) {
    const dt=document.createElement('dt'); dt.textContent=label;
    const dd=document.createElement('dd'); dd.textContent=value || 'Chưa cập nhật'; details.append(dt,dd);
  }
  const list=document.getElementById('profile-matches'); list.replaceChildren();
  if (!matches.length) { const p=document.createElement('p'); p.className='text-muted'; p.textContent='Chưa có lịch đấu của đội trong giải đang xem.'; list.append(p); }
  for (const match of matches.slice().sort((a,b)=>b.round_level-a.round_level)) {
    const row=document.createElement('div'); row.className='profile-match';
    const text=document.createElement('div');
    const title=document.createElement('strong'); title.textContent=match.round_name || match.title;
    const status=document.createElement('small'); status.textContent=match.status==='COMPLETED' ? `Kết quả ${match.team_a?.rounds_won || 0} – ${match.team_b?.rounds_won || 0}` : match.battle_running ? 'Đang thi đấu' : 'Chờ thi đấu';
    text.append(title,status); row.append(text); list.append(row);
  }
}
async function refreshTeamProfile() {
  if (currentAppRole !== 'TEAM') return;
  if (currentTournamentId) await loadActiveTournament(currentTournamentId);
  renderTeamProfile();
}

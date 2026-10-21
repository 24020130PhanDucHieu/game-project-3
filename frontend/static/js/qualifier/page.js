let qualifierId = localStorage.getItem('qualifier-id') || '';
let qualifierData = null, qualifierLoading = false, qualifierCreating = false, qualifierConfigId = '';
let qualifierTeamsPage = 1, qualifierRankPage = 1, qualifierTeamsTotal = 0, qualifierRankTotal = 0;
let qualifierDraftKeyLoaded = '';
let qualifierViewLoadedKey = '';
const qualifierPhaseLabels = { OPEN:'Đang nhận bài', CLOSING:'Đã đóng nhận bài · Chờ chấm xong', LOCKED:'Đã khóa bài', RUNNING:'Đang thi đấu', PAUSED:'Tạm dừng vì lỗi', FINISHED:'Hoàn tất', PROMOTED:'Đã chốt vào giải chính' };
async function qualifierAPI(path, options = {}) {
  const response = await fetch(`${API_BASE}/api/qualifiers${path}`, {cache:'no-store', ...options});
  const data = await response.json(); if (!response.ok) throw new Error(data.detail || 'Không xử lý được vòng loại.'); return data;
}
function qualifierStateKey() { return `qualifier-view:${API_BASE}:${qualifierId}:${currentTeamStudentId || currentAppRole}`; }
function saveQualifierState() { localStorage.setItem(qualifierStateKey(), JSON.stringify({ teams:qualifierTeamsPage, rank:qualifierRankPage, q:document.getElementById('qualifier-search').value, filter:document.getElementById('qualifier-filter').value })); }
function selectQualifier(id) {
  qualifierId = id; localStorage.setItem('qualifier-id', id); qualifierDraftKeyLoaded = '';
  qualifierData=null;
  renderQualifierRegistration(null);
  document.getElementById('qualifier-test-bots').disabled=true;
  for(const key of ['config','freeze','start','pause','reopen','promote'])document.getElementById(`qualifier-${key}`).disabled=true;
  document.getElementById('qualifier-submit').disabled=true;
  let state={};try {state=JSON.parse(localStorage.getItem(qualifierStateKey())||'{}');}catch{}
  qualifierTeamsPage=state.teams||1;qualifierRankPage=state.rank||1;
  document.getElementById('qualifier-search').value=state.q||'';document.getElementById('qualifier-filter').value=state.filter||'';
  qualifierViewLoadedKey=qualifierStateKey();
  loadQualifierPage();
}
async function loadQualifierPage() {
  if (qualifierLoading) return; qualifierLoading=true;
  const identity=`${currentAppRole}:${currentTeamStudentId}`;
  try {
    const list=await qualifierAPI('');
    const select=document.getElementById('qualifier-select');
    select.replaceChildren(new Option('Chọn vòng loại',''));for(const event of list) select.add(new Option(event.name,event.id));
    if(!list.some(event=>event.id===qualifierId)) qualifierId=currentAppRole==='ADMIN'?(list[0]?.id||''):'';
    select.value=qualifierId;
    if(qualifierViewLoadedKey!==qualifierStateKey()){
      let saved={};try{saved=JSON.parse(localStorage.getItem(qualifierStateKey())||'{}');}catch{}
      qualifierTeamsPage=saved.teams||1;qualifierRankPage=saved.rank||1;
      document.getElementById('qualifier-search').value=saved.q||'';document.getElementById('qualifier-filter').value=saved.filter||'';
      qualifierViewLoadedKey=qualifierStateKey();
    }
    if(!qualifierId){qualifierData=null;renderQualifierRegistration(null);document.getElementById('qualifier-submit').disabled=true;document.getElementById('qualifier-summary').textContent=list.length?'Chọn một giải vòng loại để xem thông tin.':'Chưa có vòng loại. Admin có thể tạo vòng loại mới.';for(const key of ['config','freeze','start','pause','reopen','promote','test-bots'])document.getElementById(`qualifier-${key}`).disabled=true;renderQualifierTable('qualifier-ranking',[]);renderQualifierTable('qualifier-teams',[]);return;}
    const requested=qualifierId;const data=await qualifierAPI(`/${requested}`);if(requested!==qualifierId||identity!==`${currentAppRole}:${currentTeamStudentId}`)return;qualifierData=data;
    const e=data.event;
    renderQualifierRegistration(data);
    document.getElementById('qualifier-test-bots').disabled=e.status!=='OPEN'||Date.now()/1000>=e.deadline;
    document.getElementById('qualifier-summary').textContent=`${qualifierPhaseLabels[e.status]} · Hạn: ${new Date(e.deadline*1000).toLocaleString('vi-VN')} · ${e.eligible} bot đã khóa · Lượt ${e.current_round}/${e.rounds} · ${e.completed}/${e.total} trận · Top ${e.top_k}${e.error?' · '+e.error:''}`;
    const progress=document.getElementById('qualifier-progress');progress.max=Math.max(1,e.total);progress.value=e.completed;
    document.getElementById('qualifier-config').disabled=e.status!=='OPEN';
    const repairLock=e.status==='LOCKED'&&e.current_round===0&&e.applied_round===0&&e.completed===0&&e.total===0&&e.eligible<e.top_k;
    document.getElementById('qualifier-freeze').disabled=e.status!=='OPEN'&&!repairLock;
    document.getElementById('qualifier-freeze').textContent=repairLock?'Kiểm tra lại bài đã khóa':'Khóa bài nộp';
    document.getElementById('qualifier-pause').disabled=e.status!=='RUNNING'||e.pause_requested;
    document.getElementById('qualifier-reopen').disabled=!['OPEN','CLOSING','LOCKED'].includes(e.status)||e.current_round!==0||e.total!==0;
    document.getElementById('qualifier-start').disabled=!['LOCKED','PAUSED'].includes(e.status)||e.eligible<e.top_k;
    document.getElementById('qualifier-promote').disabled=e.status!=='FINISHED';
    renderQualifierOwn(data);
    const rank=await qualifierAPI(`/${requested}/ranking?page=${qualifierRankPage}`);if(requested!==qualifierId)return;
    qualifierRankTotal=rank.total;renderQualifierTable('qualifier-ranking',rank.items.map(p=>[p.rank,`${p.team_name} (${p.student_id})`,Number(p.elo).toFixed(2),`${p.wins} / ${p.played}`]));
    document.getElementById('qualifier-ranking-page').textContent=`Trang ${qualifierRankPage} / ${Math.max(1,Math.ceil(rank.total/50))} · ${rank.total} đội`;
    if(currentAppRole==='ADMIN'){
      const query=encodeURIComponent(document.getElementById('qualifier-search').value);const filter=encodeURIComponent(document.getElementById('qualifier-filter').value);
      const teams=await qualifierAPI(`/${requested}/teams?page=${qualifierTeamsPage}&q=${query}&filter=${filter}`);if(requested!==qualifierId)return;
      qualifierTeamsTotal=teams.total;const labels={NOT_SUBMITTED:'Chưa nộp',PENDING:'Đã nhận · Đang chấm',INVALID:'Chưa có bản hợp lệ',VALID:'Có bản hợp lệ',LOCKED:'Đã khóa'};
      renderQualifierTable('qualifier-teams',teams.items.map(p=>[p.test_bot?'Thử nghiệm':p.student_id,p.team_name,labels[p.status],Number(p.elo ?? 1200).toFixed(2)]));
      document.getElementById('qualifier-teams-page').textContent=`Trang ${qualifierTeamsPage} / ${Math.max(1,Math.ceil(teams.total/50))} · ${teams.total} đội`;
      const response=await fetch(`${API_BASE}/api/tournaments/list`);if(!response.ok)throw new Error('Không tải được giải chính.');const tournaments=await response.json();
      const target=document.getElementById('qualifier-target');const selected=target.value;target.replaceChildren(new Option(`Chọn giải chính ${e.top_k} đội`,''));
      for(const tournament of tournaments.filter(t=>t.num_teams===e.top_k&&t.status!=='FINISHED'))target.add(new Option(tournament.name,tournament.tournament_id));target.value=selected;
    }
  }catch(err){if(document.getElementById('tab-qualifier').classList.contains('active'))document.getElementById('qualifier-summary').textContent=err.message;}
  finally{qualifierLoading=false;}
}
function renderQualifierTable(id,rows){const body=document.getElementById(id);body.replaceChildren();if(!rows.length){const row=body.insertRow();const cell=row.insertCell();cell.colSpan=4;cell.textContent='Chưa có dữ liệu.';return;}for(const values of rows){const row=body.insertRow();for(const value of values)row.insertCell().textContent=String(value);}}
function qualifierPage(kind,delta){if(kind==='teams')qualifierTeamsPage=Math.max(1,Math.min(Math.max(1,Math.ceil(qualifierTeamsTotal/50)),qualifierTeamsPage+delta));else qualifierRankPage=Math.max(1,Math.min(Math.max(1,Math.ceil(qualifierRankTotal/50)),qualifierRankPage+delta));saveQualifierState();loadQualifierPage();}
let qualifierSearchTimer;
function qualifierFilterChanged(){qualifierTeamsPage=1;saveQualifierState();clearTimeout(qualifierSearchTimer);qualifierSearchTimer=setTimeout(loadQualifierPage,300);}
function openQualifierConfig(create){
  if(currentAppRole!=='ADMIN'){notifyWarning('Chỉ dành cho Admin','Ban tổ chức mới được cấu hình vòng loại.');return;}
  if(!create&&!qualifierData)return;
  qualifierCreating=create;qualifierConfigId=create?'':qualifierId;const e=create?{}:qualifierData.event;
  document.getElementById('qualifier-config-name').value=e.name||'Vòng loại BOT K69';
  document.getElementById('qualifier-config-deadline').value=localDatetime(e.deadline||Date.now()/1000+86400);
  document.getElementById('qualifier-config-rounds').value=e.rounds||10;document.getElementById('qualifier-config-top').value=e.top_k||32;
  document.getElementById('qualifier-config-error').textContent='';document.getElementById('qualifier-config-dialog').showModal();
}
async function saveQualifierConfig(event){
  event.preventDefault();const button=document.getElementById('qualifier-config-save');if(button.disabled)return;button.disabled=true;
  try{const data=await qualifierAPI(qualifierConfigId?`/${qualifierConfigId}`:'',{method:qualifierConfigId?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:document.getElementById('qualifier-config-name').value,deadline:new Date(document.getElementById('qualifier-config-deadline').value).getTime()/1000,rounds:Number(document.getElementById('qualifier-config-rounds').value),top_k:Number(document.getElementById('qualifier-config-top').value)})});document.getElementById('qualifier-config-dialog').close();selectQualifier(data.id);}catch(err){document.getElementById('qualifier-config-error').textContent=err.message;}finally{button.disabled=false;}
}
async function qualifierAction(action){
  if(!qualifierId||currentAppRole!=='ADMIN')return;
  const selectedQualifier=qualifierId;
  if(action==='freeze'&&!await confirmAction('Khóa bản hợp lệ cuối cùng của các đội? Sau khi khóa không thể nộp lại.',{title:'Khóa bài vòng loại',confirmText:'Khóa bài nộp'}))return;
  if(selectedQualifier!==qualifierId)return;
  const target=document.getElementById('qualifier-target').value;if(action==='promote'&&!target){notifyWarning('Chọn giải chính','Tạo/chọn giải trống có đúng số đội top K.');return;}
  const button=document.getElementById(action==='promote'?'qualifier-promote':`qualifier-${action}`);if(button?.disabled)return;if(button)button.disabled=true;
  try{await qualifierAPI(`/${qualifierId}/actions/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tournament_id:target})});await loadQualifierPage();if(action==='promote'){await loadTournamentsList();notifySuccess('Đã chốt đội','Đội đã được ghép vào bảng đấu chính.');}}catch(err){notifyError('Không thể thực hiện',err.message);}finally{loadQualifierPage();}
}
setInterval(()=>{if(!document.hidden&&document.getElementById('tab-qualifier')?.classList.contains('active'))loadQualifierPage();},15000 + Math.random()*5000);

function openQualifierReopen(){
  if(currentAppRole!=='ADMIN'||!qualifierData||document.getElementById('qualifier-reopen').disabled)return;
  const dialog=document.getElementById('qualifier-reopen-dialog');dialog.dataset.qid=qualifierId;
  const date=new Date(Math.max(Date.now(),qualifierData.event.deadline*1000)+30*60000);
  date.setMinutes(date.getMinutes()-date.getTimezoneOffset());
  document.getElementById('qualifier-reopen-deadline').value=date.toISOString().slice(0,16);
  document.getElementById('qualifier-reopen-reason').value='';document.getElementById('qualifier-reopen-error').textContent='';dialog.showModal();
}
async function reopenQualifier(event){
  event.preventDefault();const button=document.getElementById('qualifier-reopen-save');if(button.disabled||currentAppRole!=='ADMIN')return;
  const dialog=document.getElementById('qualifier-reopen-dialog'),id=dialog.dataset.qid;
  button.disabled=true;
  try{
    await qualifierAPI(`/${id}/actions/reopen`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deadline:new Date(document.getElementById('qualifier-reopen-deadline').value).getTime()/1000,reason:document.getElementById('qualifier-reopen-reason').value})});
    dialog.close();notifySuccess('Đã gia hạn','Các đội được tiếp tục nộp bài theo cùng hạn mới.');await loadQualifierPage();
  }catch(err){document.getElementById('qualifier-reopen-error').textContent=err.message;}finally{button.disabled=false;}
}

// Only explicit bot submissions enter this outbox. Credentials are never stored in it.
const arenaOutbox = (() => {
  const prefix = 'arena-outbox-v1:';
  let running = false, retryTimer;
  const owner = () => currentAppRole === 'TEAM' && currentTeamStudentId ? `${API_BASE}:${currentTeamStudentId}` : '';
  const rows = () => Object.keys(localStorage).filter(k => k.startsWith(prefix)).map(k => {
    try { return JSON.parse(localStorage.getItem(k)); } catch { return null; }
  }).filter(Boolean).filter(r => r.owner === owner()).sort((a,b) => a.created-b.created);
  function save(row) { localStorage.setItem(prefix+row.id, JSON.stringify(row)); }
  function status() {
    let box = document.getElementById('arena-outbox-status');
    if (!box) {
      box = document.createElement('aside'); box.id = 'arena-outbox-status';
      box.setAttribute('role','status');
      Object.assign(box.style,{position:'fixed',bottom:'16px',right:'16px',zIndex:'999',maxWidth:'min(420px, calc(100vw - 32px))',padding:'12px 16px',borderRadius:'12px',background:'#eff6ff',color:'#1e40af',border:'1px solid #bfdbfe',boxShadow:'0 4px 16px #0001',fontSize:'14px'});
      document.body.appendChild(box);
    }
    const list=rows(); box.replaceChildren();
    box.hidden = !list.length && navigator.onLine;
    const label=document.createElement('span');
    const blocked=list.find(r=>r.error);
    label.textContent = blocked ? `Bài chưa được nhận: ${blocked.error}` : list.length ? `${list.length} bài đã lưu trên máy, ${navigator.onLine?'đang chờ gửi':'chưa có mạng'}. Chưa được server xác nhận.` : 'Đang offline. Bài nộp sẽ được lưu trên thiết bị này.';
    box.appendChild(label);
    if(list.length){
      for(const [text,action] of [['Tải bản dự phòng',download],['Gửi lại',()=>{for(const r of rows()){r.error='';save(r);}schedule(0);}],['Bỏ bài bị từ chối',()=>{download();for(const r of rows())if(r.error)localStorage.removeItem(prefix+r.id);status();schedule(0);}]]){
        const b=document.createElement('button');b.textContent=text;b.className='btn-outline';b.style.margin='8px 6px 0 0';b.onclick=action;box.appendChild(b);
      }
    }
  }
  function download(){
    const url=URL.createObjectURL(new Blob([JSON.stringify(rows(),null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='arena-bai-cho-dong-bo.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function schedule(delay=3000+Math.random()*12000){clearTimeout(retryTimer);retryTimer=setTimeout(flush,delay);}
  async function deliver(row){
    if(!navigator.onLine || row.owner!==owner())return null;
    const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),45000);
    try{
      const response=await fetch(API_BASE+row.path,{method:'POST',headers:{'Content-Type':'application/json','X-Submission-Id':row.id},body:JSON.stringify(row.payload),signal:abort.signal});
      if([408,425,429].includes(response.status)||response.status>=500)return null;
      const data=await response.json();
      if(!response.ok){row.error=data.detail||`HTTP ${response.status}`;save(row);return {blocked:true,data};}
      // An HTTP 200 from a proxy or an unrelated endpoint is not a receipt.
      if(!(response.status===202 && data.status==='QUEUED' && typeof data.id==='string' && data.at>0) && typeof data.valid!=='boolean' && typeof data.is_valid!=='boolean')return null;
      localStorage.removeItem(prefix+row.id);
      window.dispatchEvent(new CustomEvent('arena-submission-synced',{detail:{path:row.path,data}}));
      return {data};
    }catch{return null;}finally{clearTimeout(timeout);}
  }
  async function work(){
    if(running)return;running=true;
    try{
      for(const row of rows()){
        if(row.error)break;
        const result=await deliver(row);
        if(!result||result.blocked)break;
        if(result.data.status==='QUEUED')notifyInfo('Đã nhận bài','Bài đã lưu trên server, đang chờ chấm. Xem kết quả tại vòng loại.');
        else if(result.data.valid===false||result.data.is_valid===false)notifyWarning('Bot chưa hợp lệ','Server đã nhận nhưng bot chưa hợp lệ. Kiểm tra và sửa mã.');
        else notifySuccess('Đã đồng bộ bài nộp','Server đã phản hồi. Xem trạng thái bài nộp để biết kết quả kiểm tra.');
      }
    }finally{running=false;status();if(rows().some(r=>!r.error))schedule(15000+Math.random()*30000);}
  }
  async function flush(){
    // Serialize across tabs, so an older submission cannot overwrite a newer one.
    if(navigator.locks)await navigator.locks.request('arena-submit-outbox',{ifAvailable:true},lock=>{
      if(lock)return work();
      // Another tab may fail without a storage event. Keep our retry alive.
      if(rows().some(r=>!r.error))schedule();
    });
    else await work();
  }
  async function submit(path,payload){
    if(!owner())throw new Error('Đăng nhập tài khoản đội trước khi lưu bài offline.');
    if(new TextEncoder().encode(payload.code||payload.code_content||'').length>65536)throw new Error('Mã nguồn tối đa 64 KB.');
    if(rows().length>=20)throw new Error('Còn 20 bài chờ đồng bộ. Hãy kết nối mạng hoặc tải bản dự phòng.');
    const row={id:crypto.randomUUID(),owner:owner(),path,payload,created:Date.now()};
    try{save(row);}catch{throw new Error('Thiết bị không lưu được bài. Hãy tải mã nguồn ra file; bài chưa được nhận.');}
    status();schedule(0);
    return {queued:true};
  }
  window.addEventListener('online',()=>{status();schedule();});
  window.addEventListener('offline',status);
  window.addEventListener('storage',()=>{status();schedule();});
  window.addEventListener('focus',()=>{status();schedule();});
  window.addEventListener('DOMContentLoaded',()=>{status();schedule();});
  return {submit,flush,rows,status};
})();

// Keep only the signed-in team's last viewed context. Never cache API replies in SW.
const arenaOnlineFetch = window.fetch.bind(window);
window.fetch = async (input, init={}) => {
  const url=typeof input==='string'?input:input.url;
  const canCache=currentAppRole==='TEAM' && (init.method||'GET').toUpperCase()==='GET' &&
    url?.startsWith(API_BASE+'/api/') && /^\/(qualifiers(?:\/[^/?]+)?|tournaments\/list|tournaments\/[^/?]+|capabilities)$/.test(url.slice((API_BASE+'/api').length));
  const key=canCache?`arena-offline-view:${API_BASE}:${currentTeamStudentId}:${url}`:'';
  if(key && !navigator.onLine){
    const cached=localStorage.getItem(key);
    if(cached)return new Response(cached,{status:200,headers:{'Content-Type':'application/json','X-Arena-Offline':'true'}});
  }
  let response;
  try{response=await arenaOnlineFetch(input,init);}catch(error){
    const cached=key&&localStorage.getItem(key);
    if(cached)return new Response(cached,{status:200,headers:{'Content-Type':'application/json','X-Arena-Offline':'true'}});
    throw error;
  }
  if(key && response.ok){
    const body=await response.clone().text();
    if(body.length<262144)try{localStorage.setItem(key,body);}catch{}
  }
  return response;
};
window.addEventListener('arena-submission-synced',event=>{
  if(event.detail.path.startsWith('/api/qualifiers/'))loadQualifierPage();
  else if(currentTournamentId)loadActiveTournamentSilent(currentTournamentId);
});

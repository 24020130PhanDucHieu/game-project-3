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
    if (!blocked && navigator.onLine && list.some(r=>r.awaitingAuth)) label.textContent = 'Phiên đăng nhập hết hạn. Đăng nhập lại cùng tài khoản để tự gửi bài đã lưu.';
    if (!list.length && !navigator.onLine) label.textContent = '📴 Đang ngắt mạng (Phòng thi Offline): Bạn vẫn soạn mã, bấm Kiểm tra mã (Offline Validator) và Nộp bài vào máy bình thường.';
    if(list.length){
      const actions = [
        ['👁️ Xem bài đã lưu', openOfflineManager],
        ['💾 Tải file code', () => exportSourceFile()],
        ['🚀 Gửi lại', () => { for(const r of rows()){r.error='';save(r);} schedule(0); }]
      ];
      if (blocked) {
        actions.push(['Bỏ bài bị từ chối', () => { exportSourceFile(); for(const r of rows()) if(r.error) localStorage.removeItem(prefix+r.id); status(); schedule(0); }]);
      }
      for(const [text,action] of actions){
        const b=document.createElement('button');b.textContent=text;b.className='btn-outline';b.style.margin='8px 6px 0 0';b.onclick=action;box.appendChild(b);
      }
    }
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function exportSourceFile(row) {
    const list = rows();
    const target = row || list[list.length - 1];
    if (!target) {
      if (typeof notifyInfo === 'function') notifyInfo('Không có bài nộp', 'Chưa có bài nào trong bộ đệm offline.');
      return;
    }
    const code = target.payload?.code_content || target.payload?.code || '';
    const lang = (target.payload?.language || 'PYTHON').toUpperCase();
    const ext = lang === 'CPP' ? '.cpp' : '.py';
    const student = currentTeamStudentId || 'team';
    const timeStr = new Date(target.created).toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `bot_${student}_${timeStr}${ext}`;
    const cmt = ext === '.cpp' ? '//' : '#';
    const content = `${cmt} ==========================================================\n` +
      `${cmt} BẢN SAO LƯU MÃ NGUỒN BOT OFFLINE\n` +
      `${cmt} Thí sinh (MSSV): ${student}\n` +
      `${cmt} Thời gian lưu: ${new Date(target.created).toLocaleString('vi-VN')}\n` +
      `${cmt} Ngôn ngữ: ${lang}\n` +
      `${cmt} ==========================================================\n\n` + code;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (typeof notifySuccess === 'function') {
      notifySuccess('Đã xuất file mã nguồn', `Đã tải về máy: ${filename}`);
    }
  }

  function download() {
    exportSourceFile();
  }

  function openOfflineManager() {
    let dialog = document.getElementById('arena-offline-dialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'arena-offline-dialog';
      dialog.className = 'stage-schedule-dialog';
      document.body.appendChild(dialog);
    }
    const list = rows();
    dialog.innerHTML = `
      <div class="card-head-compact" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
        <h3 style="margin: 0; font-size: 18px; color: #0f172a;">📦 Quản Lý Bài Nộp Ngoại Tuyến (Offline Safe-Buffer)</h3>
        <button type="button" class="btn-outline" aria-label="Đóng hộp thoại" onclick="this.closest('dialog').close()" style="border-radius: 50%; width: 32px; height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 18px;">×</button>
      </div>
      <div style="margin-bottom: 14px;">
        ${navigator.onLine 
          ? `<span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; background: #dcfce7; color: #15803d; font-size: 12.5px; font-weight: 600;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #22c55e;"></span>🟢 Đã kết nối Internet · Sẵn sàng tự động gửi bài</span>`
          : `<span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; background: #fee2e2; color: #b91c1c; font-size: 12.5px; font-weight: 600;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #ef4444;"></span>🔴 Đang ngắt mạng · Mọi bài nộp đã được lưu an toàn trên máy này</span>`
        }
      </div>
      <p style="font-size: 13px; color: #64748b; margin-bottom: 16px;">
        Khi phòng thi bị rớt mạng hoặc ngắt kết nối, bài của bạn không bao giờ bị mất. Bạn có thể xem lại mã, sao chép hoặc tải trực tiếp file mã nguồn <code>.py</code> / <code>.cpp</code> về máy. Khi có mạng trở lại, hệ thống sẽ tự động đồng bộ lên máy chấm.
      </p>
      <div id="arena-offline-items-list" style="max-height: 55vh; overflow-y: auto; display: flex; flex-direction: column; gap: 14px;">
        ${list.length === 0 ? '<div style="padding: 24px; text-align: center; color: #64748b; background: #f8fafc; border-radius: 12px;">Chưa có bài nộp nào đang chờ trong hàng đợi offline.</div>' : ''}
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; padding-top: 14px; border-top: 1px solid #e2e8f0;">
        <button class="btn btn-outline" type="button" onclick="this.closest('dialog').close()">Đóng</button>
        ${list.length > 0 ? `<button class="btn btn-primary" type="button" id="btn-offline-flush-modal">🚀 Gửi toàn bộ bài lên server ngay</button>` : ''}
      </div>
    `;

    const container = dialog.querySelector('#arena-offline-items-list');
    list.forEach((row, idx) => {
      const code = row.payload?.code_content || row.payload?.code || '';
      const lang = (row.payload?.language || 'PYTHON').toUpperCase();
      const ext = lang === 'CPP' ? '.cpp' : '.py';
      const timeStr = new Date(row.created).toLocaleTimeString('vi-VN') + ' - ' + new Date(row.created).toLocaleDateString('vi-VN');
      const itemEl = document.createElement('div');
      itemEl.style.cssText = 'border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.03);';
      itemEl.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
          <div>
            <strong style="color: #0f172a; font-size: 13.5px;">Bài nộp #${idx + 1}</strong>
            <span style="font-size: 12px; color: #64748b; margin-left: 8px;">🕒 ${timeStr}</span>
          </div>
          <span style="display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11.5px; font-weight: 700; background: ${lang === 'CPP' ? '#f0fdf4' : '#eff6ff'}; color: ${lang === 'CPP' ? '#166534' : '#1e40af'}; border: 1px solid ${lang === 'CPP' ? '#bbf7d0' : '#bfdbfe'};">
            ${lang === 'CPP' ? 'C++ (.cpp)' : 'Python 3 (.py)'}
          </span>
        </div>
        <pre style="background: #0f172a; color: #f8fafc; padding: 12px; border-radius: 8px; max-height: 160px; overflow: auto; font-size: 12px; font-family: Consolas, Monaco, monospace; line-height: 1.5; margin: 0 0 10px 0;">${esc(code)}</pre>
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm btn-outline btn-copy-offline-code" type="button">📋 Sao chép mã</button>
            <button class="btn btn-sm btn-outline btn-dl-offline-file" type="button">💾 Tải file ${ext}</button>
          </div>
          <button class="btn btn-sm btn-outline btn-del-offline-item" type="button" style="color: #ef4444; border-color: #fca5a5;">🗑️ Bỏ bản này</button>
        </div>
      `;

      itemEl.querySelector('.btn-copy-offline-code').onclick = () => {
        navigator.clipboard.writeText(code).then(() => {
          if (typeof notifySuccess === 'function') notifySuccess('Đã sao chép mã', 'Mã nguồn đã được sao chép vào bộ nhớ tạm.');
        });
      };
      itemEl.querySelector('.btn-dl-offline-file').onclick = () => exportSourceFile(row);
      itemEl.querySelector('.btn-del-offline-item').onclick = () => {
        localStorage.removeItem(prefix + row.id);
        status();
        openOfflineManager();
      };
      container.appendChild(itemEl);
    });

    const btnFlush = dialog.querySelector('#btn-offline-flush-modal');
    if (btnFlush) {
      btnFlush.onclick = () => {
        for (const r of rows()) { r.error = ''; save(r); }
        schedule(0);
        dialog.close();
        if (typeof notifyInfo === 'function') notifyInfo('Đang gửi lại', 'Đang kết nối server để gửi bài nộp...');
      };
    }

    dialog.showModal();
  }
  function schedule(delay=3000+Math.random()*12000){clearTimeout(retryTimer);retryTimer=setTimeout(flush,delay);}
  async function deliver(row){
    if(!navigator.onLine || row.owner!==owner())return null;
    const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),45000);
    try{
      const response=await fetch(API_BASE+row.path,{method:'POST',headers:{'Content-Type':'application/json','X-Submission-Id':row.id},body:JSON.stringify(row.payload),signal:abort.signal});
      if(response.status===401){row.awaitingAuth=true;save(row);return null;}
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

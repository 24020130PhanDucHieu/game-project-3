function qualifierDraftKey(){return `qualifier-draft:${API_BASE}:${qualifierId}:${currentTeamStudentId||'guest'}`;}
function saveQualifierDraft(){if(currentAppRole!=='TEAM'||!qualifierId)return;localStorage.setItem(qualifierDraftKey(),JSON.stringify({code:document.getElementById('qualifier-code').value,language:document.getElementById('qualifier-language').value}));}
function renderQualifierOwn(data){
  const e=data.event,p=data.participant||{};const canSubmit=currentAppRole==='TEAM'&&Boolean(p.student_id)&&e.status==='OPEN'&&Date.now()/1000<e.deadline;
  document.getElementById('qualifier-team-card').hidden=currentAppRole!=='TEAM'||!p.student_id;
  document.getElementById('qualifier-team-card').style.display=currentAppRole==='ADMIN'?'none':'block';
  document.getElementById('qualifier-submit').disabled=!canSubmit;document.getElementById('qualifier-check').disabled=currentAppRole!=='TEAM';
  document.getElementById('qualifier-code').readOnly=!canSubmit;
  const pending=(data.history||[]).filter(s=>s.status==='QUEUED').length;
  const status=currentAppRole==='TEAM'?(p.locked_id?'Bài đã khóa':pending?`${pending} bài đã nhận, đang chờ chấm${p.valid_id?' · Có bản hợp lệ trước đó':''}`:p.valid_id?'Có bản hợp lệ sẵn sàng':'Chưa có bài hợp lệ'):'Đăng nhập tài khoản đội để nộp bot';
  document.getElementById('qualifier-my-status').textContent=`${status} · ELO ${Number(p.elo||1200).toFixed(2)} · Hạn ${new Date(e.deadline*1000).toLocaleString('vi-VN')}`;
  const key=qualifierDraftKey();if(qualifierDraftKeyLoaded!==key){let draft={};try{draft=JSON.parse(localStorage.getItem(key)||'{}');}catch{}document.getElementById('qualifier-code').value=draft.code??p.code??'';document.getElementById('qualifier-language').value=draft.language||p.language||'PYTHON';qualifierDraftKeyLoaded=key;}
  const history=document.getElementById('qualifier-my-history');history.replaceChildren();
  for(const submission of data.history||[]){const row=document.createElement('p');row.textContent=`${new Date(submission.at*1000).toLocaleString('vi-VN')} · ${submission.status==='QUEUED'?'Đã nhận · Đang chờ chấm':submission.valid?'Hợp lệ':'Lỗi: '+submission.error}${submission.id===p.valid_id?' · Bản hợp lệ cuối cùng':''}`;const button=document.createElement('button');button.className='btn-outline';button.textContent='Nạp lại';button.disabled=!canSubmit;button.onclick=()=>{document.getElementById('qualifier-code').value=submission.code;document.getElementById('qualifier-language').value=submission.language;saveQualifierDraft();};row.appendChild(button);history.appendChild(row);}
  const results=document.getElementById('qualifier-my-results');results.replaceChildren();for(const result of data.results||[]){const row=document.createElement('p');row.textContent=`Lượt ${result.round} · ${result.status==='DONE'?(result.b?result.winner===currentTeamStudentId?'Thắng':'Thua':'Nghỉ lượt'):result.status} · ${result.reason||''}`;results.appendChild(row);}
}
async function loadQualifierFile(input){const file=input.files?.[0];if(!file)return;if(file.size>65536){notifyWarning('File quá lớn','Giới hạn 64 KB.');return;}document.getElementById('qualifier-code').value=await file.text();document.getElementById('qualifier-language').value=file.name.toLowerCase().endsWith('.cpp')?'CPP':'PYTHON';saveQualifierDraft();input.value='';}
async function loadQualifierTemplate(){const language=document.getElementById('qualifier-language').value;try{const response=await fetch(`/assets/bots_sdk/bot_template.${language==='CPP'?'cpp':'py'}`);if(!response.ok)throw new Error('Không tải được mã mẫu.');document.getElementById('qualifier-code').value=await response.text();saveQualifierDraft();}catch(err){notifyError('Không tải được mẫu',err.message);}}
async function checkQualifierCode(){
  const button=document.getElementById('qualifier-check');if(button.disabled)return;button.disabled=true;
  try{const response=await fetch(`${API_BASE}/api/bots/validate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code_content:document.getElementById('qualifier-code').value,language:document.getElementById('qualifier-language').value})});const data=await response.json();if(!response.ok)throw new Error(data.detail||'Không kiểm tra được bot.');if(data.is_valid)notifySuccess('Bot hợp lệ','Có thể nộp bài.');else notifyWarning('Bot chưa hợp lệ',data.error_message||'Kiểm tra lại mã nguồn.');}catch(err){notifyError('Không kiểm tra được',err.message);}finally{button.disabled=false;}
}
async function submitQualifierCode(){
  const button=document.getElementById('qualifier-submit');if(button.disabled)return;button.disabled=true;
  try{await arenaOutbox.submit(`/api/qualifiers/${qualifierId}/submissions`,{code:document.getElementById('qualifier-code').value,language:document.getElementById('qualifier-language').value});notifyInfo('Đã lưu trên thiết bị','Bài sẽ tự gửi khi có mạng. Chưa được server xác nhận.');}catch(err){notifyError('Không lưu được bài',err.message);}finally{button.disabled=qualifierData?.event.status!=='OPEN'||Date.now()/1000>=qualifierData?.event.deadline;}
}

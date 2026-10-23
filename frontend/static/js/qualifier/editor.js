let currentQualifierSubmitMode = 'direct';
let lastGitSubmissionInfo = { repo_url: '', commit_sha: '' };

function qualifierDraftKey(){return `qualifier-draft:${API_BASE}:${qualifierId}:${currentTeamStudentId||'guest'}`;}
function saveQualifierDraft(){if(currentAppRole!=='TEAM'||!qualifierId)return;localStorage.setItem(qualifierDraftKey(),JSON.stringify({code:document.getElementById('qualifier-code').value,language:document.getElementById('qualifier-language').value}));}

function detectCodeLanguage(code) {
  if (!code) return null;
  if (code.includes('#include') || code.includes('std::') || code.includes('int main') || code.includes('using namespace std') || code.includes('cout <<')) {
    return 'CPP';
  }
  if (code.includes('def ') || code.includes('import ') || code.includes('from ') || code.includes('print(') || code.includes('decide_move(')) {
    return 'PYTHON';
  }
  return null;
}

function onQualifierLanguageChange() {
  const codeArea = document.getElementById('qualifier-code');
  const langSel = document.getElementById('qualifier-language');
  if (!codeArea || !langSel) return;
  const newLang = langSel.value;
  const curCode = codeArea.value.trim();
  const detected = detectCodeLanguage(curCode);

  if (!curCode || (detected && detected !== newLang)) {
    loadQualifierTemplate();
  }
  saveQualifierDraft();
}


function switchQualifierMode(mode){
  currentQualifierSubmitMode = mode;
  const btnGit = document.getElementById('btn-mode-github');
  const btnDirect = document.getElementById('btn-mode-direct');
  const gitPanel = document.getElementById('qualifier-github-panel');
  const directToolbar = document.getElementById('qualifier-direct-toolbar');
  const directPanel = document.getElementById('qualifier-direct-panel');
  if (gitPanel) gitPanel.hidden = mode !== 'github';
  if (directPanel) directPanel.hidden = mode === 'github';
  if (btnGit) btnGit.setAttribute('aria-selected', String(mode === 'github'));
  if (btnDirect) btnDirect.setAttribute('aria-selected', String(mode !== 'github'));

  if(mode === 'github'){
    if(btnGit){ btnGit.className = 'btn btn-sm btn-primary'; }
    if(btnDirect){ btnDirect.className = 'btn btn-sm btn-outline'; }
    if(gitPanel) gitPanel.style.display = 'block';
  } else {
    if(btnGit){ btnGit.className = 'btn btn-sm btn-outline'; }
    if(btnDirect){ btnDirect.className = 'btn btn-sm btn-primary'; }
    if(gitPanel) gitPanel.style.display = 'none';
  }
}

async function fetchBotFromGitHub(){
  const repoInput = document.getElementById('qualifier-git-repo-url');
  const branchInput = document.getElementById('qualifier-git-branch');
  const fileInput = document.getElementById('qualifier-git-filepath');
  const statusBox = document.getElementById('qualifier-git-sync-status');
  const fetchBtn = document.getElementById('btn-fetch-github');

  const repoUrl = repoInput?.value.trim() || '';
  const branch = branchInput?.value.trim() || 'main';
  const filePath = fileInput?.value.trim() || 'bot.py';

  if(!repoUrl){
    notifyWarning('Chưa có đường dẫn', 'Vui lòng nhập đường dẫn GitHub repository của đội bạn.');
    repoInput?.focus();
    return;
  }

  if(fetchBtn) { fetchBtn.disabled = true; fetchBtn.textContent = 'Đang kéo mã...'; }
  if(statusBox){
    statusBox.style.display = 'block';
    statusBox.style.background = '#f1f5f9';
    statusBox.style.color = '#334155';
    statusBox.style.border = '1px solid #cbd5e1';
    statusBox.textContent = 'Đang kết nối tới GitHub và tải mã nguồn mới nhất...';
  }

  try{
    const res = await fetch(`${API_BASE}/api/github/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_url: repoUrl, branch, file_path: filePath })
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.detail || 'Không thể kéo mã nguồn từ GitHub.');

    document.getElementById('qualifier-code').value = data.code;
    document.getElementById('qualifier-language').value = data.language || 'PYTHON';
    const preview = document.getElementById('qualifier-git-preview');
    if (preview) { preview.textContent = data.code; preview.hidden = false; }
    saveQualifierDraft();

    lastGitSubmissionInfo = {
      repo_url: data.repo_url,
      commit_sha: data.commit_sha
    };

    const badge = document.getElementById('qualifier-code-source-badge');
    if(badge){
      badge.textContent = `GitHub: ${data.owner}/${data.repo} (${data.commit_sha})`;
      badge.style.display = 'block';
    }

    const metaInfo = document.getElementById('qualifier-submit-meta-info');
    if(metaInfo){
      metaInfo.textContent = `Sẵn sàng nộp từ commit: ${data.commit_sha}`;
    }

    if(statusBox){
      statusBox.style.display = 'block';
      statusBox.style.background = '#ecfdf5';
      statusBox.style.color = '#065f46';
      statusBox.style.border = '1px solid #a7f3d0';
      statusBox.innerHTML = `<strong>Kéo mã nguồn từ GitHub thành công!</strong><br>
        Repo: <b>${data.owner}/${data.repo}</b> (nhánh <i>${data.branch}</i>) · File: <b>${data.file_path}</b><br>
        Commit: <code>${data.commit_sha}</code> - "${escapeHtml(data.commit_message)}" (bởi ${data.author}, ${data.commit_time})<br>
        <span style="font-size: 12px; color: #047857;">Mã đã được nạp vào khung bên dưới. Hãy kiểm tra và bấm <b>Nộp bot vào vòng loại</b>.</span>`;
    }

    notifySuccess('Đồng bộ GitHub thành công', `Đã nạp mã nguồn từ commit ${data.commit_sha}`);
    checkQualifierCode();
  }catch(err){
    if(statusBox){
      statusBox.style.display = 'block';
      statusBox.style.background = '#fef2f2';
      statusBox.style.color = '#991b1b';
      statusBox.style.border = '1px solid #fecaca';
      statusBox.textContent = `Lỗi: ${err.message}`;
    }
    notifyError('Không kéo được mã', err.message);
  }finally{
    if(fetchBtn){ fetchBtn.disabled = false; fetchBtn.textContent = 'Kéo mã nguồn từ GitHub'; }
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderQualifierOwn(data){
  const e=data.event,p=data.participant||{};
  const canSubmit=currentAppRole==='TEAM'&&Boolean(p.student_id)&&e.status==='OPEN'&&Date.now()/1000<e.deadline;
  
  const teamCard = document.getElementById('qualifier-team-card');
  if(teamCard){
    teamCard.hidden=currentAppRole!=='TEAM'||!p.student_id;
    teamCard.style.display=currentAppRole==='ADMIN'?'none':'block';
  }

  const submitBtn = document.getElementById('qualifier-submit');
  const checkBtn = document.getElementById('qualifier-check');
  const codeArea = document.getElementById('qualifier-code');
  const metaInfo = document.getElementById('qualifier-submit-meta-info');

  if(checkBtn) checkBtn.disabled = false;
  if(codeArea) codeArea.readOnly = false;

  if(submitBtn){
    submitBtn.disabled = false;
    if(!canSubmit){
      submitBtn.classList.remove('btn-primary');
      submitBtn.classList.add('btn-outline');
    } else {
      submitBtn.classList.remove('btn-outline');
      submitBtn.classList.add('btn-primary');
    }
  }

  if(metaInfo && !lastGitSubmissionInfo.commit_sha){
    if(currentAppRole !== 'TEAM'){
      metaInfo.innerHTML = '<span style="color:#64748b; font-weight:500;">ℹ️ Quyền Quản trị viên (kiểm tra & chạy thử bot, chỉ Đội thi mới nộp giải)</span>';
    } else if(!p.student_id){
      metaInfo.innerHTML = '<span style="color:#d97706; font-weight:500;">⚠️ Hãy bấm "Đăng ký thi" ở phía trên trước khi nộp bot</span>';
    } else if(e.status === 'FINISHED'){
      metaInfo.innerHTML = `<span style="color:#ef4444; font-weight:600;">🔒 Vòng loại đã kết thúc thi đấu · Ban tổ chức đã khóa nộp bài để tổng kết và bốc thăm giải chính.</span>`;
    } else if(e.status === 'LOCKED'){
      metaInfo.innerHTML = `<span style="color:#ef4444; font-weight:600;">🔒 Vòng loại đã được khóa nhận bài nộp để tiến hành chấm thi và xếp hạng.</span>`;
    } else if(e.status !== 'OPEN'){
      metaInfo.innerHTML = `<span style="color:#64748b; font-weight:600;">⏳ Vòng loại chưa mở nhận bài (Trạng thái: ${e.status}).</span>`;
    } else if(Date.now()/1000 >= e.deadline){
      metaInfo.innerHTML = `<span style="color:#ef4444; font-weight:600;">🔒 Đã hết hạn nộp bài (${new Date(e.deadline*1000).toLocaleString('vi-VN')}) · Cổng nộp bài tự động khóa theo giờ máy chủ.</span>`;
    } else {
      metaInfo.innerHTML = '<span style="color:#10b981; font-weight:500;">✅ Sẵn sàng nhận bài nộp</span>';
    }
  }

  const gitIndicator = document.getElementById('qualifier-git-mode-indicator');
  const templateLink = document.getElementById('qualifier-git-template-link');
  if(e.git_mode){
    if(gitIndicator) gitIndicator.style.display = 'block';
    if(templateLink) templateLink.href = e.git_template_url || 'https://github.com/uet-arena/bot-template';
  } else {
    if(gitIndicator) gitIndicator.style.display = 'none';
  }

  const repoInput = document.getElementById('qualifier-git-repo-url');
  if(repoInput && !repoInput.value && p.git_repo_url){
    repoInput.value = p.git_repo_url;
    lastGitSubmissionInfo = { repo_url: p.git_repo_url, commit_sha: p.git_commit_hash || '' };
    const badge = document.getElementById('qualifier-code-source-badge');
    if(badge && p.git_commit_hash){
      badge.textContent = `GitHub: ${p.git_repo_url} (${p.git_commit_hash})`;
      badge.style.display = 'block';
    }
  }

  const pending=(data.history||[]).filter(s=>s.status==='QUEUED').length;
  const status=currentAppRole==='TEAM'?(p.locked_id?'Bài đã khóa':pending?`${pending} bài đã nhận, đang chờ chấm${p.valid_id?' · Có bản hợp lệ trước đó':''}`:p.valid_id?'Có bản hợp lệ sẵn sàng':'Chưa có bài hợp lệ'):'Đăng nhập tài khoản đội để nộp bot';
  document.getElementById('qualifier-my-status').textContent=`${status} · ELO ${Number(p.elo||1200).toFixed(2)} · Hạn ${new Date(e.deadline*1000).toLocaleString('vi-VN')}`;
  const key=qualifierDraftKey();
  if(qualifierDraftKeyLoaded!==key){
    let draft={};
    try{draft=JSON.parse(localStorage.getItem(key)||'{}');}catch{}
    const loadedCode = draft.code ?? p.code ?? '';
    let loadedLang = draft.language || p.language;
    const detected = detectCodeLanguage(loadedCode);
    if(detected){
      loadedLang = detected;
    } else if(!loadedLang){
      loadedLang = 'PYTHON';
    }
    document.getElementById('qualifier-code').value = loadedCode;
    document.getElementById('qualifier-language').value = loadedLang;
    qualifierDraftKeyLoaded=key;
  }
  const history=document.getElementById('qualifier-my-history');history.replaceChildren();
  for(const submission of data.history||[]){
    const row=document.createElement('p');
    let gitTag = '';
    if(submission.git_repo_url){
      gitTag = ` · [GitHub: ${submission.git_commit_hash || 'latest'}]`;
    }
    row.textContent=`${new Date(submission.at*1000).toLocaleString('vi-VN')} · ${submission.status==='QUEUED'?'Đã nhận · Đang chờ chấm':submission.valid?'Hợp lệ':'Lỗi: '+submission.error}${gitTag}${submission.id===p.valid_id?' · Bản hợp lệ cuối cùng':''}`;
    const button=document.createElement('button');button.className='btn-outline';button.textContent='Nạp lại';button.disabled=!canSubmit;button.onclick=()=>{document.getElementById('qualifier-code').value=submission.code;document.getElementById('qualifier-language').value=submission.language;saveQualifierDraft();};row.appendChild(button);history.appendChild(row);
  }
  const results=document.getElementById('qualifier-my-results');results.replaceChildren();for(const result of data.results||[]){const row=document.createElement('p');row.textContent=`Lượt ${result.round} · ${result.status==='DONE'?(result.b?result.winner===currentTeamStudentId?'Thắng':'Thua':'Nghỉ lượt'):result.status} · ${result.reason||''}`;results.appendChild(row);}
}
async function loadQualifierFile(input){const file=input.files?.[0];if(!file)return;if(file.size>65536){notifyWarning('File quá lớn','Giới hạn 64 KB.');return;}document.getElementById('qualifier-code').value=await file.text();document.getElementById('qualifier-language').value=file.name.toLowerCase().endsWith('.cpp')?'CPP':'PYTHON';saveQualifierDraft();input.value='';}
async function loadQualifierTemplate(){const language=document.getElementById('qualifier-language').value;try{const response=await fetch(`/assets/bots_sdk/bot_template.${language==='CPP'?'cpp':'py'}`);if(!response.ok)throw new Error('Không tải được mã mẫu.');document.getElementById('qualifier-code').value=await response.text();saveQualifierDraft();}catch(err){notifyError('Không tải được mẫu',err.message);}}
async function checkQualifierCode(){
  const codeVal = document.getElementById('qualifier-code').value;
  const langVal = document.getElementById('qualifier-language').value;
  if (!codeVal.trim()) { notifyWarning('Chưa có mã', 'Hãy viết mã bot trước khi kiểm tra.'); return; }
  if (!navigator.onLine || (typeof isOfflineExamMode === 'function' && isOfflineExamMode())) {
    if (typeof validateBotCodeOffline === 'function') {
      const res = validateBotCodeOffline(codeVal, langVal);
      if (res.is_valid) notifySuccess('Kiểm tra Offline: Hợp lệ', res.message);
      else notifyWarning('Kiểm tra Offline: Cú pháp lỗi', res.error_message);
    } else {
      notifyInfo('Đang mất kết nối', 'Mã vẫn lưu trên thiết bị. Kết nối lại máy chủ để kiểm tra mã và chạy thử.');
    }
    return;
  }
  const button=document.getElementById('qualifier-check');if(button.disabled)return;button.disabled=true;
  try{
    const response=await fetch(`${API_BASE}/api/bots/validate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code_content:codeVal,language:langVal})});
    const data=await response.json();
    if(!response.ok)throw new Error(data.detail||'Không kiểm tra được bot.');
    if(data.is_valid){
      const execTime = data.execution_time_ms ? ` (${data.execution_time_ms}ms)` : '';
      const move = data.test_move ? ` · Nước đi: [${data.test_move}]` : '';
      const p = qualifierData?.participant || {};
      const e = qualifierData?.event;
      if (currentAppRole !== 'TEAM') {
        notifySuccess('Bot hợp lệ' + move, `Mã ${langVal} cú pháp chuẩn${execTime}. Bạn đang dùng quyền Admin (chỉ kiểm tra/chạy thử, đăng nhập Đội thi để nộp giải).`);
      } else if (!p.student_id) {
        notifySuccess('Bot hợp lệ' + move, `Mã ${langVal} cú pháp chuẩn${execTime}. Hãy bấm "Đăng ký thi" ở phía trên để có thể nộp bot.`);
      } else if (e?.status !== 'OPEN' || (e?.deadline && Date.now()/1000 >= e.deadline)) {
        notifySuccess('Bot hợp lệ' + move, `Mã ${langVal} cú pháp chuẩn${execTime}. (Vòng loại đã đóng hoặc hết hạn nộp).`);
      } else {
        notifySuccess('Bot hợp lệ' + move, `Mã ${langVal} chuẩn xác${execTime}. Có thể bấm "Nộp bot vào vòng loại"!`);
      }
    } else {
      notifyWarning('Bot chưa hợp lệ', data.error_message || 'Kiểm tra lại mã nguồn.');
    }
  }catch(err){
    if (!navigator.onLine || err.message.includes('fetch') || err.message.includes('Network')) {
      if (typeof validateBotCodeOffline === 'function') {
        const res = validateBotCodeOffline(codeVal, langVal);
        if (res.is_valid) { notifySuccess('Kiểm tra Offline (Mất mạng)', res.message); return; }
        else { notifyWarning('Kiểm tra Offline: Cú pháp lỗi', res.error_message); return; }
      }
    }
    notifyError('Không kiểm tra được',err.message);
  }finally{button.disabled=false;}
}
async function submitQualifierCode(){
  const e = qualifierData?.event;
  const p = qualifierData?.participant || {};
  const codeVal = document.getElementById('qualifier-code').value.trim();
  const langVal = document.getElementById('qualifier-language').value;

  if (!codeVal) {
    notifyWarning('Chưa có mã', 'Hãy viết hoặc nạp mã bot trước khi nộp.');
    return;
  }

  if (currentAppRole !== 'TEAM') {
    notifyWarning('Tài khoản Quản trị viên', 'Tài khoản Admin chỉ dùng để kiểm tra mã và quản lý vòng loại. Để nộp bot thi đấu, vui lòng đăng nhập bằng tài khoản Đội thi (MSSV).');
    return;
  }

  if (!p.student_id) {
    notifyWarning('Chưa đăng ký thi', 'Đội của bạn chưa bấm "Đăng ký thi" cho vòng loại này. Vui lòng bấm nút "Đăng ký thi" ở phía trên trước khi nộp bot.');
    return;
  }

  if (!e || e.status !== 'OPEN') {
    notifyWarning('Vòng loại không mở', `Vòng loại hiện đang ở trạng thái "${e?.status || 'ĐÃ ĐÓNG'}", không nhận bài nộp mới.`);
    return;
  }

  if (Date.now() / 1000 >= e.deadline) {
    notifyWarning('Đã hết hạn nộp', `Hạn nộp bài của vòng loại này đã kết thúc (${new Date(e.deadline * 1000).toLocaleString('vi-VN')}).`);
    return;
  }

  const button=document.getElementById('qualifier-submit');
  button.disabled=true;
  button.textContent='Đang nộp...';
  try{
    const payload = {
      code: document.getElementById('qualifier-code').value,
      language: langVal,
      git_repo_url: lastGitSubmissionInfo.repo_url || '',
      git_commit_hash: lastGitSubmissionInfo.commit_sha || ''
    };
    await arenaOutbox.submit(`/api/qualifiers/${qualifierId}/submissions`, payload);
    notifySuccess('Nộp bài thành công', 'Bài nộp đã được gửi vào hàng đợi chấm điểm!');
  }catch(err){
    notifyError('Không lưu được bài',err.message);
  }finally{
    button.disabled=false;
    button.textContent='Nộp bot vào vòng loại';
  }
}

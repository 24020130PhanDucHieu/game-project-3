// Keep the existing auth controls and listeners while placing them in the header.
function renderPortalShell() {
  const target = document.getElementById('portal-header-account');
  const card = document.getElementById('sidebar-user-card');
  if (target && card && card.parentElement !== target) target.appendChild(card);
  const current = document.querySelector('.nav-tab-btn.active .nav-label');
  const title = document.getElementById('portal-current-page');
  if (title) title.textContent = current?.textContent?.trim() || 'Tổng quan';
  const bell = document.getElementById('btn-notif-auth');
  if (bell) bell.setAttribute('aria-label', 'Mở trung tâm thông báo');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderPortalShell);
else renderPortalShell();

function switchMatchSubmitMode(mode) {
  const github = mode === 'github';
  const panels = [document.getElementById('match-github-panel'), document.getElementById('match-direct-panel')];
  const buttons = [document.getElementById('btn-match-mode-github'), document.getElementById('btn-match-mode-direct')];
  if (panels[0]) panels[0].hidden = !github;
  if (panels[1]) panels[1].hidden = github;
  buttons.forEach((button, index) => {
    if (!button) return;
    const selected = index === (github ? 0 : 1);
    button.className = selected ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline';
    button.setAttribute('aria-selected', String(selected));
  });
}

async function fetchMatchBotFromGitHub() {
  const repo = document.getElementById('match-git-repo-url');
  const branch = document.getElementById('match-git-branch');
  const path = document.getElementById('match-git-filepath');
  const button = document.getElementById('btn-fetch-match-github');
  const status = document.getElementById('match-git-sync-status');
  const preview = document.getElementById('match-git-preview');
  if (!repo?.value.trim()) { notifyWarning('Thiếu kho GitHub', 'Nhập URL repository trước khi kéo mã.'); repo?.focus(); return; }
  if (button) button.disabled = true;
  if (status) { status.style.display = 'block'; status.textContent = 'Đang kéo mã nguồn…'; }
  try {
    const response = await fetch(`${API_BASE}/api/github/fetch`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({repo_url:repo.value.trim(), branch:branch?.value.trim() || 'main', file_path:path?.value.trim() || 'bot.py'})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || 'Không thể tải mã nguồn từ GitHub.');
    const editor = document.getElementById('studio-code-editor');
    const language = document.getElementById('studio-sel-lang');
    if (editor) editor.value = result.code || '';
    if (language) language.value = result.language || 'PYTHON';
    if (preview) { preview.textContent = result.code || ''; preview.hidden = false; }
    if (status) status.textContent = `Đã nạp commit ${result.commit_sha || 'mới nhất'}. Kiểm tra bản xem trước rồi bấm Nộp mã lệnh.`;
    if (typeof saveStudioDraft === 'function') saveStudioDraft();
    notifySuccess('Đã nạp mã nguồn', 'Mã nguồn đã sẵn sàng để nộp cho hiệp hiện tại.');
  } catch (error) {
    if (status) status.textContent = error.message;
    notifyError('Không tải được mã nguồn', error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

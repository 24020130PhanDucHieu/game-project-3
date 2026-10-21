let qualifierTestEventId = '';
function renderQualifierRegistration(data) {
  const team = currentAppRole === 'TEAM';
  const registered = team && Boolean(data?.participant?.student_id);
  const open = data?.event.status === 'OPEN' && Date.now()/1000 < data.event.deadline;
  document.getElementById('qualifier-registration-card').hidden = currentAppRole === 'ADMIN';
  document.getElementById('qualifier-team-card').hidden = !registered;
  document.getElementById('qualifier-event-card').hidden = !data;
  document.getElementById('qualifier-admin-teams-card').hidden = !data || currentAppRole !== 'ADMIN';
  document.getElementById('qualifier-ranking-card').hidden = !data || (!registered && currentAppRole !== 'ADMIN');
  document.getElementById('qualifier-registration-title').textContent = registered ? 'Bạn đã đăng ký tham gia' : 'Đăng ký thi vòng loại';
  document.getElementById('qualifier-registration-help').textContent = data ? `${data.event.name} · ${registered ? 'Nộp bản bot hợp lệ trước hạn để được thi đấu.' : 'Đăng ký tham gia giải này để mở khu vực nộp bot.'}` : 'Chọn một giải trong danh sách, sau đó đăng ký thi.';
  const button = document.getElementById('qualifier-register');
  button.textContent = !team ? 'Đăng nhập để đăng ký' : registered ? 'Đã đăng ký' : open ? 'Đăng ký thi' : data ? 'Đã đóng đăng ký' : 'Đăng ký thi';
  button.disabled = team && (registered || Boolean(data && !open));
  button.hidden = registered;
  document.getElementById('qualifier-registration-card').hidden = currentAppRole === 'ADMIN' || registered;
}
async function openQualifierEvents() {
  const dialog = document.getElementById('qualifier-events-dialog');
  const list = document.getElementById('qualifier-events-list');
  list.textContent = 'Đang tải danh sách…'; dialog.showModal();
  try {
    const events = await qualifierAPI(''); list.replaceChildren();
    if (!events.length) list.textContent = 'Chưa có giải vòng loại. Vui lòng quay lại sau.';
    for (const event of events) {
      const card = document.createElement('div'); card.className = 'qualifier-event-option';
      const title = document.createElement('strong'); title.textContent = event.name;
      const detail = document.createElement('p');
      const phaseLabel = (typeof qualifierPhaseLabels !== 'undefined' && qualifierPhaseLabels[event.status]) || (event.status === 'OPEN' ? 'Đang mở' : 'Đã đóng');
      const deadlineStr = event.deadline ? new Date(event.deadline * 1000).toLocaleString('vi-VN') : '—';
      detail.textContent = `${phaseLabel} · Hạn ${deadlineStr} · Top ${event.top_k || 8}`;
      const button = document.createElement('button'); button.className = 'btn btn-outline'; button.textContent = event.id === qualifierId ? 'Đang chọn' : 'Chọn giải';
      button.onclick = () => { dialog.close(); selectQualifier(event.id); };
      card.append(title, detail, button);
      if (currentAppRole === 'ADMIN') {
        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-outline btn-sm';
        delBtn.style.color = '#ef4444';
        delBtn.style.borderColor = '#fca5a5';
        delBtn.style.marginLeft = '8px';
        delBtn.textContent = 'Xóa';
        delBtn.onclick = async (e) => {
          e.stopPropagation();
          await deleteCurrentQualifier(event.id);
          openQualifierEvents();
        };
        card.append(delBtn);
      }
      list.append(card);
    }
  } catch (err) { list.textContent = err.message; }
}
async function registerQualifier() {
  if (currentAppRole !== 'TEAM') { document.getElementById('btn-user-auth-action').click(); return; }
  if (!qualifierId) { openQualifierEvents(); return; }
  const button = document.getElementById('qualifier-register'); button.disabled = true;
  try {
    await qualifierAPI(`/${qualifierId}/register`, {method:'POST'});
    // A polling request may still be running; invalidate its displayed snapshot.
    await loadQualifierPage();
    notifySuccess('Đã đăng ký thi', 'Bạn có thể nộp bot cho vòng loại này.');
  } catch (err) { notifyError('Không thể đăng ký', err.message); }
  finally { renderQualifierRegistration(qualifierData); }
}
function openQualifierTestBots() {
  if (currentAppRole !== 'ADMIN' || !qualifierData) return;
  qualifierTestEventId = qualifierId;
  document.getElementById('qualifier-test-name').textContent = qualifierData.event.name;
  document.getElementById('qualifier-test-error').textContent = '';
  document.getElementById('qualifier-test-dialog').showModal();
}
async function generateQualifierTestBots(event) {
  event.preventDefault();
  const button = document.getElementById('qualifier-test-save'); if (button.disabled) return; button.disabled = true;
  try {
    await qualifierAPI(`/${qualifierTestEventId}/actions/test-bots`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({count:Number(document.getElementById('qualifier-test-count').value)})});
    document.getElementById('qualifier-test-dialog').close(); await loadQualifierPage();
    notifySuccess('Đã thêm bot thử nghiệm', 'Danh sách đội đã được cập nhật.');
  } catch (err) { document.getElementById('qualifier-test-error').textContent = err.message; }
  finally { button.disabled = false; }
}

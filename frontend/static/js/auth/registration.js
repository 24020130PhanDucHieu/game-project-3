function closeRegistrationPage() {
  document.getElementById('view-register').style.display = 'none';
}

function showRegistrationPage() {
  hideLoginPage();
  document.getElementById('view-register').style.display = 'flex';
  document.getElementById('register-error').hidden = true;
  document.getElementById('register-sid').focus();
}

async function submitRegistration(event) {
  event.preventDefault();
  const button = document.getElementById('btn-register-submit');
  if (button.disabled) return;
  const error = document.getElementById('register-error');
  const studentID = document.getElementById('register-sid').value.trim();
  const password = document.getElementById('register-password').value;
  error.hidden = true;
  button.disabled = true;
  button.textContent = 'Đang đăng ký…';
  try {
    const response = await fetch(`${API_BASE}/api/teams/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentID, team_name: document.getElementById('register-name').value.trim(), password })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Không thể đăng ký đội.');
    document.getElementById('form-register').reset();
    closeRegistrationPage();
    showLoginPage();
    document.getElementById('inp-login-user').value = data.student_id;
    document.getElementById('inp-login-pass').value = '';
    document.getElementById('inp-login-pass').focus();
    notifySuccess('Đăng ký thành công', 'Bạn có thể đăng nhập ngay. Ban tổ chức sẽ thêm đội vào giải đấu.');
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = 'Đăng ký';
  }
}

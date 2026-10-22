import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
dist_index = ROOT / "frontend" / "dist" / "index.html"

try:
    html = urllib.request.urlopen("http://127.0.0.1:8000", timeout=2).read().decode("utf-8")
except Exception:
    if dist_index.exists():
        html = dist_index.read_text(encoding="utf-8")
    else:
        raise

# Check 1: Practice arena close buttons
assert 'id="btn-close-practice-x"' in html or 'id="btn-close-practice"' in html, "Practice close button missing"
print("Check 1 (Practice Arena Close buttons): OK")

# Check 2: Match login 2-field form
assert 'id="inp-login-user"' in html or 'id="inp-match-login-user"' in html, "login user input missing"
assert 'id="inp-login-pass"' in html or 'id="inp-match-login-pass"' in html, "login pass input missing"
assert 'id="btn-login-submit"' in html or 'id="btn-submit-unified-login"' in html, "login submit button missing"
assert 'id="login-error-msg"' in html or 'id="login-feedback-alert"' in html, "login error alert missing"
print("Check 2 (Unified 2-field login form): OK")

# Check 3: Admin room does NOT have private submission prompts
assert 'class="private-submission-prompt"' not in html, "Found private-submission-prompt in HTML!"
assert 'id="btn-open-studio-a"' not in html, "btn-open-studio-a still in HTML!"
assert 'id="btn-open-studio-b"' not in html, "btn-open-studio-b still in HTML!"
print("Check 3 (Admin room cleaned of team login/submit buttons): OK")

# Check 4: Admin live code monitor exists
assert 'id="admin-live-code-monitor"' in html, "admin-live-code-monitor missing"
print("Check 4 (Admin Live Code Monitor): OK")

# Check 6: Tournament creation number input
assert 'id="inp-new-tourn-teams"' in html, "inp-new-tourn-teams missing"
print("Check 6 (Tournament custom team count input): OK")

# Check 7: Team manager buttons and inputs
assert 'id="mgr-inp-name"' in html, "mgr-inp-name missing"
assert 'id="mgr-inp-sid"' in html, "mgr-inp-sid missing"
assert 'id="btn-mgr-add-team"' in html, "btn-mgr-add-team missing"
assert 'id="btn-mgr-quick-fill"' in html, "btn-mgr-quick-fill missing"
assert 'id="btn-mgr-auto-schedule"' in html, "btn-mgr-auto-schedule missing"
assert 'id="tbody-mgr-teams"' in html, "tbody-mgr-teams missing"
print("Check 7 (Team Manager inputs & buttons): OK")

print("\nALL HTML STATIC INTEGRATION CHECKS PASSED PERFECTLY!")

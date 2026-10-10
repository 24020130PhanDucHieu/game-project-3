import urllib.request

html = urllib.request.urlopen("http://127.0.0.1:8000").read().decode("utf-8")

# Check 1: Practice arena close buttons
assert 'id="btn-close-practice-x"' in html, "btn-close-practice-x missing"
assert 'id="btn-practice-exit-inline"' in html, "btn-practice-exit-inline missing"
assert 'id="btn-close-practice"' in html, "btn-close-practice missing"
print("Check 1 (Practice Arena Close X buttons): OK")

# Check 2: Match login 2-field form
assert 'id="inp-match-login-user"' in html, "inp-match-login-user missing"
assert 'id="inp-match-login-pass"' in html, "inp-match-login-pass missing"
assert 'id="btn-submit-unified-login"' in html, "btn-submit-unified-login missing"
assert 'id="login-feedback-alert"' in html, "login-feedback-alert missing"
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

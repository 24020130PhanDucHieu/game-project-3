function renderAdminLiveCodeMonitor(match) {
  const monitor = document.getElementById("admin-live-code-monitor");
  if (!monitor) return;

  if (currentUserRole === "ADMIN") {
    monitor.style.display = "block";
    const teamA = match.team_a;
    const teamB = match.team_b;

    const nameA = document.getElementById("monitor-team-a-name");
    const langA = document.getElementById("monitor-team-a-lang");
    const codeA = document.getElementById("monitor-code-a");
    if (nameA) nameA.textContent = teamA ? teamA.team_name : "Đội Đỏ";
    if (langA) langA.textContent = teamA ? (teamA.draft_lang || teamA.current_lang || "PYTHON") : "PYTHON";
    if (codeA) {
      const contentA = (teamA && (teamA.draft_code || teamA.current_code)) ? (teamA.draft_code || teamA.current_code) : "# Đội Đỏ chưa nộp mã lệnh...";
      codeA.textContent = contentA;
    }

    const nameB = document.getElementById("monitor-team-b-name");
    const langB = document.getElementById("monitor-team-b-lang");
    const codeB = document.getElementById("monitor-code-b");
    if (nameB) nameB.textContent = teamB ? teamB.team_name : "Đội Xanh";
    if (langB) langB.textContent = teamB ? (teamB.draft_lang || teamB.current_lang || "PYTHON") : "PYTHON";
    if (codeB) {
      const contentB = (teamB && (teamB.draft_code || teamB.current_code)) ? (teamB.draft_code || teamB.current_code) : "# Đội Xanh chưa nộp mã lệnh...";
      codeB.textContent = contentB;
    }
  } else {
    monitor.style.display = "none";
  }
}

// =============================================================================
// 9. TAB 3: NHẬT KÝ & LỊCH SỬ TRẬN ĐẤU (GLOBAL MATCH HISTORY)
// =============================================================================
async function loadGlobalMatchHistory() {
  const tbody = document.getElementById("tbody-matches");
  tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Đang nạp dữ liệu lịch sử...</td></tr>`;

  try {
    const res = await fetch(`${API_BASE}/api/matches/history`);
    const history = await res.json();

    if (!history || history.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Chưa có trận đấu nào được lưu lại.</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    history.forEach(m => {
      const tr = document.createElement("tr");
      const d = new Date(m.timestamp * 1000);
      const timeStr = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')} ${d.getDate()}/${d.getMonth()+1}`;

      const b1 = m.bot_names ? m.bot_names[0] : "Đội A";
      const b2 = m.bot_names ? m.bot_names[1] : "Đội B";

      tr.innerHTML = `
        <td><code>${m.match_id.substring(0, 10)}...</code></td>
        <td>${timeStr}</td>
        <td>${m.stage || 'Chuẩn'}</td>
        <td><strong>${escapeHtml(b1)}</strong> vs <strong>${escapeHtml(b2)}</strong></td>
        <td>${m.total_rounds || 5} Hiệp</td>
        <td><strong class="text-success">${escapeHtml(m.winner_name || 'Hòa')}</strong></td>
        <td>
          <span style="font-size:12px; color:var(--text-muted)">Hoàn thành</span>
        </td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error("Lỗi nạp lịch sử trận đấu:", err);
  }
}

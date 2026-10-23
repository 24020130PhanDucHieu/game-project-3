// =============================================================================
// 10. TAB 4: BẢNG XẾP HẠNG ELO (LEADERBOARD)
// =============================================================================
// =============================================================================
async function loadLeaderboard() {
  const tbody=document.getElementById("tbody-ranking");
  if (!tbody) return;
  try {
    const response=await fetch(`${API_BASE}/api/ranking`);
    if (!response.ok) throw new Error("Không tải được xếp hạng.");
    const ranks=await response.json();
    const rows=ranks;
    tbody.innerHTML=rows.length ? rankingRows(rows) : '<tr><td colspan="4">Chưa có dữ liệu xếp hạng.</td></tr>';
  } catch { tbody.innerHTML='<tr><td colspan="4">Không tải được dữ liệu xếp hạng. Hãy thử lại.</td></tr>'; }
}

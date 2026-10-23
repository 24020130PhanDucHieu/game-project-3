// Helper chọn nhanh số lượng đội & preview thể thức trong Modal Tạo Giải Đấu
window.selectTournSizePreset = function(size) {
  const inp = document.getElementById("inp-new-tourn-teams");
  if (inp) inp.value = size;
  document.querySelectorAll(".preset-pill-btn").forEach(btn => {
    btn.classList.toggle("active", parseInt(btn.textContent, 10) === size);
  });
  window.updateTournSizePreview(size);
};

window.updateTournSizePreview = function(val) {
  const num = parseInt(val, 10);
  const textEl = document.getElementById("tourn-format-preview-text");
  if (!textEl) return;
  if (num === 4) {
    textEl.textContent = "Bán Kết (2 trận) → Chung Kết (1 trận) • 2 Vòng";
  } else if (num === 8) {
    textEl.textContent = "Tứ Kết (4 trận) → Bán Kết (2 trận) → Chung Kết (1 trận) • 3 Vòng";
  } else if (num === 16) {
    textEl.textContent = "Vòng 1/8 (8 trận) → Tứ Kết (4 trận) → Bán Kết (2 trận) → Chung Kết (1 trận) • 4 Vòng";
  } else if (num === 32) {
    textEl.textContent = "Vòng 1/16 (16 trận) → Vòng 1/8 (8 trận) → Tứ Kết (4 trận) → Bán Kết (2 trận) → Chung Kết (1 trận) • 5 Vòng";
  } else if (num > 0 && (num & (num - 1)) === 0) {
    textEl.textContent = `Vòng 1 (${num/2} trận) → ... → Bán Kết → Chung Kết • ${Math.round(Math.log2(num))} Vòng`;
  } else {
    textEl.textContent = "Quy tắc: Số đội phải là lũy thừa của 2 (4, 8, 16, 32...) để phân nhánh loại trực tiếp";
  }
};

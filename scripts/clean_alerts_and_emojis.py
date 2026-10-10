import re

def update_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Add Toast Notification system if not present
    toast_system = """// =============================================================================
// PRODUCTION-GRADE TOAST & IN-APP NOTIFICATION BANNER SYSTEM
// =============================================================================
function showToast(type, title, message = "", duration = 4000) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast-item toast-${type}`;

  const badgeText = type === "success" ? "THÀNH CÔNG" : (type === "error" ? "LỖI" : (type === "warning" ? "CẢNH BÁO" : "THÔNG BÁO"));

  toast.innerHTML = `
    <span class="toast-badge">${badgeText}</span>
    <div class="toast-body">
      <div class="toast-title">${escapeHtml(title)}</div>
      ${message ? `<div class="toast-desc">${escapeHtml(message)}</div>` : ''}
    </div>
    <button class="toast-close" title="Đóng">&times;</button>
  `;

  const btnClose = toast.querySelector(".toast-close");
  if (btnClose) {
    btnClose.addEventListener("click", () => removeToast(toast));
  }

  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => {
      removeToast(toast);
    }, duration);
  }
}

function removeToast(toast) {
  if (!toast || toast.classList.contains("toast-leave")) return;
  toast.classList.add("toast-leave");
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 250);
}

function notifySuccess(title, message = "") { showToast("success", title, message); }
function notifyError(title, message = "") { showToast("error", title, message); }
function notifyWarning(title, message = "") { showToast("warning", title, message); }
function notifyInfo(title, message = "") { showToast("info", title, message); }

"""

    if "function showToast" not in content:
        # Insert after API_BASE
        api_base_idx = content.find("const API_BASE =")
        if api_base_idx != -1:
            end_of_line = content.find("\n", api_base_idx) + 1
            content = content[:end_of_line] + "\n" + toast_system + content[end_of_line:]

    # 2. Clean Emojis from PIECE_ICONS
    content = content.replace('"ROCK": "Búa"', '"ROCK": "BÚA"')
    content = content.replace('"PAPER": "Bao"', '"PAPER": "BAO"')
    content = content.replace('"SCISSORS": "Kéo"', '"SCISSORS": "KÉO"')
    content = content.replace('"✊"', '"BÚA"')
    content = content.replace('"✋"', '"BAO"')
    content = content.replace('"✌️"', '"KÉO"')

    # 3. Clean emojis in text labels
    content = content.replace('⚙️ Server:', 'Server:')
    content = content.replace('⚙️ Cấu hình Máy Chủ Backend', 'Cấu Hình Máy Chủ API')
    content = content.replace('Code Hợp Lệ ✓', 'Mã Hợp Lệ [OK]')
    content = content.replace('Code Không Hợp Lệ ✗', 'Mã Lỗi [FAIL]')
    content = content.replace('Hợp Lệ ✓', 'Hợp Lệ [OK]')
    content = content.replace('Không Hợp Lệ ✗', 'Không Hợp Lệ [FAIL]')
    content = content.replace('Đã Khóa 🔒', 'Đã Khóa [LOCKED]')
    content = content.replace('❚❚ Tạm Dừng', 'Tạm Dừng')
    content = content.replace('▶ Tiếp Tục', 'Tiếp Tục')

    # 4. Replace alerts with toast notifications
    # Specific alerts
    content = content.replace(
        'alert("Đã cập nhật máy chủ Backend! Đang tải lại trang...");',
        'notifySuccess("Cập Nhật Máy Chủ", "Đã lưu địa chỉ máy chủ API. Đang tải lại trang...");'
    )
    content = content.replace(
        'alert("Quyền hạn: Bạn đang đăng nhập với tư cách Đội Đỏ, không thể truy cập phòng nộp bot của Đội Xanh!");',
        'notifyWarning("Quyền Hạn", "Bạn đang đăng nhập với tư cách Đội Đỏ, không thể truy cập phòng của Đội Xanh!");'
    )
    content = content.replace(
        'alert("Quyền hạn: Bạn đang đăng nhập với tư cách Đội Xanh, không thể truy cập phòng nộp bot của Đội Đỏ!");',
        'notifyWarning("Quyền Hạn", "Bạn đang đăng nhập với tư cách Đội Xanh, không thể truy cập phòng của Đội Đỏ!");'
    )
    content = content.replace(
        'alert(`Đăng nhập thất bại: ${data.detail || \'Sai MSSV hoặc mật khẩu!\'}`);',
        'notifyError("Đăng Nhập Thất Bại", data.detail || "Sai thông tin tài khoản hoặc mật khẩu!");'
    )
    content = content.replace(
        'alert("Xác thực thành công! Mở khóa IDE nộp mã lệnh.");',
        'notifySuccess("Xác Thực Thành Công", "Đã mở khóa phòng thi đấu và IDE nộp mã lệnh.");'
    )
    content = content.replace(
        'alert("Vui lòng viết mã lệnh bot trước khi nộp!");',
        'notifyWarning("Thiếu Mã Lệnh", "Vui lòng viết mã lệnh bot trong khung soạn thảo trước khi nộp!");'
    )
    content = content.replace(
        'alert(`Lỗi nộp mã lệnh: ${data.detail || \'Không thể nộp\'}`);',
        'notifyError("Lỗi Nộp Mã Lệnh", data.detail || "Không thể nộp bài vào hệ thống.");'
    )
    content = content.replace(
        'alert(`Nộp Bot thành công cho Round ${curRound}!\\n✓ Mã lệnh đã vượt qua kiểm tra Sandbox (${data.validation?.execution_time_ms || 0}ms).\\nTrạng thái đội: ĐÃ SẴN SÀNG.`);',
        'notifySuccess(`Nộp Bot Round ${curRound} Thành Công`, `Mã lệnh đã thẩm định qua Sandbox (${data.validation?.execution_time_ms || 0}ms). Trạng thái: ĐÃ SẴN SÀNG.`);'
    )
    content = content.replace(
        'alert(`Cảnh báo: Đã tiếp nhận bài nộp nhưng CODE KHÔNG HỢP LỆ:\\n${data.validation?.error_message || \'Lỗi cú pháp/thực thi\'}\\nĐội chưa đủ điều kiện sẵn sàng! Vui lòng sửa lại code.`);',
        'notifyWarning("Code Không Hợp Lệ", `${data.validation?.error_message || "Lỗi cú pháp/thực thi"}. Vui lòng sửa lại code.`);'
    )
    content = content.replace(
        'alert("Chỉ Ban tổ chức (Admin) mới có quyền phát lệnh bắt đầu trận đấu!");',
        'notifyWarning("Quyền Hạn", "Chỉ Ban tổ chức (Admin) mới có quyền phát lệnh bắt đầu trận đấu!");'
    )
    content = content.replace(
        'alert("Chưa đủ điều kiện bắt đầu! Cả hai đội phải nộp mã lệnh hợp lệ trước khi Ban tổ chức khai hỏa.");',
        'notifyWarning("Chưa Đủ Điều Kiện", "Cả hai đội phải nộp mã lệnh hợp lệ trước khi khai hỏa.");'
    )
    content = content.replace(
        'alert(`Lỗi thi đấu: ${data.detail || \'Không thể chạy round\'}`);',
        'notifyError("Lỗi Thi Đấu", data.detail || "Không thể khởi chạy hiệp đấu.");'
    )
    content = content.replace(
        'alert("Có lỗi trong quá trình thi đấu.");',
        'notifyError("Lỗi Hệ Thống", "Có lỗi trong quá trình thi đấu.");'
    )
    content = content.replace(
        'alert(`Lỗi: ${data.detail || \'Không thể nạp\'}`);',
        'notifyError("Lỗi Thao Tác", data.detail || "Không thể nạp.");'
    )
    content = content.replace(
        'alert(data.message);',
        'notifyInfo("Thông Báo", data.message || "");'
    )
    content = content.replace(
        'alert(`Lỗi: ${data.detail || \'Không thể đặt lại\'}`);',
        'notifyError("Lỗi Thao Tác", data.detail || "Không thể đặt lại.");'
    )
    content = content.replace(
        'alert(`Không tìm thấy dữ liệu diễn biến bàn cờ cho Round ${roundNum}!`);',
        'notifyWarning("Không Tìm Thấy Replay", `Không có dữ liệu diễn biến bàn cờ cho Round ${roundNum}!`);'
    )
    content = content.replace(
        'alert("Vui lòng nhập tên giải đấu!");',
        'notifyWarning("Thiếu Tên Giải Đấu", "Vui lòng nhập tên giải đấu!");'
    )
    content = content.replace(
        'alert("Số lượng đội tham gia phải là một số lũy thừa của 2 và tối thiểu 4 đội (ví dụ: 4, 8, 16, 32...) để tạo nhánh đấu loại trực tiếp hợp lệ!");',
        'notifyWarning("Quy Mô Không Hợp Lệ", "Số lượng đội phải là lũy thừa của 2 (4, 8, 16, 32...) để tạo nhánh đấu loại trực tiếp!");'
    )
    content = content.replace(
        'alert(`Lỗi tạo giải: ${data.detail || \'Không thể tạo\'}`);',
        'notifyError("Lỗi Tạo Giải Đấu", data.detail || "Không thể tạo giải đấu mới.");'
    )
    content = content.replace(
        'alert(data.message || "Khởi tạo giải đấu thành công!");',
        'notifySuccess("Khởi Tạo Giải Đấu", data.message || "Khởi tạo giải đấu thành công!");'
    )
    content = content.replace(
        'alert("Vui lòng nhập Tên Đội và Mã Số Sinh Viên (MSSV)!");',
        'notifyWarning("Thiếu Thông Tin", "Vui lòng nhập Tên Đội và Mã Số Sinh Viên (MSSV)!");'
    )
    content = content.replace(
        'alert(`Không thể thêm đội: ${data.detail || \'Lỗi thêm đội\'}`);',
        'notifyError("Không Thể Thêm Đội", data.detail || "Lỗi thêm đội.");'
    )
    content = content.replace(
        'alert(data.message || `Đã thêm thành công đội ${name}!`);',
        'notifySuccess("Thêm Đội Thành Công", data.message || `Đã thêm thành công đội ${name}!`);'
    )
    content = content.replace(
        'alert(`Lỗi xóa đội: ${data.detail || \'Không thể xóa\'}`);',
        'notifyError("Lỗi Xóa Đội", data.detail || "Không thể xóa đội khỏi giải.");'
    )
    content = content.replace(
        'alert(data.message || "Đã xóa đội khỏi danh sách giải đấu!");',
        'notifySuccess("Xóa Đội Thành Công", "Đã xóa đội khỏi danh sách giải đấu!");'
    )
    content = content.replace(
        'alert(`Lỗi nạp đội: ${data.detail || \'Không thể nạp\'}`);',
        'notifyError("Lỗi Nạp Đội Mẫu", data.detail || "Không thể nạp danh sách mẫu.");'
    )
    content = content.replace(
        'alert(data.message || "Đã nạp nhanh đủ danh sách đội mẫu!");',
        'notifySuccess("Nạp Đội Mẫu Thành Công", data.message || "Đã nạp nhanh đủ danh sách đội mẫu!");'
    )
    content = content.replace(
        'alert(`Giải đấu yêu cầu chính xác ${required} đội!\\nHiện tại danh sách mới có ${teams.length} đội.\\nVui lòng thêm đủ đúng ${required} đội (không thừa, không thiếu) trước khi bấm tự sắp xếp lịch đấu!`);',
        'notifyWarning("Chưa Đủ Số Lượng Đội", `Giải đấu yêu cầu đúng ${required} đội (hiện có ${teams.length} đội). Vui lòng thêm đủ trước khi xếp lịch!`);'
    )
    content = content.replace(
        'alert(`Lỗi xếp lịch: ${data.detail || \'Không thể xếp lịch\'}`);',
        'notifyError("Lỗi Xếp Lịch", data.detail || "Không thể xếp lịch thi đấu.");'
    )
    content = content.replace(
        'alert("Đã tự động sắp xếp các đội vào các cặp đấu trên Sơ đồ giải đấu thành công!");',
        'notifySuccess("Xếp Lịch Hoàn Tất", "Đã phân nhánh các đội vào sơ đồ giải đấu.");'
    )
    content = content.replace(
        'alert("Vui lòng viết mã bot trong khung soạn thảo trước khi thử nghiệm!");',
        'notifyWarning("Thiếu Mã Lệnh", "Vui lòng viết mã bot trong khung soạn thảo trước khi thử nghiệm!");'
    )
    content = content.replace(
        'alert(`Lỗi thử nghiệm: ${data.detail || \'Không thể mô phỏng trận đấu\'}`);',
        'notifyError("Lỗi Thử Nghiệm", data.detail || "Không thể mô phỏng trận đấu.");'
    )
    content = content.replace(
        'alert(`Đã đổi luật thành công sang: ${data.stage}`);',
        'notifySuccess("Đổi Luật Thành Công", `Đã áp dụng luật thi đấu: ${data.stage}`);'
    )
    content = content.replace(
        'alert("Không thể kết nối đến máy chủ.");',
        'notifyError("Lỗi Kết Nối", "Không thể kết nối đến máy chủ API.");'
    )
    content = content.replace(
        'alert("Lỗi kết nối máy chủ.");',
        'notifyError("Lỗi Kết Nối", "Không thể kết nối đến máy chủ API.");'
    )

    # Any remaining generic alerts
    content = re.sub(r'alert\((.*?)\);', r'notifyInfo("Thông Báo", \1);', content)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Updated {filepath} successfully.")

update_file('frontend/app.js')
update_file('frontend/js/main.js')

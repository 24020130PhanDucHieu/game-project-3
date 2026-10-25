# Đổi và khôi phục mật khẩu ban tổ chức

## Đổi mật khẩu (đang đăng nhập)
Quản trị Admin → tab **Bảo mật**. Ba yếu tố:
1. Đang đăng nhập (phiên hợp lệ).
2. Nhập đúng **mật khẩu hiện tại** (kiểm ở cả hai bước; sai 5 lần thì khóa 15 phút theo IP, chung với đăng nhập).
3. Nhập **mã 6 số** gửi tới email đã đăng ký: tài khoản chủ nhận ở `ADMIN_EMAIL` (mặc định `SMTP_USER`), giám khảo nhận ở email chủ đã đặt cho họ (Admin → Giám khảo → Đặt email).

Mã: hiệu lực 10 phút, dùng một lần, sai 5 lần thì hủy, 1 mã/60 giây và tối đa 5 mã/giờ cho mỗi tài khoản. Máy chủ chỉ lưu bản băm HMAC của mã.
Mật khẩu mới: 10–72 ký tự, có chữ và số, khác mật khẩu cũ, không chứa tên đăng nhập, không phải mật khẩu phổ biến.
Đổi xong: mọi phiên đăng nhập cũ của tài khoản đó bị thu hồi (thiết bị vừa đổi nhận phiên mới), có nhật ký quản trị `ADMIN_PASSWORD_CHANGED` và email cảnh báo.

## Quên mật khẩu tài khoản chủ
Màn hình đăng nhập → tích "Đăng nhập Ban tổ chức / Giám khảo" → **Quên mật khẩu ban tổ chức?** → tích "Tôi không phải robot" → mã gửi tới `ADMIN_EMAIL` → nhập mã và mật khẩu mới (tối đa 3 yêu cầu/giờ/IP). Giám khảo quên mật khẩu thì nhờ tài khoản chủ đặt lại.

## Khẩn cấp (không dùng được email)
Mật khẩu chủ đã đổi qua web được lưu trong cơ sở dữ liệu (khóa `adminowner`) và thay hẳn `ADMIN_PASSWORD`. Nếu quên mà không nhận được email:
1. SSH vào máy chủ, thêm `ADMIN_PASSWORD_FORCE_ENV=1` vào `/etc/arena/backend.env`.
2. `sudo systemctl restart arena-api` — đăng nhập lại bằng `ADMIN_PASSWORD` trong file này.
3. Vào Admin → Bảo mật đặt mật khẩu mới, rồi xóa dòng `ADMIN_PASSWORD_FORCE_ENV=1` và khởi động lại dịch vụ.

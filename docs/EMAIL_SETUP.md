# Cấu hình gửi email khôi phục mật khẩu (Gmail)

Đội quên mật khẩu nhập **MSSV + email đã đăng ký**; nếu khớp, gateway gửi mã khôi phục (hiệu lực 15 phút) tới email đó. Mỗi MSSV tối đa 3 yêu cầu/giờ; phản hồi luôn giống nhau để không lộ tài khoản nào tồn tại.

## Tạo App password Gmail
1. Dùng một tài khoản Gmail riêng của ban tổ chức, bật **Xác minh 2 bước**.
2. Vào https://myaccount.google.com/apppasswords → tạo mật khẩu ứng dụng tên "BOT K69 ARENA" → chép chuỗi 16 ký tự.

## Đặt biến môi trường trên gateway AWS
Thêm vào file env của dịch vụ `arena-api` (ví dụ `/etc/arena/arena.env`, quyền 600):

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=ten.btc@gmail.com
SMTP_PASSWORD=<app password 16 ký tự>
SMTP_FROM=ten.btc@gmail.com
```

Rồi `sudo systemctl restart arena-api`. Kiểm tra: Quản trị Admin → Giám sát → thẻ **Gửi email** hiện "Đã cấu hình SMTP".

Gmail giới hạn khoảng 500 email/ngày. Không commit App password vào git.

## Xem mật khẩu đội
Quản trị Admin → Tài khoản → cột **Mật khẩu**: bấm biểu tượng mắt để hiện trong 15 giây. Mỗi lần xem được ghi vào Nhật ký với tên giám khảo.

# Chuyển PostgreSQL sang Supabase

Backend dùng PostgreSQL qua `DATABASE_URL`; frontend Cloudflare vẫn gọi backend Render. Không đưa database password hoặc service role key vào Cloudflare/frontend.

Không chạy `database/schema.sql` để khởi tạo bản triển khai này: backend hiện lưu snapshot JSONB và tự tạo schema runtime qua repository. File schema tham khảo không thay thế các migration runtime đó.

## Kết nối

1. Tạo project Supabase, chọn vùng gần Render (Singapore nếu có).
2. Chọn **Connect → Session pooler**, sao chép URI với port **5432**. Điền mật khẩu database, URL-encode ký tự đặc biệt trong mật khẩu. Thêm `sslmode=require` và `connect_timeout=15` vào query string.
3. Trong Render → Environment, thay `DATABASE_URL` bằng URI đó. Không gửi URI thật qua chat hoặc commit vào Git.
4. Giữ nguyên `SESSION_SECRET`, `ADMIN_PASSWORD` và khóa mã hóa tài khoản hiện có. Nếu trước đây không đặt `SESSION_SECRET`, không tự đổi sang khóa mới khi chuyển database.
5. Đặt `QUALIFIER_WORKERS=2` trước; đo CPU/RAM rồi mới tăng. Deploy bản backend mới, sau đó deploy frontend mới lên Cloudflare.

Ví dụ (chỉ là placeholder):

```text
postgresql://postgres.PROJECT_REF:URL_ENCODED_PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require&connect_timeout=15
```

Không dùng Transaction pooler port 6543: vòng loại giữ session advisory lock để tránh hai worker xử lý cùng giải. Backend từ chối cấu hình này cho hostname Supabase pooler.

Backend tự tạo bảng và bật Row Level Security cho cả ba bảng. Không tạo policy cho `anon`/`authenticated`: dữ liệu tài khoản và mã bot chỉ được truy cập qua backend với tài khoản PostgreSQL sở hữu bảng. Không dùng Supabase Data API trực tiếp từ trình duyệt. Khi restore backup cũ, khởi động backend mới để bật lại RLS trước khi mở truy cập.

## Giữ dữ liệu cũ

Thay URL không tự chuyển dữ liệu. Nếu dùng Supabase trống, tài khoản/giải cũ sẽ chưa xuất hiện. Chỉ chuyển dịch vụ sau khi đã phục hồi dữ liệu nếu cần giữ các tài khoản đó.

Khi Neon kết nối lại được: tạm dừng dịch vụ đang ghi, dùng `pg_dump` xuất riêng ba bảng `public.tournaments`, `public.arena_accounts`, `public.arena_qualifier_records` ra bản sao lưu định dạng custom. Khôi phục bằng `pg_restore --no-owner --no-privileges` vào project Supabase trống. Không dùng `--clean` vào database có dữ liệu. Kiểm tra số bản ghi và giữ bản sao lưu trước khi thay URL. Giữ nguyên các khóa mã hóa/session. Vòng loại RUNNING sẽ tự tiếp tục khi backend khởi động; chỉ khởi động một backend trong lúc chuyển.

Nếu Neon đang khóa do hết hạn mức, cần khôi phục quyền truy cập hoặc dùng backup có sẵn để chuyển dữ liệu; xóa dữ liệu không hoàn lại lưu lượng mạng đã dùng trong tháng.

## Xác minh sau chuyển

- Render log kết nối PostgreSQL thành công, API `/health` và danh sách giải trả thành công.
- Đăng nhập tài khoản cũ, F5, đổi tab; giải và phiên còn nguyên.
- Chạy vòng loại nhỏ 8 bot trước; kiểm tra khóa bài, tiến độ, ELO, chốt bảng đấu.
- Theo dõi database egress, số kết nối, CPU/RAM trước khi chạy 2.000 bot.

Bản sửa giảm tải mã nguồn khi xem danh sách/BXH, lọc kết quả theo đội ngay trong SQL, cache metadata tối đa khoảng 16 MiB payload với TTL 5 giây và hủy cache khi ghi. Lỗi xử lý trận dừng nhận thêm trận, giữ tiến độ để tiếp tục. Lỗi database trả lỗi dịch vụ thay vì danh sách rỗng hoặc phiên đăng nhập không hợp lệ.

Supabase vẫn có hạn mức; đổi database không loại bỏ cold start của Render Free hoặc bảo đảm không gián đoạn. Cần dịch vụ luôn chạy nếu tổ chức giải trực tiếp.

Tài liệu: https://supabase.com/docs/guides/database/connecting-to-postgres

## Kiểm thử bản sửa

- `go test ./...`: đạt.
- `tests/e2e/test_reliability.py`: đạt 19 nhóm với backend và sandbox thật trên máy local.
- `tests/e2e/test_qualifier_2000.py --ui-only`: đạt luồng vòng loại, khôi phục tiến độ, lịch đấu và chốt đội.
- `tests/unit/test_tournament_outage.cjs`: đạt bảo toàn giải khi lỗi 503/404 không xác nhận.
- Fixture metadata 2.000 bot, mỗi bot 64.000 byte source: kiểm tra bỏ code khỏi view, cache không bị sửa từ bên ngoài và hủy cache khi cập nhật. Không phải benchmark 2.000 trận thực tế trên Supabase.
- Build frontend thành công. Chưa kiểm thử kết nối Supabase thật hoặc chuyển dữ liệu Neon vì chưa có database đích và Neon đang bị chặn hạn mức.

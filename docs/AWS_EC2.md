# Backend trên AWS EC2, frontend Cloudflare, database Supabase

## Máy chủ đã chuẩn bị

- EC2 Ubuntu 24.04: `13.250.49.111`, SSH user `ubuntu`.
- Frontend: `https://game-project-3.phanhieu06hungyen.workers.dev`.
- Backend HTTPS dự kiến: `https://arena.13.250.49.111.sslip.io`.
- API Go: `/opt/arena/app/server`, nghe nội bộ `127.0.0.1:8080`.
- Worker Python/C++ WASI: `127.0.0.1:8001`, không mở ra Internet.
- Caddy quản lý chứng chỉ HTTPS và chuyển tiếp WebSocket.
- Database tiếp tục dùng PostgreSQL Supabase qua `DATABASE_URL` hiện tại.

## Cấu hình còn cần trước khi chuyển frontend

Điền `.env.ec2` ở thư mục gốc dự án từ Environment của Render:

```dotenv
DATABASE_URL=...
ADMIN_PASSWORD=...
SESSION_SECRET=...
CORS_ORIGIN=https://game-project-3.phanhieu06hungyen.workers.dev
```

Giữ nguyên khóa từ Render. Nếu Render không đặt `SESSION_SECRET`, dùng giá trị `ADMIN_PASSWORD` hiện tại. Không đưa file này hoặc khóa `.pem` vào Git. Chỉ chuyển các giá trị cần thiết vào `/etc/arena/backend.env` trên EC2, chủ sở hữu root, quyền `0600`. Không dán bí mật vào chat hoặc command line.

Sau khi đặt cấu hình:

```sh
sudo systemctl enable --now arena-api
sudo systemctl status arena-api arena-worker caddy --no-pager
curl -f https://arena.13.250.49.111.sslip.io/health
```

Kiểm tra kết nối database, CORS đúng frontend, capabilities Python/C++, WebSocket và dữ liệu giải trước khi đổi API frontend. Không chạy đồng thời vòng loại/trận đấu trên Render và AWS dùng cùng database. Sau khi chuyển frontend thành công, dừng dịch vụ Render để chỉ còn một backend xử lý lịch thi đấu.

## Đóng gói và cập nhật

Biên dịch Go trên máy local cho Linux amd64 (`CGO_ENABLED=0`, `GOOS=linux`, `GOARCH=amd64`). Dùng `scripts/package_ec2.py --binary <binary-linux> --output <archive.tar.gz>` để đóng gói các file ứng dụng, không gồm khóa hay `.env`.

Giải nén bản đầu vào `/opt/arena/app`, chạy `sudo sh /opt/arena/app/deploy/ec2/install.sh`. Cập nhật các lần sau trong thời gian không có hiệp/vòng loại đang chạy; giữ `/etc/arena/backend.env`, `/var/lib/arena` và dữ liệu chứng chỉ Caddy.

```sh
sudo journalctl -u arena-api -u arena-worker -n 80 --no-pager
sudo systemctl restart arena-worker arena-api
```

Máy hiện là t3.micro khoảng 1 GB RAM; `QUALIFIER_WORKERS=1` và giới hạn bộ nhớ systemd dành cho cấu hình này. Đây không phải cam kết chịu được số lượng bot đồng thời không giới hạn.

Hostname `sslip.io` phụ thuộc dịch vụ DNS bên ngoài và IP công khai hiện tại. EC2 chưa gắn Elastic IP; nếu Stop/Start làm đổi IP, phải cập nhật hostname/Caddy/API frontend. Có thể chuyển sang tên miền riêng hoặc Elastic IP khi cần địa chỉ lâu dài.

## Deployment status (2026-10-19)

EC2 API, worker and Caddy are enabled and running. HTTPS `/health` reports `HEALTHY`; PostgreSQL connects successfully; `/api/capabilities` lists Python and C++. Runtime secrets are in `/etc/arena/backend.env` (root, 0600); the local `.env.ec2` is ignored by Git.

Frontend source uses the AWS API (assets v4.19) and removes saved overrides pointing to the old Render URL. Publish the updated frontend to Cloudflare and verify it before suspending Render.

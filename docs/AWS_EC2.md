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

## Quy trình tự động triển khai (Automated Deployment)

Dự án cung cấp 2 phương thức tự động deploy lên AWS EC2:

### 1. Tự động qua GitHub Actions CI/CD (`.github/workflows/deploy-aws.yml`)
Khi code được push lên nhánh `main` (hoặc trigger thủ công qua menu Actions trên GitHub):
1. Runner chạy bộ kiểm thử tự động (Go tests, Python unittests, security sandbox tests).
2. Tự động build Linux Go binary (`server`) với `CGO_ENABLED=0 GOOS=linux GOARCH=amd64`.
3. Đóng gói release package `arena-release.tar.gz`.
4. Thiết lập SSH từ GitHub Secret `AWS_EC2_SSH_KEY`.
5. Upload và giải nén lên EC2 `/opt/arena/app`, tạo backup binary cũ tại `/opt/arena/backups/`.
6. Khởi động lại `arena-worker`, `arena-api` và reload `caddy`.
7. Kiểm tra trạng thái `/health`, `/ready` và capabilities. Tự động rollback nếu kiểm tra thất bại.

**GitHub Secrets cần cấu hình:**
- `AWS_EC2_SSH_KEY`: Nội dung toàn bộ file private key SSH (`bot-backend-key.pem`).
- `AWS_EC2_HOST` *(tùy chọn)*: IP máy chủ EC2 (mặc định: `13.250.49.111`).
- `AWS_EC2_USER` *(tùy chọn)*: Tên tài khoản SSH (mặc định: `ubuntu`).

### 2. Deploy tự động 1 lệnh từ máy local (`scripts/deploy_aws.py` / `make deploy-aws`)
Từ máy phát triển (Windows hoặc Linux), chỉ cần chạy:

```bash
# Quy trình đầy đủ: test -> build -> package -> upload -> restart -> verify
make deploy-aws

# Deploy nhanh (bỏ qua bước test, phù hợp sửa lỗi khẩn cấp)
make deploy-aws-quick

# Kiểm tra sức khỏe hệ thống từ xa
make check-aws

# Rollback khẩn cấp về bản build liền trước
make rollback-aws
```

Script sẽ tự động tìm khóa `bot-backend-key.pem` tại thư mục gốc dự án hoặc đọc từ biến môi trường `AWS_EC2_SSH_KEY_PATH`.

## Đóng gói thủ công (khi cần)

Biên dịch Go trên máy local cho Linux amd64 (`CGO_ENABLED=0`, `GOOS=linux`, `GOARCH=amd64`). Dùng `python scripts/package_ec2.py --binary backend/bin/server --output arena-release.tar.gz` để đóng gói các file ứng dụng, không gồm khóa hay `.env`.

Giải nén vào `/opt/arena/app`, chạy `sudo sh /opt/arena/app/deploy/ec2/install.sh`. Cập nhật các lần sau trong thời gian không có hiệp/vòng loại đang chạy; giữ `/etc/arena/backend.env`, `/var/lib/arena` và dữ liệu chứng chỉ Caddy.

```sh
sudo journalctl -u arena-api -u arena-worker -n 80 --no-pager
sudo systemctl restart arena-worker arena-api
sudo sh /opt/arena/app/deploy/ec2/check.sh
```

Máy hiện là t3.micro khoảng 1 GB RAM; `QUALIFIER_WORKERS=1` và giới hạn bộ nhớ systemd dành cho cấu hình này. Đây không phải cam kết chịu được số lượng bot đồng thời không giới hạn.

Hostname `sslip.io` phụ thuộc dịch vụ DNS bên ngoài và IP công khai hiện tại. EC2 chưa gắn Elastic IP; nếu Stop/Start làm đổi IP, phải cập nhật hostname/Caddy/API frontend. Có thể chuyển sang tên miền riêng hoặc Elastic IP khi cần địa chỉ lâu dài.


# C++17 trên máy chủ

Bản Docker cài WASI SDK 34 (kiểm SHA-256) và Wasmtime 49.0.0. C++ được biên dịch thành WebAssembly và chạy bằng WASI, không chạy binary native do đội nộp trên production.

- Nhận một dòng JSON trạng thái bàn qua STDIN; in đúng `ROCK`, `PAPER` hoặc `SCISSORS` qua STDOUT.
- Hỗ trợ thư viện chuẩn C++17 của libc++; không hỗ trợ thư viện ngoài, mạng, tiến trình con, luồng native hoặc truy cập file máy chủ.
- Mã nguồn tối đa 64 KB, biên dịch tối đa 15 giây, 384 MB không gian địa chỉ; mỗi worker biên dịch một bot tại một thời điểm. Biên dịch dùng Linux Landlock chỉ cho đọc toolchain và ghi thư mục tạm riêng; nếu hệ thống không hỗ trợ Landlock thì từ chối biên dịch.
- Mỗi nước dùng một WASI store mới: tối đa 64 MB bộ nhớ tuyến tính, 20 triệu fuel, 4 KB output và timeout của tiến trình. Mỗi hiệp tái sử dụng module đã biên dịch để giảm thời gian khởi tạo; bộ nhớ bot không được giữ giữa các nước.
- Không truyền biến môi trường bí mật hoặc mở thư mục máy chủ cho WASI.
- Python giữ luồng thực thi hiện có. Trong môi trường development trên Windows, C++ vẫn dùng g++ để kiểm thử local; production luôn dùng WASI.

## Triển khai

Deploy lại Docker image từ commit mới trên Render. `/api/capabilities` mở tùy chọn C++ khi production có bộ toolchain WASI. Không cần đổi Supabase hoặc xóa dữ liệu giải.

Máy chủ cần Linux có Landlock (kernel từ 5.13, chính sách container cho phép). Nếu môi trường không hỗ trợ, lỗi biên dịch sẽ báo rõ thay vì chạy code native thiếu cô lập. Với Docker Compose dùng image mới tương tự Render. Có thể đặt `WASI_CXX` cho worker nếu cài SDK ở đường dẫn khác khi kiểm thử.

## Kiểm thử Linux

```sh
sh bot-runner/install-wasi.sh
python3 -m venv /tmp/arena-wasi-test
/tmp/arena-wasi-test/bin/pip install -r bot-runner/requirements.txt
/tmp/arena-wasi-test/bin/python tests/unit/test_cpp_wasi.py
```

Bộ kiểm thử chạy mã C++ thật, đủ 8 tổ hợp luật, kiểm tra sương mù trong đầu vào, bộ nhớ mới mỗi nước, lỗi output, timeout và chặn đọc file/biến môi trường máy chủ.

Tài liệu nguồn: [WASI SDK](https://github.com/WebAssembly/wasi-sdk/releases/tag/wasi-sdk-34), [Wasmtime Python API](https://bytecodealliance.github.io/wasmtime-py/).

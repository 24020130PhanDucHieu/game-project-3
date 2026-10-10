# -*- coding: utf-8 -*-
"""
Cloudflare Tunnel Quick Launch Script.
Khởi chạy Cloudflare Tunnel miễn phí kết nối an toàn từ máy cục bộ ra Internet (Zero Cost).
"""

import subprocess
import os
import sys
import re

def start_tunnel(port=8080):
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    cloudflared_bin = os.path.join(root_dir, "cloudflared.exe")

    if not os.path.exists(cloudflared_bin):
        cloudflared_bin = "cloudflared" # fallback to PATH

    print(f"===========================================================")
    print(f"  KHỞI CHẠY CLOUDFLARE TUNNEL (CỔNG :{port})")
    print(f"===========================================================")
    print(f"Đang thiết lập đường hầm bảo mật Anycast tới Cloudflare Edge...")

    cmd = [cloudflared_bin, "tunnel", "--url", f"http://127.0.0.1:{port}"]

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )

        tunnel_url = None
        for line in proc.stdout:
            print(line, end="")
            if "trycloudflare.com" in line:
                match = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", line)
                if match:
                    tunnel_url = match.group(0)
                    print(f"\n===========================================================")
                    print(f"  ĐƯỜNG HẦM CLOUDFLARE ĐÃ SẴN SÀNG!")
                    print(f"  Link truy cập công khai: {tunnel_url}")
                    print(f"===========================================================\n")

        proc.wait()
    except KeyboardInterrupt:
        print("\nĐã đóng Cloudflare Tunnel.")
    except Exception as e:
        print(f"Lỗi khởi chạy Cloudflare Tunnel: {e}")

if __name__ == "__main__":
    target_port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    start_tunnel(target_port)

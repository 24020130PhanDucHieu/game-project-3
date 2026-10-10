@echo off
title Cloudflare Tunnel - Arena OTTV2
echo ============================================================
echo   KHOI CHAY CLOUDFLARE TUNNEL (CONG 8080)
echo ============================================================
cd ..
if exist cloudflared.exe (
    cloudflared.exe tunnel --url http://127.0.0.1:8080
) else (
    echo Khong tim thay cloudflared.exe!
)
pause

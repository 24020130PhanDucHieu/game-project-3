@echo off
chcp 65001 >nul
title OTTV2 AI Arena - He Thong Khoi Dong Tu Dong 24/7
color 0A

echo ============================================================
echo   HE THONG DAU TRUONG OTTV2 ICPC K69 - AUTO LAUNCHER
echo ============================================================
echo.

if not defined ADMIN_PASSWORD (
  echo Hay dat bien moi truong ADMIN_PASSWORD truoc khi khoi dong.
  exit /b 1
)
if not defined SESSION_SECRET (
  echo Hay dat SESSION_SECRET rieng va giu on dinh khi khoi dong lai.
  exit /b 1
)
if not defined PORT set PORT=8080

:: 1. Khoi chay Python Bot Runner (cong 8001)
echo [1/3] Dang khoi dong Python Bot-Runner Engine...
start /b "" python bot-runner\main.py

timeout /t 2 /nobreak >nul

:: 2. Khoi chay Go Backend API Gateway (cong 8080)
echo [2/3] Dang khoi dong Go Backend Server...
cd backend
start /b "" go run cmd\server\main.go
cd ..

timeout /t 2 /nobreak >nul

:: 3. Khoi chay Cloudflare Tunnel
echo [3/3] Dang thiet lap duong ham Cloudflare Tunnel...
echo ============================================================
echo   DANG LAY LINK TRUY CAP CLOUDFLARE CHO BAN...
echo ============================================================
echo.

.\cloudflared.exe tunnel --url http://127.0.0.1:8080

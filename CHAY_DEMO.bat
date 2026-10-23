@echo off
chcp 65001 >nul
title BOT ARENA K69 - DEMO (KHOI CHAY + NAP DU LIEU MAU)
color 0B
cd /d "%~dp0"

if not defined ADMIN_PASSWORD set "ADMIN_PASSWORD=admin123"
if not defined SESSION_SECRET set "SESSION_SECRET=arena-secret-key-k69-dev"
if not defined PORT set PORT=8080

echo [1/4] Khoi dong worker Python (8001)...
start "Bot-Runner (8001)" /min cmd /c "python bot-runner\main.py"

echo [2/4] Khoi dong backend Go (8080)... (lan dau co the mat 30-60 giay de bien dich)
start "Go Backend (8080)" cmd /k "cd backend && go run cmd\server\main.go"

echo [3/4] Khoi dong giao dien Next.js (3000)...
start "Next.js UI (3000)" cmd /k "cd frontend && npm run dev"

echo Dang cho backend san sang...
:wait_backend
curl -s -o nul http://127.0.0.1:8080/health
if errorlevel 1 (
  timeout /t 2 /nobreak >nul
  goto wait_backend
)
echo Dang cho giao dien san sang...
:wait_ui
curl -s -o nul http://127.0.0.1:3000
if errorlevel 1 (
  timeout /t 2 /nobreak >nul
  goto wait_ui
)

echo [4/4] Nap du lieu mau...
python scripts\seed_demo.py

echo.
echo =====================================================================
echo   Giao dien:  http://localhost:3000
echo   Admin:      admin / %ADMIN_PASSWORD%
echo   Doi thi:    24020001 / secret123   (hoac 24020002)
echo =====================================================================
start http://localhost:3000
pause

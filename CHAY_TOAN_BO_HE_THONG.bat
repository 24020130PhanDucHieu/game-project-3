@echo off
chcp 65001 >nul
title BOT ARENA K69 - KHOI CHAY TOAN BO HE THONG (GO + NEXT.JS + PYTHON)
color 0B

cd /d "%~dp0"

echo =====================================================================
echo   BOT ARENA K69 - HE THONG KHOI DONG DONG BO TOAN DIEN (1-CLICK)
echo =====================================================================
echo.

if not defined ADMIN_PASSWORD (
  set "ADMIN_PASSWORD=admin123"
  echo [LUU Y] Chua dat ADMIN_PASSWORD, tu dong dung mat khau mac dinh: admin123
)
if not defined SESSION_SECRET (
  set "SESSION_SECRET=arena-secret-key-k69-dev"
  echo [LUU Y] Chua dat SESSION_SECRET, tu dong dung key mac dinh cho moi truong dev
)
if not defined PORT set PORT=8080

:: 1. Khoi dong Python Bot-Runner (Cong 8001)
echo [1/3] Dang khoi dong Python Bot-Runner Sandbox (Cong 8001)...
start "Bot-Runner Sandbox (8001)" /min cmd /c "python bot-runner\main.py"

timeout /t 2 /nobreak >nul

:: 2. Khoi dong Go Backend Server (Cong 8080)
echo [2/3] Dang khoi dong Go Backend API Server (Cong 8080)...
start "Go Backend API (8080)" cmd /k "cd backend && go run cmd\server\main.go"

timeout /t 2 /nobreak >nul

:: 3. Khoi dong Next.js Redesign Frontend (Cong 3000)
echo [3/3] Dang khoi dong Next.js Arena Redesign Frontend (Cong 3000)...
start "Next.js Arena UI (3000)" cmd /k "cd frontend && npm run dev"

timeout /t 3 /nobreak >nul

:: 4. Tu dong mo trinh duyet
echo.
echo =====================================================================
echo   DA KHOI DONG THANH CONG!
echo   - Giao dien nguoi dung: http://localhost:3000
echo   - Go Backend Gateway:   http://127.0.0.1:8080
echo   - Tai khoan Admin BTC: admin, mat khau tu ADMIN_PASSWORD
echo =====================================================================
echo.
echo Dang tu dong mo trinh duyet...
start http://localhost:3000

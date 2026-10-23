@echo off
chcp 65001 >nul
title OTTV2 AI Arena - He Thong Redesign Next.js 2026
color 0B

echo ============================================================
echo   DAU TRUONG BOT ARENA K69 - GIAO DIEN NEXT.JS REDESIGN
echo ============================================================
echo.
echo [1/2] Dang kiem tra thu muc giao dien arena-ottv-2-redesign...
cd arena-ottv-2-redesign

echo [2/2] Dang khoi dong Next.js Server (Cong 3000)...
echo ============================================================
echo   Ung dung se mo tai: http://localhost:3000
echo   Ket noi API Gateway: http://127.0.0.1:8080 / sslip.io
echo ============================================================
echo.

npm run dev

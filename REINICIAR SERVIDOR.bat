@echo off
title Futuro Antioquia - Reiniciando en Puerto 3000
color 0A
echo.
echo  ============================================
echo   CERRANDO servidores anteriores...
echo  ============================================
taskkill /F /IM node.exe /T 2>nul
echo   Listo. Esperando 3 segundos...
timeout /t 3 /nobreak >nul
echo.
echo  ============================================
echo   INICIANDO en http://localhost:3000
echo  ============================================
echo.
cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100\frontend"
npm run dev
pause

@echo off
title Futuro Antioquia - Iniciando app
echo.
echo ====================================
echo  FUTURO ANTIOQUIA - Iniciando app
echo ====================================
echo.
cd /d "%~dp0frontend"

echo [1/2] Instalando dependencias (puede tardar 1-2 minutos)...
call npm install

echo.
echo [2/2] Iniciando servidor...
echo.
echo  Cuando veas "Local: http://localhost:3000"
echo  abre el navegador en: http://localhost:3000/login
echo.
call npm run dev
pause

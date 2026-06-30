@echo off
title Futuro Antioquia - Instalando...
echo.
echo ====================================
echo  FUTURO ANTIOQUIA - Iniciando app
echo ====================================
echo.
cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100\frontend"

echo [1/2] Instalando dependencias (puede tardar 1-2 minutos)...
call npm install

echo.
echo [2/2] Iniciando servidor...
echo.
echo  Cuando veas "Local: http://localhost:3000"
echo  abre Chrome y ve a: http://localhost:3000
echo.
call npm run dev
pause

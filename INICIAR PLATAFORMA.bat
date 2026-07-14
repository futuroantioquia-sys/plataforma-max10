@echo off
title Futuro Antioquia - Servidor
color 0A
echo.
echo  ============================================
echo   FUTURO ANTIOQUIA - Iniciando plataforma...
echo  ============================================
echo.
echo  Espera unos segundos...
echo  Cuando veas "Ready on http://localhost:3000"
echo  abre Chrome y entra a: http://localhost:3000
echo.
echo  NO CIERRES ESTA VENTANA mientras uses la plataforma.
echo  ============================================
echo.
cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100\frontend"
npm run dev
pause

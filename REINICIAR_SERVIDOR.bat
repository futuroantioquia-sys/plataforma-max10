@echo off
title Reiniciar Plataforma MAX 10 SPORT
color 0A
echo.
echo ================================================
echo   REINICIANDO PLATAFORMA MAX 10 SPORT
echo ================================================
echo.
echo [1/3] Deteniendo servidor anterior...
taskkill /f /im node.exe 2>nul
timeout /t 2 /nobreak >nul
echo.
echo [2/3] Borrando cache corrupto (.next)...
if exist "C:\Users\Lenovo\Claude\Projects\Plataforma max 100\frontend\.next" (
    rmdir /s /q "C:\Users\Lenovo\Claude\Projects\Plataforma max 100\frontend\.next"
    echo     Cache borrado correctamente!
) else (
    echo     No habia cache previo.
)
echo.
echo [3/3] Iniciando servidor...
echo     Espera unos segundos y luego abre: http://localhost:3000
echo.
cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100\frontend"
npm run dev

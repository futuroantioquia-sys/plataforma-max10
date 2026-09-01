@echo off
chcp 65001 >nul
title 1 - PRENDER MI PLATAFORMA - Futuro Antioquia
color 0A
cd /d "%~dp0.."

echo ============================================================
echo    PRENDIENDO SU PLATAFORMA LOCAL
echo ============================================================
echo.
echo    1) NO cierre esta ventana mientras use la pagina.
echo    2) Espere a que aparezca la palabra:  Ready
echo    3) Recien ahi abra en el navegador:
echo          http://localhost:3000/login
echo.
echo ============================================================
echo.

where npm >nul 2>&1
if errorlevel 1 (
  echo  *** No se encontro "npm". Node.js no esta instalado. ***
  echo      Instalelo desde https://nodejs.org y vuelva a intentar.
  echo.
  pause
  exit /b 1
)

cd frontend
if not exist "node_modules" (
  echo Instalando por primera vez, espere 1 o 2 minutos...
  call npm install
)

echo Iniciando servidor... (esto NO se cierra solo)
echo.
call npm run dev

echo.
echo ============================================================
echo    El servidor se detuvo. Si arriba hay un error en rojo,
echo    tome una foto y mandesela a Claude por el chat.
echo ============================================================
echo.
pause

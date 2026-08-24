@echo off
title Futuro Antioquia - Servidor Local
color 0A
cd /d "%~dp0frontend"

echo ============================================================
echo    FUTURO ANTIOQUIA - Prendiendo el servidor local
echo ============================================================
echo.
echo    1) NO cierres esta ventana mientras uses la pagina.
echo    2) Espera a que aparezca la palabra:  Ready
echo    3) Recien ahi abre en el navegador:
echo          http://localhost:3000/login
echo.
echo    (Todo lo que pase queda guardado en servidor-log.txt
echo     para que Claude pueda revisarlo si algo falla.)
echo ============================================================
echo.

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] No se encontro "npm". Node.js no esta instalado o no esta en el PATH.
  echo         Instala Node.js LTS desde https://nodejs.org y vuelve a intentar.
  echo No se encontro npm - Node.js no instalado > "..\servidor-log.txt"
  echo.
  pause
  exit /b
)

if not exist "node_modules" (
  echo Instalando dependencias por primera vez, espera 1-2 minutos...
  call npm install
)

echo Iniciando servidor... (esto NO se cierra solo)
echo.
call npm run dev > "..\servidor-log.txt" 2>&1

echo.
echo ============================================================
echo    El servidor se detuvo. Si arriba hay un error en rojo,
echo    toma una captura o avisale a Claude: el detalle quedo
echo    guardado en servidor-log.txt
echo ============================================================
pause

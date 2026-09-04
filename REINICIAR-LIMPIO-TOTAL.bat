@echo off
title Futuro Antioquia - Reinicio LIMPIO del servidor local
color 0E

REM ============================================================
REM  CORREGIDO EL 04/09/2026 (direccion).
REM
REM  Este archivo tenia escrita una carpeta que NO EXISTE en este
REM  computador:  C:\Users\Lenovo\...  (era la del computador viejo).
REM  Por eso "no mostraba los cambios nuevos": el archivo entraba,
REM  no encontraba la carpeta, y de ahi en adelante borraba y
REM  arrancaba en el sitio equivocado.
REM
REM  Ahora usa %~dp0, que quiere decir "la carpeta donde esta este
REM  mismo archivo". Asi funciona en cualquier computador y aunque
REM  se mueva el proyecto de sitio.
REM ============================================================

cd /d "%~dp0frontend"

if not exist "package.json" (
  echo.
  echo  *** No encontre la carpeta "frontend" al lado de este archivo.
  echo      Deja este .bat dentro de "Plataforma max 100" y vuelve a intentar.
  echo.
  pause
  exit /b 1
)

echo ============================================================
echo    REINICIO LIMPIO
echo.
echo    Apaga el servidor, borra la cache de compilacion (.next)
echo    y arranca desde cero.
echo    Usalo cuando la pagina NO muestra los cambios nuevos.
echo ============================================================
echo.
echo    Carpeta: %CD%
echo.

echo [1/4] Apagando servidores Node abiertos...
taskkill /F /IM node.exe >nul 2>&1
if errorlevel 1 (
  echo       No habia ninguno abierto.
) else (
  echo       Listo.
)
timeout /t 2 /nobreak >nul

echo [2/4] Borrando la cache de compilacion (.next)...
if exist ".next" (
  rmdir /s /q ".next"
  echo       Cache borrada.
) else (
  echo       No habia cache.
)

echo [3/4] Verificando dependencias...
if not exist "node_modules" (
  echo       Instalando por primera vez, espera 1 o 2 minutos...
  call npm install
) else (
  echo       Ya estan instaladas.
)

echo.
echo [4/4] Arrancando el servidor...
echo.
echo    ESPERA a que aparezca la palabra:  Ready
echo    Luego abre:  http://localhost:3000/login
echo    y recarga con Ctrl + Shift + R
echo.
echo    NO cierres esta ventana mientras uses la pagina.
echo ============================================================
echo.

REM  El texto del servidor se ve AQUI en la ventana (antes se iba
REM  a un archivo y uno se quedaba mirando una pantalla muda sin
REM  saber si habia arrancado o si habia reventado). - 04/09/2026
call npm run dev

echo.
echo ============================================================
echo    El servidor se detuvo. Si arriba hay algo en rojo,
echo    tomale una foto y mandamela por el chat.
echo ============================================================
pause

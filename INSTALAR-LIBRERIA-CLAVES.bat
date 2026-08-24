@echo off
chcp 65001 >nul
title Instalar libreria de claves (bcryptjs)
echo.
echo ==========================================================
echo   INSTALANDO LA LIBRERIA QUE LEE LAS CLAVES CIFRADAS
echo   (se hace UNA sola vez, necesita internet)
echo ==========================================================
echo.
cd /d "%~dp0frontend"
call npm install
echo.
if errorlevel 1 (
  echo *** HUBO UN ERROR. Mande este pantallazo. ***
) else (
  echo LISTO. Ahora abra PRENDER-LOCAL.bat y pruebe el ingreso de un profe.
)
echo.
pause

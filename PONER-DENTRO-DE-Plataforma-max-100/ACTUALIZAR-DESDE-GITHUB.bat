@echo off
title Futuro Antioquia - Actualizar desde GitHub
color 0B
cd /d "%~dp0"

echo ============================================================
echo    TRAER LOS ULTIMOS CAMBIOS DESDE GITHUB
echo ============================================================
echo.
echo  Carpeta: %~dp0
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo  *** No se encontro Git. Instalelo en https://git-scm.com/download/win
  pause
  exit /b 1
)

git pull origin main
if errorlevel 1 (
  echo.
  echo  *** No se pudo actualizar. ***
  echo  Puede ser que tenga cambios sin subir en este computador.
  echo  Suba primero con push2.vbs y vuelva a intentar.
  echo.
  pause
  exit /b 1
)

echo.
echo  Actualizando dependencias...
cd /d "%~dp0frontend"
call npm install

echo.
echo ============================================================
echo    LISTO. Ya tiene la ultima version.
echo ============================================================
pause

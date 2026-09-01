@echo off
chcp 65001 >nul
title 3 - RESPALDAR LA BASE - Futuro Antioquia
color 0A
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo  *** No se encontro Node.js. No se puede hacer el respaldo. ***
  pause
  exit /b 1
)

echo ============================================================
echo    RESPALDANDO LA BASE DE DATOS
echo    Puede tardar varios minutos. NO cierre esta ventana.
echo ============================================================
echo.

node respaldo.js
set CODIGO=%errorlevel%

echo.
if "%CODIGO%"=="0" (
  echo  ============================================================
  echo    RESPALDO COMPLETO. Todo quedo guardado.
  echo  ============================================================
) else (
  echo  ============================================================
  echo    *** OJO: el respaldo quedo INCOMPLETO ***
  echo    Revise el detalle en:  ULTIMO-RESPALDO.txt
  echo  ============================================================
)
echo.
pause

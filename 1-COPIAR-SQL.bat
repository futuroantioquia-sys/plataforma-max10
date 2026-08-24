@echo off
chcp 65001 >nul
title PASO 1 - Copiar el SQL
color 0E
setlocal

set "SQL=%~dp0MICROCICLO-TABLAS.sql"

cls
echo.
echo  ============================================================
echo     PASO 1  ·  COPIAR EL SQL DEL MICROCICLO
echo  ============================================================
echo.

if not exist "%SQL%" (
  echo  [ERROR] No encuentro MICROCICLO-TABLAS.sql
  echo.
  pause
  exit /b 1
)

type "%SQL%" | clip

echo  Verificando que si haya quedado copiado...
echo.
echo  --- ESTO ES LO QUE QUEDO EN EL PORTAPAPELES ---
echo.
powershell -NoProfile -Command "$t = Get-Clipboard -Raw; if ($t) { ($t -split \"`n\" | Select-Object -First 3) -join \"`n\" } else { 'VACIO' }"
echo.
echo  -----------------------------------------------
echo.
echo  Si arriba ves lineas que hablan de MICROCICLO o
echo  que dicen  create table  ...  QUEDO BIEN.
echo.
echo  Si ves otra cosa (npm, cd, o VACIO), avisale a Claude.
echo.
echo  ============================================================
echo    NO COPIES NADA MAS hasta que hayas pegado en Supabase.
echo  ============================================================
echo.
pause

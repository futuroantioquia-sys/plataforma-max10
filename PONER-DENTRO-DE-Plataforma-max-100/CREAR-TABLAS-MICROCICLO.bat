@echo off
chcp 65001 >nul
title MICROCICLO - Crear tablas en Supabase
color 0D
setlocal

set "SQL=%~dp0MICROCICLO-TABLAS.sql"
set "URL=https://supabase.com/dashboard/project/fykdyalpuydkwfjqguip/sql/new"

echo.
echo  ============================================================
echo    MICROCICLO DE ENTRENAMIENTO - Crear tablas en Supabase
echo  ============================================================
echo.

if not exist "%SQL%" (
  echo  [ERROR] No encuentro MICROCICLO-TABLAS.sql en esta carpeta:
  echo          %~dp0
  echo.
  pause
  exit /b 1
)

echo  1/2  Copiando el SQL al portapapeles...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -Raw -Encoding UTF8 '%SQL%' | Set-Clipboard"
echo       Listo.
echo.

echo  2/2  Abriendo Supabase EN GOOGLE CHROME...

set "CHROME="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if defined CHROME (
  start "" "%CHROME%" --new-tab "%URL%"
  echo       Se abrio una pestana nueva en Chrome.
) else (
  start "" "%URL%"
  echo       No encontre Chrome; se abrio en el navegador predeterminado.
)

echo.
echo  ------------------------------------------------------------
echo   BUSCA LA PESTANA DE SUPABASE  (SQL Editor)
echo.
echo   Si no la ves, copia y pega esta direccion en Chrome:
echo.
echo   %URL%
echo.
echo   YA EN ESA PAGINA:
echo     1. Si pide entrar:  "Continue with GitHub"
echo     2. Clic dentro del recuadro grande del editor
echo     3. Pega con   Ctrl + V     (el SQL ya esta copiado)
echo     4. Oprime  RUN   (boton verde abajo a la derecha, o Ctrl+Enter)
echo.
echo   Debe responder:  Success. No rows returned
echo  ------------------------------------------------------------
echo.
echo   Luego vuelve a  localhost:3000/microciclo  y refresca (F5).
echo   El aviso rojo debe desaparecer.
echo.
pause

@echo off
chcp 65001 >nul
title BORRAR TODAS LAS VALORACIONES
color 0C
setlocal

set "SQL=%~dp0BORRAR-CALIFICACIONES.sql"
set "PROYECTO=fykdyalpuydkwfjqguip"

cls
echo.
echo  ============================================================
echo     BORRAR TODAS LAS VALORACIONES  (empezar de cero)
echo  ============================================================
echo.
echo   OJO: esto deja en cero TODAS las notas de los deportistas.
echo   El SQL guarda un respaldo antes de borrar, pero aun asi
echo   solo hazlo si estas seguro.
echo.
set /p "OK=  Escribe  SI  y oprime Enter para continuar: "
if /I not "%OK%"=="SI" (
  echo.
  echo  Cancelado. No se borro nada.
  echo.
  pause
  exit /b 0
)

echo.
if not exist "%SQL%" (
  echo  [ERROR] No encuentro BORRAR-CALIFICACIONES.sql
  echo.
  pause
  exit /b 1
)

echo  [1 de 3]  Copiando el SQL...
type "%SQL%" | clip
powershell -NoProfile -Command "$t = Get-Clipboard -Raw; if ($t -and $t.Length -gt 200) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo.
  echo  [ERROR] No quedo copiado. Vuelve a dar doble clic.
  echo.
  pause
  exit /b 1
)
echo            Listo, quedo copiado.
echo.

echo  [2 de 3]  Abriendo Supabase en el proyecto CORRECTO...
start "" "https://supabase.com/dashboard/project/%PROYECTO%/sql/new"
echo.

echo  ============================================================
echo     [3 de 3]  AHORA, EN EL NAVEGADOR:
echo  ============================================================
echo.
echo     1. Un CLIC en el area grande y vacia del centro.
echo     2. Ctrl  +  V        (aparece un texto largo)
echo     3. Ctrl  +  Enter    (lo ejecuta)
echo.
echo  ------------------------------------------------------------
echo     COMO SABER SI FUNCIONO:
echo  ------------------------------------------------------------
echo.
echo     Abajo aparece una tablita con dos filas y la columna
echo     "quedan" debe decir  0  en las dos.
echo.
echo     Arriba a la izquierda debe decir el proyecto:
echo     %PROYECTO%
echo.
echo  ============================================================
echo.
pause

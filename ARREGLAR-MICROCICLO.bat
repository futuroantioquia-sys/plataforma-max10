@echo off
chcp 65001 >nul
title ARREGLAR MICROCICLO - automatico
color 0A
setlocal

set "SQL=%~dp0MICROCICLO-TABLAS.sql"
set "PROYECTO=fykdyalpuydkwfjqguip"

cls
echo.
echo  ============================================================
echo     ARREGLAR EL MICROCICLO  ·  MODO AUTOMATICO
echo  ============================================================
echo.
echo   Este archivo hace TODO solo. Usted no toca nada.
echo.
echo   ANTES DE EMPEZAR, una sola cosa:
echo   asegurese de estar con la sesion abierta en Supabase.
echo   (si no, se abrira la pantalla de ingreso y no funcionara)
echo.
pause

if not exist "%SQL%" (
  echo.
  echo  [ERROR] No encuentro MICROCICLO-TABLAS.sql
  pause
  exit /b 1
)

cls
echo.
echo  [1/4] Copiando el SQL...
type "%SQL%" | clip
powershell -NoProfile -Command "$t = Get-Clipboard -Raw; if ($t -and $t.Length -gt 200) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo        [ERROR] No quedo copiado. Avisele a Claude.
  pause
  exit /b 1
)
echo        Listo.
echo.

echo  [2/4] Abriendo Supabase en el proyecto correcto...
start "" "https://supabase.com/dashboard/project/%PROYECTO%/sql/new"
echo.

echo  [3/4] Esperando a que cargue la pagina.
echo.
echo        *** NO MUEVA EL MOUSE NI TOQUE EL TECLADO ***
echo.
for /L %%i in (18,-1,1) do (
  <nul set /p "=  Faltan %%i segundos...  "
  ping -n 2 127.0.0.1 >nul
  echo.
)
echo.

echo  [4/4] Pegando y ejecutando...
powershell -NoProfile -Command ^
  "$w = New-Object -ComObject WScript.Shell;" ^
  "Start-Sleep -Milliseconds 800;" ^
  "$w.SendKeys('^%%{TAB}');" ^
  "Start-Sleep -Milliseconds 500;" ^
  "$w.SendKeys('^v');" ^
  "Start-Sleep -Seconds 3;" ^
  "$w.SendKeys('^{ENTER}');"

echo.
echo  ============================================================
echo     REVISE EL NAVEGADOR
echo  ============================================================
echo.
echo   Abajo de la pantalla debe salir una tablita con TRES filas:
echo.
echo          componentes
echo          escenario
echo          hora
echo.
echo   SI SALEN LAS TRES  -^>  Listo. Vuelva a la plataforma y
echo                          oprima F5. Ya quedo.
echo.
echo   SI NO PASO NADA    -^>  Haga UN clic en el area grande del
echo                          centro y oprima:
echo                             Ctrl + V        y despues
echo                             Ctrl + Enter
echo.
echo   SI SIGUE SIN SALIR -^>  Avisele a Claude. Hay un plan B que
echo                          no necesita tocar Supabase.
echo.
echo  ============================================================
echo.
pause

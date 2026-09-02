@echo off
chcp 65001 >nul
title 2 - PUBLICAR EN INTERNET - Futuro Antioquia
color 0A
cd /d "%~dp0.."

echo ============================================================
echo    PUBLICAR LA PLATAFORMA EN INTERNET
echo    Carpeta: %CD%
echo ============================================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo  *** No se encontro GIT en este computador. ***
  echo      Instalelo desde https://git-scm.com y vuelva a intentar.
  echo.
  pause
  exit /b 1
)

git config user.name "Futuro Antioquia"
git config user.email "futuroantioquia-sys@users.noreply.github.com"

echo --- 1. LO QUE ESTA SIN SUBIR -----------------------------
git status --short
echo.

echo --- 2. GUARDANDO LOS CAMBIOS -----------------------------
git add -A
git commit -m "Cambios del %DATE% %TIME%"
if errorlevel 1 echo    (No habia nada nuevo; se publica lo ultimo que exista)
echo.

REM ============================================================
REM  PASO NUEVO (02/09/2026)
REM  ------------------------------------------------------------
REM  El 02/09 la publicacion se rechazo con este mensaje:
REM     "Updates were rejected because the remote contains work
REM      that you do not have locally"
REM
REM  Traduccion: en GitHub habia cambios que este computador no
REM  tenia. Git no deja escribir encima de algo que no conoce,
REM  y hace bien: asi nadie borra el trabajo de otro sin darse
REM  cuenta.
REM
REM  Este paso baja primero lo que haya alla y le pone lo de aqui
REM  encima. Si los dos tocaron la MISMA linea del MISMO archivo,
REM  git no puede decidir solo: entonces se deshace la mezcla,
REM  se deja la carpeta como estaba y se avisa. Nunca queda a
REM  medias.
REM ============================================================
echo --- 3. TRAYENDO LO QUE HAYA EN GITHUB ---------------------
echo    (por si alguien mas publico algo)
git pull --rebase origin main
if errorlevel 1 (
  echo.
  echo    Se deshace la mezcla para no dejar nada a medias...
  git rebase --abort
  echo.
  echo ============================================================
  echo    *** HAY UN CHOQUE DE CAMBIOS ***
  echo.
  echo    Lo que esta en GitHub y lo que esta en este computador
  echo    tocaron lo mismo, y git no puede decidir cual vale.
  echo.
  echo    NO SE PERDIO NADA. Su carpeta quedo como estaba.
  echo    Tome una foto de esta ventana COMPLETA y mandemela.
  echo ============================================================
  echo.
  pause
  exit /b 1
)
echo.

echo --- 4. SUBIENDO A GITHUB ---------------------------------
echo    Si le pide usuario y contrasena, escribalos aqui mismo.
echo    La contrasena NO se ve mientras la escribe: eso es normal.
echo.
git push origin HEAD:main
if errorlevel 1 (
  echo.
  echo ============================================================
  echo    *** NO SE PUDO SUBIR ***
  echo    Tome una foto de esta ventana COMPLETA y mandemela.
  echo ============================================================
  echo.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo    LISTO. Los cambios ya estan en GitHub.
echo    Vercel los publica solo en 1 o 2 minutos.
echo.
echo    Despues entre a:
echo       https://plataforma-max10.vercel.app
echo    y oprima Ctrl+F5 para que cargue lo nuevo.
echo ============================================================
echo.
pause

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

echo --- 3. SUBIENDO A GITHUB ---------------------------------
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

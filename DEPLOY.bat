@echo off
chcp 65001 >nul
title DEPLOY — Plataforma MAX 10 SPORT
color 0A

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║   DEPLOY — Plataforma Futuro Antioquia MAX 10 SPORT  ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100"

:: ─── Token de GitHub ─────────────────────────────────────────
if "%GH_TOKEN%"=="" (
  set /p GH_TOKEN="Pega tu token de GitHub y presiona Enter: "
)

if "%GH_TOKEN%"=="" (
  echo ERROR: Se necesita un token de GitHub.
  echo Obtenerlo en: https://github.com/settings/tokens
  pause
  exit /b 1
)

echo.
echo [1/2] Subiendo codigo a GitHub (ramas: main + principal)...
node push-github.js %GH_TOKEN%

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo ERROR al subir a GitHub. Verifica que el token sea valido.
  pause
  exit /b 1
)

echo.
echo [2/2] Vercel detectara el push y redesplegara automaticamente.
echo.
echo  ─────────────────────────────────────────────────────────
echo   Espera 2 minutos y luego verifica en:
echo   https://plataforma-max10.vercel.app/mis-proyectos
echo.
echo   Si en 5 min sigue igual, ve a vercel.com/dashboard
echo   y haz clic en "Redeploy" en el ultimo deployment.
echo  ─────────────────────────────────────────────────────────
echo.

pause

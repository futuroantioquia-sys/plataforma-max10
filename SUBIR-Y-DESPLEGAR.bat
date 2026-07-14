@echo off
chcp 65001 >nul
title SUBIR A GITHUB + DESPLEGAR EN VERCEL
color 0A

echo.
echo  ==========================================
echo     PLATAFORMA MAX 10 SPORT
echo     Subir a GitHub + Desplegar en Vercel
echo  ==========================================
echo.

cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100"

if "%GH_TOKEN%"=="" (
  echo ERROR: Define la variable de entorno GH_TOKEN con tu token de GitHub antes de ejecutar este script.
  echo   set GH_TOKEN=tu_token_aqui
  pause
  exit /b 1
)
if "%VERCEL_TOKEN%"=="" (
  echo ERROR: Define la variable de entorno VERCEL_TOKEN con tu token de Vercel antes de ejecutar este script.
  echo   set VERCEL_TOKEN=tu_token_aqui
  pause
  exit /b 1
)

:: ── PASO 1: Subir a GitHub ─────────────────────────────────────
echo [1/3] Subiendo codigo a GitHub...
node push-github.js %GH_TOKEN%
if %ERRORLEVEL% NEQ 0 (
    echo ERROR al subir a GitHub.
    pause
    exit /b 1
)
echo    GitHub OK!

:: ── PASO 2: Crear proyecto + env vars en Vercel API ────────────
echo.
echo [2/3] Configurando proyecto en Vercel...
node deploy-vercel.js %VERCEL_TOKEN%
if %ERRORLEVEL% NEQ 0 (
    echo ERROR al configurar Vercel.
    pause
    exit /b 1
)

:: ── PASO 3: Desplegar via Vercel CLI ───────────────────────────
echo.
echo [3/3] Desplegando en produccion...
:: Correr desde la raiz: Vercel usa rootDirectory=frontend internamente
call vercel --prod --yes --token=%VERCEL_TOKEN%

echo.
if %ERRORLEVEL% EQU 0 (
    echo  ==========================================
    echo     LISTO - Plataforma en produccion!
    echo  ==========================================
) else (
    echo  Hubo un problema en el despliegue.
    echo  Revisa el output de Vercel arriba.
)
echo.
pause

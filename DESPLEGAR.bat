@echo off
chcp 65001 >nul
title DESPLEGAR PLATAFORMA MAX 10 SPORT
color 0A

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   PLATAFORMA MAX 10 SPORT - DESPLIEGUE  ║
echo  ╚══════════════════════════════════════════╝
echo.

cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100"

:: ─── PASO 1: Verificar / Instalar Git ─────────────────────────
echo [1/4] Verificando Git...
git --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo      Git no encontrado. Instalando via winget...
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
    echo.
    echo      Git instalado. Reiniciando script con Git disponible...
    start "" cmd /c ""%~f0""
    exit /b
)
echo      Git OK - %DATE% %TIME%

:: ─── PASO 2: Subir a GitHub ────────────────────────────────────
echo.
echo [2/4] Subiendo codigo a GitHub...
echo      Repo: https://github.com/futuroantioquia-sys/plataforma-max10
echo.

git init >nul 2>&1

git add .
echo      Archivos agregados.

git commit -m "Plataforma MAX 10 SPORT - %DATE%" 2>nul
if %ERRORLEVEL% NEQ 0 (
    :: Si ya hay commits previos, hacer un commit de actualizacion
    git commit --allow-empty -m "Actualizacion plataforma - %DATE%"
)
echo      Commit creado.

git branch -M main >nul 2>&1
git remote remove origin >nul 2>&1
git remote add origin https://github.com/futuroantioquia-sys/plataforma-max10.git
echo      Remote configurado.

echo.
echo      IMPORTANTE: Se abrira el navegador para autenticarte en GitHub.
echo      Inicia sesion con la cuenta futuroantioquia-sys
echo.
git push -u origin main
if %ERRORLEVEL% EQU 0 (
    echo      [OK] Codigo subido a GitHub exitosamente!
) else (
    echo      [ERROR] Error al subir. Verifica la autenticacion.
    pause
    exit /b 1
)

:: ─── PASO 3: Instalar Vercel CLI ───────────────────────────────
echo.
echo [3/4] Instalando Vercel CLI...
npm install -g vercel >nul 2>&1
echo      Vercel CLI instalado.

:: ─── PASO 4: Desplegar en Vercel ──────────────────────────────
echo.
echo [4/4] Desplegando en Vercel...
echo      Se abrira el navegador para autenticarte en Vercel.
echo      Inicia sesion y sigue las instrucciones.
echo.

cd frontend

vercel --prod --yes --name plataforma-max10

:: ─── FIN ───────────────────────────────────────────────────────
echo.
echo  ╔══════════════════════════════════════════╗
if %ERRORLEVEL% EQU 0 (
    echo  ║   LISTO - Plataforma desplegada en vivo! ║
) else (
    echo  ║   Revisa los errores arriba             ║
)
echo  ╚══════════════════════════════════════════╝
echo.
pause

@echo off
chcp 65001 >nul
title Futuro Antioquia - Publicar en Vercel
color 0A
cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100"

where git >nul 2>nul
if errorlevel 1 (
  echo No se encontro GIT en este equipo.
  echo Escribeme por el chat y te ayudo a solucionarlo.
  echo.
  pause
  exit /b 1
)

echo ==========================================================
echo    PUBLICANDO CAMBIOS EN VERCEL
echo    (se suben a GitHub y Vercel despliega solo)
echo ==========================================================
echo.

echo [1/3] Preparando cambios...
git add -A

echo [2/3] Guardando la nueva version...
git commit -m "Actualizacion desde Cowork %date% %time%"
if errorlevel 1 echo    (No habia cambios nuevos; se publicara lo ultimo que exista)

echo.
echo [3/3] Subiendo a GitHub...
echo    Si aparece una ventana de GitHub, elige la cuenta "futuroantioquia-sys".
echo.
git push origin HEAD:main
if errorlevel 1 (
  echo.
  echo ==========================================================
  echo    NO se pudo subir. Toma una captura de esta ventana
  echo    completa y enviamela por el chat para ayudarte.
  echo ==========================================================
  echo.
  pause
  exit /b 1
)

echo.
echo ==========================================================
echo    LISTO! Cambios enviados a GitHub.
echo    Vercel esta desplegando; en 1-2 minutos estara en linea.
echo ==========================================================
echo.
pause

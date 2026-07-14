@echo off
title Subiendo plataforma a GitHub...
cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100"
echo.
echo === SUBIENDO CAMBIOS A GITHUB ===
echo.
git add -A
git commit -m "Fix: boton volver en todas las paginas"
echo.
echo Subiendo a GitHub...
git push origin principal
if %ERRORLEVEL% NEQ 0 (
  git push origin main
)
echo.
if %ERRORLEVEL% EQU 0 (
  echo =====================================================
  echo  LISTO! Codigo subido. Vercel despliega en 2 min.
  echo  URL: https://plataforma-max10.vercel.app
  echo =====================================================
) else (
  echo.
  echo NO SE PUDO SUBIR - Necesitas un token de GitHub.
  echo Ve a: github.com/settings/tokens/new
  echo Marca "repo" y crea el token, luego ejecuta SUBIR_CON_TOKEN.bat
)
echo.
pause

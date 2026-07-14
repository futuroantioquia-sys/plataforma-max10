@echo off
cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100"
if "%GH_TOKEN%"=="" (
  echo ERROR: Define la variable de entorno GH_TOKEN con tu token de GitHub antes de ejecutar este script.
  echo   set GH_TOKEN=tu_token_aqui
  pause
  exit /b 1
)
echo Subiendo cambios a GitHub...
node push-github.js %GH_TOKEN%
echo.
echo Listo! Vercel detectara el push y desplegara automaticamente.
pause

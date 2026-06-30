@echo off
echo =============================================
echo   SUBIENDO PLATAFORMA MAX 10 A GITHUB
echo =============================================
echo.

cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100"

echo [1/6] Iniciando repositorio Git...
git init

echo.
echo [2/6] Agregando todos los archivos...
git add .

echo.
echo [3/6] Creando primer commit...
git commit -m "Plataforma MAX 10 SPORT - primer commit"

echo.
echo [4/6] Configurando rama main...
git branch -M main

echo.
echo [5/6] Conectando con GitHub...
git remote remove origin 2>nul
git remote add origin https://github.com/futuroantioquia-sys/plataforma-max10.git

echo.
echo [6/6] Subiendo al repositorio...
echo (Se abrira una ventana para iniciar sesion en GitHub)
git push -u origin main

echo.
echo =============================================
if %ERRORLEVEL% EQU 0 (
  echo   LISTO - Codigo subido exitosamente!
) else (
  echo   Hubo un error. Revisa que iniciaste sesion.
)
echo =============================================
pause

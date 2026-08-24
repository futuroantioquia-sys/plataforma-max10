@echo off
chcp 65001 >nul
title PUBLICAR CON REGISTRO - FUTURO ANTIOQUIA
set RAIZ=C:\Users\Lenovo\Claude\Projects\Plataforma max 100
set LOG=%RAIZ%\deploy-log.txt
echo.
echo  ============================================================
echo    PUBLICAR LA PLATAFORMA - CON REGISTRO DE LO QUE PASA
echo  ============================================================
echo.
echo  Todo lo que ocurra queda guardado en:
echo    deploy-log.txt
echo.

cd /d "%RAIZ%\frontend"
if errorlevel 1 (
  echo  *** No se encontro la carpeta frontend ***
  pause
  exit /b
)

echo ===== PUBLICACION %DATE% %TIME% ===== > "%LOG%"
echo Carpeta: %CD% >> "%LOG%"

where vercel >> "%LOG%" 2>&1
if errorlevel 1 (
  echo  *** No se encontro el comando "vercel" ***
  echo NO SE ENCONTRO VERCEL >> "%LOG%"
  echo  Instalelo con:  npm install -g vercel
  pause
  exit /b
)

echo  Publicando... NO CIERRE ESTA VENTANA (3 a 5 minutos).
echo.

vercel --prod --yes >> "%LOG%" 2>&1
set CODIGO=%errorlevel%

echo ===== CODIGO DE SALIDA: %CODIGO% ===== >> "%LOG%"

echo.
echo  ------------ LO QUE RESPONDIO VERCEL ------------
type "%LOG%"
echo  -------------------------------------------------
echo.
if "%CODIGO%"=="0" (
  echo  PUBLICACION TERMINADA. Abra la pagina con Ctrl+F5.
) else (
  echo  *** LA PUBLICACION FALLO. Codigo %CODIGO% ***
  echo  El detalle quedo en deploy-log.txt
)
echo.
pause

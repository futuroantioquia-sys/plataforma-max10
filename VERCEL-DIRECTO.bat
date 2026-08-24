@echo off
chcp 65001 >nul
title PUBLICAR EN VERCEL - FUTURO ANTIOQUIA
set RAIZ=C:\Users\Lenovo\Claude\Projects\Plataforma max 100
set LOG=%RAIZ%\deploy-log.txt
echo.
echo  ============================================================
echo    PUBLICAR LA PLATAFORMA EN INTERNET
echo  ============================================================
echo.

REM OJO: se publica desde la carpeta DE ARRIBA, no desde "frontend".
REM El proyecto en Vercel ya tiene configurado que su raiz es la subcarpeta
REM "frontend"; si uno entra a frontend y publica desde ahi, Vercel busca
REM "frontend\frontend", no la encuentra y la publicacion falla.
cd /d "%RAIZ%"
echo  Carpeta: %CD%
echo.

where vercel >nul 2>nul
if errorlevel 1 (
  echo  *** No se encontro el comando "vercel". ***
  echo  Instalelo con:  npm install -g vercel
  echo.
  pause
  exit /b
)

echo  Publicando... tarda entre 3 y 5 minutos.
echo  NO CIERRE ESTA VENTANA.
echo.

echo ===== PUBLICACION %DATE% %TIME% ===== > "%LOG%"
echo Carpeta: %CD% >> "%LOG%"

vercel --prod --yes >> "%LOG%" 2>&1
set CODIGO=%errorlevel%
echo ===== CODIGO DE SALIDA: %CODIGO% ===== >> "%LOG%"

echo.
echo  ------------ RESPUESTA DE VERCEL ------------
type "%LOG%"
echo  ---------------------------------------------
echo.
if "%CODIGO%"=="0" (
  echo  LISTO. Entre a https://plataforma-max10.vercel.app y haga Ctrl+F5.
) else (
  echo  *** FALLO. Codigo %CODIGO%. El detalle quedo en deploy-log.txt ***
)
echo.
pause

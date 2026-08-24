@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title Configurar seguridad - Futuro Antioquia
color 0A

set "CARPETA=%~dp0"
set "ARCHIVO=%CARPETA%frontend\.env.local"

echo.
echo  ============================================================
echo    CONFIGURAR SEGURIDAD  ·  Futuro Antioquia
echo  ============================================================
echo.
echo    Este programa agrega al archivo de configuracion las
echo    variables que antes estaban escritas dentro del codigo.
echo.
echo    Archivo: frontend\.env.local
echo.

if not exist "%CARPETA%frontend\" (
  echo    [ERROR] No encuentro la carpeta "frontend".
  echo    Deja este archivo dentro de "Plataforma max 100" y vuelve a abrirlo.
  echo.
  pause
  exit /b 1
)

if not exist "%ARCHIVO%" (
  echo    No existia el archivo. Se crea uno nuevo.
  type nul > "%ARCHIVO%"
)

findstr /C:"SESSION_SECRET" "%ARCHIVO%" >nul 2>&1
if %errorlevel%==0 (
  echo    [AVISO] El archivo YA tiene SESSION_SECRET.
  echo    No se toca nada para no dañar lo que ya funciona.
  echo.
  goto FIN
)

echo    Guardando copia de seguridad...
copy /Y "%ARCHIVO%" "%ARCHIVO%.respaldo" >nul 2>&1

echo    Escribiendo las cuatro variables...
(
  echo.
  echo # -- SEGURIDAD ^(agregado el 22/08/2026^) ------------------------------
  echo # Estas cuatro variables salieron del codigo por seguridad.
  echo # Este archivo NO se sube a GitHub. En Vercel hay que ponerlas aparte,
  echo # en Settings ^> Environment Variables, con los MISMOS nombres.
  echo.
  echo # Firma las sesiones. Sin ella nadie puede entrar.
  echo SESSION_SECRET=PwYGlwSOr2lJvuPlTrFKZ0c7kfX8EpyxRkwXQ7eMnQgtHHRwj8WpzjQwQfmOlDwS
  echo.
  echo # Administrador maestro. Para cambiar la clave, cambia el valor de
  echo # ADMIN_PASS, guarda el archivo y reinicia el servidor.
  echo ADMIN_USER=ADMON
  echo ADMIN_PASS=34
  echo.
  echo # Codigo del formulario de afiliacion.
  echo AFILIACION_CODE=26
) >> "%ARCHIVO%"

echo.
echo    [LISTO] Variables agregadas correctamente.

:FIN
echo.
echo  ------------------------------------------------------------
echo    AHORA HAY QUE REINICIAR EL SERVIDOR para que las lea.
echo  ------------------------------------------------------------
echo.
set /p RESP="   Reinicio el servidor ahora? (S/N): "
if /I "!RESP!"=="S" (
  echo.
  echo    Cerrando el servidor anterior...
  taskkill /F /IM node.exe >nul 2>&1
  timeout /t 2 /nobreak >nul
  echo    Arrancando de nuevo...
  start "Servidor Futuro Antioquia" cmd /k "cd /d "%CARPETA%frontend" && npm run dev"
  timeout /t 6 /nobreak >nul
  start "" "http://localhost:3000/login"
  echo.
  echo    Listo. Entra con  ADMON  /  34
) else (
  echo.
  echo    Recuerda reiniciar con REINICIAR-SERVIDOR.bat antes de probar.
)

echo.
pause

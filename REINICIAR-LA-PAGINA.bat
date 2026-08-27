@echo off
chcp 65001 >nul
title REINICIAR LA PAGINA - Futuro Antioquia
color 0A
mode con: cols=76 lines=34

REM ---------------------------------------------------------------
REM  POR QUE SE REHIZO (27/08/2026)
REM
REM  El anterior (REINICIAR-LIMPIO.bat) apuntaba a la carpeta
REM  C:\Users\Lenovo\... que es la del computador VIEJO. En este
REM  computador esa carpeta no existe, asi que:
REM    - no borraba el cache (el error se tapaba con 2>nul)
REM    - no entraba a la carpeta del proyecto
REM  Resultado: el servidor viejo seguia vivo y la pagina seguia
REM  mostrando la version de antes. Por eso los cambios "no se veian".
REM
REM  Este usa %~dp0, que quiere decir "la carpeta donde esta este
REM  mismo archivo". Asi funciona en cualquier computador y aunque
REM  se mueva la carpeta de sitio. Y si algo falla, LO DICE.
REM ---------------------------------------------------------------

cd /d "%~dp0"
set "RAIZ=%~dp0"
set "WEB=%~dp0frontend"

echo.
echo  ============================================================
echo    REINICIAR LA PAGINA
echo  ============================================================
echo.
echo  Carpeta: %RAIZ%
echo.

if not exist "%WEB%\package.json" (
  echo  [ERROR] No encuentro la carpeta "frontend" aqui al lado.
  echo.
  echo  Este archivo tiene que quedar en la carpeta principal del
  echo  proyecto, la misma donde esta la carpeta "frontend".
  echo.
  pause
  exit /b 1
)

echo  --- 1. Apagando el servidor que este corriendo -------------
taskkill /F /IM node.exe /T >nul 2>&1
if errorlevel 1 (echo      No habia ninguno prendido.) else (echo      Apagado.)
timeout /t 3 /nobreak >nul

echo.
echo  --- 2. Borrando el cache ------------------------------------
if exist "%WEB%\.next" (
  rd /s /q "%WEB%\.next"
  if exist "%WEB%\.next" (
    echo      [OJO] No se pudo borrar del todo.
    echo      Cierre las ventanas negras que tenga abiertas y
    echo      vuelva a correr este archivo.
  ) else (
    echo      Cache borrado.
  )
) else (
  echo      No habia cache. Bien.
)

echo.
echo  --- 3. Prendiendo el servidor -------------------------------
cd /d "%WEB%"
start "Servidor Futuro Antioquia" cmd /k npm run dev
echo      Se abrio una ventana negra: esa es el servidor.
echo      NO la cierre mientras use la plataforma.

echo.
echo  --- 4. Esperando a que conteste -----------------------------
set /a INTENTOS=0
:ESPERAR
set /a INTENTOS+=1
timeout /t 2 /nobreak >nul
powershell -NoProfile -Command "try{ $r=Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing -TimeoutSec 3; exit 0 }catch{ exit 1 }" >nul 2>&1
if not errorlevel 1 goto LISTO
if %INTENTOS% LSS 30 (
  echo      Todavia arrancando... ^(%INTENTOS%^)
  goto ESPERAR
)

echo.
echo  [OJO] El servidor no contesto en un minuto.
echo  Mire la ventana negra: ahi debe decir cual fue el error.
echo  Tome un pantallazo de esa ventana y enviemelo.
echo.
pause
exit /b 1

:LISTO
echo      Contesto. Abriendo la plataforma...
start http://localhost:3000

echo.
echo  ============================================================
echo    LISTO
echo.
echo    Si AUN asi ve la pagina como antes, en el navegador
echo    oprima   CTRL + F5   (las dos teclas al tiempo).
echo    Eso obliga al navegador a botar lo que tenia guardado.
echo  ============================================================
echo.
pause

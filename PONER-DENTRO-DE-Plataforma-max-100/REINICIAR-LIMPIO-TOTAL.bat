@echo off
title Futuro Antioquia - Reinicio LIMPIO del servidor local
color 0E
cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100\frontend"

echo ============================================================
echo    REINICIO LIMPIO
echo.
echo    Esto apaga cualquier servidor abierto, borra la cache
echo    de compilacion (.next) y vuelve a arrancar desde cero.
echo    Usalo cuando la pagina no muestra los cambios nuevos.
echo ============================================================
echo.

echo [1/4] Apagando servidores Node abiertos...
taskkill /F /IM node.exe >nul 2>&1
if errorlevel 1 (
  echo       No habia ninguno abierto.
) else (
  echo       Listo.
)
timeout /t 2 /nobreak >nul

echo [2/4] Borrando la cache de compilacion (.next)...
if exist ".next" (
  rmdir /s /q ".next"
  echo       Cache borrada.
) else (
  echo       No habia cache.
)

echo [3/4] Verificando dependencias...
if not exist "node_modules" (
  echo       Instalando por primera vez, espera 1-2 minutos...
  call npm install
) else (
  echo       Ya estan instaladas.
)

echo [4/4] Arrancando el servidor...
echo.
echo    ESPERA a que aparezca la palabra:  Ready
echo    Luego abre en el navegador:  http://localhost:3000/login
echo    y recarga con Ctrl + Shift + R
echo.
echo    NO cierres esta ventana mientras uses la pagina.
echo ============================================================
echo.

call npm run dev > "..\servidor-log.txt" 2>&1

echo.
echo ============================================================
echo    El servidor se detuvo. El detalle quedo guardado en
echo    servidor-log.txt
echo ============================================================
pause

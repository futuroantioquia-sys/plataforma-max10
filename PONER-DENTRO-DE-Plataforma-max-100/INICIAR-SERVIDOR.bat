@echo off
title Futuro Antioquia - Servidor Local
cd /d "%~dp0frontend"
echo ==========================================================
echo    FUTURO ANTIOQUIA - Iniciando servidor local...
echo.
echo    NO CIERRES esta ventana negra mientras uses la pagina.
echo    Cuando aparezca la palabra "Ready" abre en el navegador:
echo        http://localhost:3000/login
echo ==========================================================
echo.
if not exist "node_modules" (
  echo Instalando dependencias por primera vez, espera un momento...
  call npm install
)
call npm run dev
echo.
echo ==========================================================
echo    El servidor se detuvo. Si ves un error en rojo arriba,
echo    toma una captura y enviamela.
echo ==========================================================
pause

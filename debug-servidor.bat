@echo off
cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100\frontend"
echo Iniciando servidor con captura de errores... > ..\server-debug.log
echo Fecha: %DATE% %TIME% >> ..\server-debug.log
echo ========================= >> ..\server-debug.log
npm run dev >> ..\server-debug.log 2>&1

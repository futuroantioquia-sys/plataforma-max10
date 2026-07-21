@echo off
echo Deteniendo servidor Node.js...
taskkill /F /IM node.exe /T 2>nul
timeout /t 3 /nobreak >nul

echo Borrando cache .next...
rd /s /q "C:\Users\Lenovo\Claude\Projects\Plataforma max 100\frontend\.next" 2>nul

echo Iniciando servidor limpio...
cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100\frontend"
start "Servidor Next.js" cmd /k npm run dev

echo Esperando que el servidor arranque (15 segundos)...
timeout /t 15 /nobreak >nul
start http://localhost:3000
echo Listo!

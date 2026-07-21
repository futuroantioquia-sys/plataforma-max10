@echo off
cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100\frontend"
start "Servidor Next.js" cmd /k npm run dev
timeout /t 6 /nobreak >nul
start http://localhost:3000

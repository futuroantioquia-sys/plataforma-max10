@echo off
cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100"

echo Commiteando fix asistencia + dashboard...
git add "frontend/src/app/asistencia/page.tsx"
git add "frontend/src/app/dashboard/page.tsx"
git commit -m "fix: deploy asistencia completa (TDZ fix) + dashboard defensivo"
git push origin main

echo.
echo ===================================================
echo   LISTO! Vercel desplegando en ~60 segundos.
echo   - Asistencia: funciones completas + fix TDZ
echo   - Dashboard: manejo defensivo de fechas
echo ===================================================
pause

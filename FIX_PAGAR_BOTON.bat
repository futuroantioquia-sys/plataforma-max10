@echo off
cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100"

echo Commiteando datos bancarios reales y modal nuevo...
git add frontend/src/lib/db.ts
git add "frontend/src/app/alumnos/[id]/estado-cuenta/page.tsx"
git commit -m "fix: modal REALIZA TU PAGO con datos Bancolombia reales + db.ts funciones asistencia"
git push --force origin main

echo.
echo ===================================================
echo   LISTO! Vercel desplegando en ~60 segundos.
echo   Datos del banco: Bancolombia 10182764613
echo ===================================================
pause

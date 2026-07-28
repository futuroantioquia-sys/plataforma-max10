@echo off
cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100"

echo Desplegando fix asistencia: hydration mismatch resuelto...
git add "frontend/src/app/asistencia/page.tsx"
git commit -m "fix: asistencia hydration mismatch - useState+useEffect unificado para rol+carga"
git push origin main

echo.
echo ===================================================
echo   LISTO! Vercel desplegando en ~60 segundos.
echo   Fix: esProfe/proyectosProfe/nombreProfe ahora
echo   usan useState(valor inicial SSR) + useEffect
echo   unificado que detecta rol Y carga datos juntos
echo   (elimina stale closure y hydration mismatch)
echo ===================================================
pause

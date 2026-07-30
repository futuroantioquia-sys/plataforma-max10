@echo off
cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100\frontend"
git add -A
git commit -m "feat: documentos cross-device — Supabase sync + vista admin/profe con preview y descarga"
git push origin main
echo.
echo Deploy completado. Vercel construira automaticamente.
pause

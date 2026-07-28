@echo off
cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100"
echo Abortando rebase en conflicto...
git rebase --abort
echo Force-pushing (mi commit tiene ambos fixes: useRef + deportistas.length)...
git push --force origin main
echo.
echo LISTO - Vercel desplegando en ~55s
pause

@echo off
cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100"
echo Fetching remote...
git fetch origin
echo Rebasing on top of remote...
git rebase origin/main
echo Pushing...
git push origin main
echo.
echo LISTO - Vercel desplegando en ~55s
pause

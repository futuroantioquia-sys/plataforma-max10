@echo off
echo ============================================
echo   SUBIR MIGRACION SUPABASE A GITHUB
echo ============================================
echo.

cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100"

git add .
git commit -m "feat: migrar toda la app a Supabase (eliminar localStorage)"
git push

echo.
if %ERRORLEVEL% EQU 0 (
  echo LISTO - Cambios subidos. Vercel redesplegara automaticamente.
) else (
  echo ERROR al subir. Asegurate de tener sesion en GitHub.
)
echo ============================================
pause

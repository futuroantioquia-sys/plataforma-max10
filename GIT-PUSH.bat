@echo off
echo Subiendo cambios a GitHub...
"C:\Program Files\Git\cmd\git.exe" add .
"C:\Program Files\Git\cmd\git.exe" commit -m "feat: migrar toda la app a Supabase"
"C:\Program Files\Git\cmd\git.exe" push
echo.
if %ERRORLEVEL% EQU 0 (
  echo LISTO - Cambios subidos. Vercel redesplegara.
) else (
  echo ERROR. Verifica que tienes sesion de GitHub.
)
pause

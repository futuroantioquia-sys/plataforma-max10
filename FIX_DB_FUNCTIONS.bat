@echo off
cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100"
echo Agregando funciones faltantes de asistencia a db.ts...
git add frontend/src/lib/db.ts
git commit -m "fix: agregar getAsistenciaPorProyecto, saveAsistenciaProyecto, saveAsistenciaLocal, deleteAsistenciaFecha a db.ts"
git push origin main
echo.
echo LISTO - Vercel desplegando en ~55s
pause

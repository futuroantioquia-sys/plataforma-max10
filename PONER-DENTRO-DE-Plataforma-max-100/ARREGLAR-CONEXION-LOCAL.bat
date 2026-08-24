@echo off
chcp 65001 >nul
title Arreglar conexion LOCAL - Futuro Antioquia
echo ================================================================
echo    ARREGLANDO LA CONEXION DEL ENTORNO LOCAL
echo    (apunta el servidor local al proyecto CORRECTO)
echo ================================================================
echo.

set "ENVFILE=%~dp0frontend\.env.local"

if not exist "%ENVFILE%" (
  echo  ERROR: No se encontro el archivo:
  echo    %ENVFILE%
  echo.
  echo  Asegurate de que este archivo .bat este DENTRO de la carpeta
  echo  "Plataforma max 100" (junto a la carpeta "frontend").
  echo.
  pause
  exit /b 1
)

echo  Archivo encontrado. Actualizando...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$f=$env:ENVFILE; $k='SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdzb3Z0Z3Ryc3F6b3J1dmdtaGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzQyNjUsImV4cCI6MjA5OTU1MDI2NX0.ZpLaLh-Y_ksfGInDLHeuzb8UG1r3stzjcqcyBUQ-uP4'; $c=[System.IO.File]::ReadAllText($f); if($c -match '(?m)^SUPABASE_SERVICE_ROLE_KEY='){ $c=[regex]::Replace($c,'(?m)^SUPABASE_SERVICE_ROLE_KEY=[^\r\n]*',{ param($m) $k }) } else { if(-not $c.EndsWith([Environment]::NewLine)){ $c+=[Environment]::NewLine }; $c+=$k+[Environment]::NewLine }; [System.IO.File]::WriteAllText($f,$c); $line=[regex]::Match($c,'(?m)^SUPABASE_SERVICE_ROLE_KEY=[^\r\n]*').Value; if($line.EndsWith('ZpLaLh-Y_ksfGInDLHeuzb8UG1r3stzjcqcyBUQ-uP4')){ Write-Host '  OK: la conexion quedo apuntando al proyecto CORRECTO.' -ForegroundColor Green } else { Write-Host '  ATENCION: no se pudo confirmar el cambio. Avisale al desarrollador.' -ForegroundColor Yellow }"

echo.
echo ----------------------------------------------------------------
echo  YA QUEDO. Ahora haz esto:
echo    1) Cierra la ventana NEGRA del servidor (si esta abierta).
echo    2) Abre INICIAR-LOCAL para arrancar el servidor otra vez.
echo    3) En el navegador entra a localhost:3000 y pulsa Ctrl+Shift+R
echo ----------------------------------------------------------------
echo.
pause

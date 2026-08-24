@echo off
chcp 65001 >nul
title Programar el respaldo diario
set RAIZ=C:\Users\Lenovo\Claude\Projects\Plataforma max 100
cls
echo.
echo  ============================================================
echo    PROGRAMAR EL RESPALDO AUTOMATICO DIARIO
echo  ============================================================
echo.
echo  Se va a programar para que TODOS LOS DIAS a las 8:00 p.m.
echo  el computador haga el respaldo solo.
echo.
echo  Requisito: el computador debe estar encendido a esa hora.
echo.
pause

schtasks /Create /SC DAILY /TN "Futuro Antioquia - Respaldo diario" /TR "\"%RAIZ%\RESPALDO-SILENCIOSO.bat\"" /ST 20:00 /F

if errorlevel 1 (
  echo.
  echo  *** No se pudo programar. Pruebe abriendo este archivo con
  echo      clic derecho y "Ejecutar como administrador". ***
) else (
  echo.
  echo  LISTO. Queda programado todos los dias a las 8:00 p.m.
  echo.
  echo  Para verlo:  Programador de tareas de Windows
  echo  Se llama:    Futuro Antioquia - Respaldo diario
)
echo.
pause

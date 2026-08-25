@echo off
title PASO 2 - Pasar los textos de Valoracion a la base buena
color 0A
mode con: cols=80 lines=40

echo.
echo  ============================================================
echo    PASO 2 de 2  -  PASAR LOS TEXTOS DE VALORACION
echo  ============================================================
echo.
echo  Copia lo que estaba guardado en la base VIEJA (los textos de
echo  Gestion de Valoracion) a la base BUENA.
echo.
echo  Es prudente: si en la base buena ya hay algo escrito, NO lo
echo  pisa. Se puede correr varias veces sin daNar nada.
echo.
echo  IMPORTANTE: primero debe haber corrido el PASO 1.
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pasar-textos-valoracion.ps1"

echo.
echo  ============================================================
echo    Cuando termine, entre a la plataforma y oprima F5.
echo  ============================================================
echo.
pause

@echo off
chcp 65001 >nul
title REPARAR EL INGRESO DE UN ADMINISTRADOR
color 0E
mode con: cols=82 lines=40
cd /d "%~dp0"

echo.
echo  Abriendo la herramienta...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0reparar-diana.ps1"

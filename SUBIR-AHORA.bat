@echo off
chcp 65001 >nul
title Subir a GitHub - Futuro Antioquia
cd /d "%~dp0"

echo =========================================================
echo   SUBIR A GITHUB
echo   Carpeta: %CD%
echo =========================================================
echo.

git config user.name "Futuro Antioquia"
git config user.email "futuroantioquia-sys@users.noreply.github.com"

echo --- 1. QUE HAY SIN SUBIR ---------------------------------
git status --short
echo.

echo --- 2. GUARDANDO CAMBIOS ---------------------------------
git add -A
git commit -m "archivos en su sitio, librerias y objetivos especificos"
echo.

echo --- 3. SUBIENDO A GITHUB ---------------------------------
echo (Si pide usuario y contrasena, escribalos aqui mismo.
echo  La contrasena NO se ve mientras la escribe: es normal.)
echo.
git push origin main
echo.

echo =========================================================
echo   TERMINADO. Copie esta ventana y pasesela a Claude.
echo =========================================================
pause

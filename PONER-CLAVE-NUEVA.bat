@echo off
chcp 65001 >nul
title Poner la clave anon del proyecto nuevo
cd /d "%~dp0"

echo.
echo  Abriendo Supabase en el navegador...
echo  (si le pide entrar, use "Continue with GitHub")
echo.
start "" "https://supabase.com/dashboard/project/fykdyalpuydkwfjqguip/settings/api"
timeout /t 3 >nul

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0poner-clave.ps1"

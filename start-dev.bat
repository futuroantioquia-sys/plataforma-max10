@echo off
chcp 65001 >nul
title Servidor Local - Futuro Antioquia
color 0A
echo.
echo  Iniciando servidor de desarrollo...
echo  Abre http://localhost:3000 en el navegador
echo.
cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100\frontend"
npm run dev

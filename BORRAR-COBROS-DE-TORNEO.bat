@echo off
chcp 65001 >nul
title BORRAR LOS COBROS DE TORNEO
color 0E
mode con: cols=84 lines=44
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0borrar-torneos.ps1"

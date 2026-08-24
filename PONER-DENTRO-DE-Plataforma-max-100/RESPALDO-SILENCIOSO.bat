@echo off
REM Respaldo automatico (sin ventanas ni pausas). Lo usa la tarea programada.
cd /d "C:\Users\Lenovo\Claude\Projects\Plataforma max 100"
node respaldo.js >> "RESPALDO-registro.txt" 2>&1

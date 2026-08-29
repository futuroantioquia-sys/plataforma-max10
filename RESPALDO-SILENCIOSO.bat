@echo off
REM Respaldo automatico (sin ventanas ni pausas). Lo usa la tarea programada.
REM 28/08/2026: antes apuntaba a C:\Users\Lenovo\... —la carpeta del computador
REM viejo—, asi que la tarea corria en el vacio y NUNCA respaldaba nada.
REM Ahora usa %~dp0: la carpeta donde esta este mismo archivo, sea cual sea.
cd /d "%~dp0"
node respaldo.js >> "RESPALDO-registro.txt" 2>&1

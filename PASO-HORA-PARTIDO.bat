@echo off
chcp 65001 >nul
title HORA DEL PARTIDO - preparar la base
cd /d "%~dp0"
cls
echo.
echo  ============================================================
echo    HORA DEL PARTIDO
echo  ============================================================
echo.
echo  La programacion ahora tiene DOS horas:
echo.
echo     HORA DE LLEGADA  ..  cuando se cita a los ninos
echo     HORA DEL PARTIDO ..  cuando pita el arbitro
echo.
echo  Poniendo una, la otra se llena sola con 45 minutos
echo  de diferencia. Esto le agrega esa casilla a la base.
echo.
echo  Se corre UNA SOLA VEZ. NO borra nada.
echo.
echo  Se va a abrir Supabase con el texto ya puesto.
echo  Alla solo hay que oprimir el boton  RUN  (arriba a la derecha).
echo.
pause

set "URL=https://supabase.com/dashboard/project/fykdyalpuydkwfjqguip/sql/new?content=--%%20HORA%%20DEL%%20PARTIDO%%20-%%2002%%2F09%%2F2026%%0A--%%20Agrega%%20la%%20casilla%%20de%%20la%%20hora%%20en%%20que%%20arranca%%20el%%20partido.%%0A--%%20La%%20de%%20llegada%%20ya%%20existia%%3B%%20esta%%20es%%20la%%20del%%20pitazo%%20inicial.%%0A--%%20Correr%%20esto%%20NO%%20borra%%20nada.%%20Se%%20puede%%20correr%%20varias%%20veces.%%0A%%0Aalter%%20table%%20public.programacion_competencia%%20add%%20column%%20if%%20not%%20exists%%20hora_partido%%20text%%20not%%20null%%20default%%20''%%3B%%0A%%0Anotify%%20pgrst%%2C%%20'reload%%20schema'%%3B%%0A%%0A--%%20Abajo%%20debe%%20salir%%20un%%20cuadro%%20con%%20la%%20palabra%%20LISTO.%%0Aselect%%20'hora%%20del%%20partido'%%20as%%20casilla%%2C%%0A%%20%%20%%20%%20%%20%%20%%20case%%20when%%20exists%%20(select%%201%%20from%%20information_schema.columns%%0A%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20where%%20table_name%%3D'programacion_competencia'%%20and%%20column_name%%3D'hora_partido')%%0A%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20then%%20'LISTO'%%20else%%20'FALTA'%%20end%%20as%%20resultado%%3B"
start "" "%URL%"

echo.
echo  ============================================================
echo    Abajo, en Supabase, debe salir:
echo.
echo         hora del partido    LISTO
echo.
echo    Si dice FALTA, mandale la foto a quien te ayuda.
echo  ============================================================
echo.
pause

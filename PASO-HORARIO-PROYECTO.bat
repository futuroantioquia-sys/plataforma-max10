@echo off
chcp 65001 >nul
title HORARIO DE ENTRENAMIENTO - preparar la base
cd /d "%~dp0"
cls
echo.
echo  ============================================================
echo    HORARIO DE ENTRENAMIENTO
echo  ============================================================
echo.
echo  En Informacion de Proyectos y Formadores queda una columna
echo  nueva: HORARIO.
echo.
echo  Se escoge la hora de ENTRADA y la de salida sale sola:
echo.
echo     Formacion, Progresion, Seleccion, Desarrollo .. hora y media
echo     Estimulacion .................................. una hora
echo.
echo  Esto le agrega esa casilla a la base.
echo.
echo  Se corre UNA SOLA VEZ. NO borra nada.
echo.
echo  Se va a abrir Supabase con el texto ya puesto.
echo  Alla solo hay que oprimir el boton  RUN  (arriba a la derecha).
echo.
pause

set "URL=https://supabase.com/dashboard/project/fykdyalpuydkwfjqguip/sql/new?content=--%%20HORARIO%%20DE%%20ENTRENAMIENTO%%20-%%2002%%2F09%%2F2026%%0A--%%20Agrega%%20la%%20casilla%%20de%%20la%%20hora%%20en%%20que%%20arranca%%20el%%20entrenamiento%%20de%%20cada%%20proyecto.%%0A--%%20La%%20hora%%20de%%20salida%%20NO%%20se%%20guarda%%3A%%20la%%20calcula%%20la%%20plataforma%%20(1h30%%2C%%20o%%201h%%20en%%20Estimulacion).%%0A--%%20Correr%%20esto%%20NO%%20borra%%20nada.%%20Se%%20puede%%20correr%%20varias%%20veces.%%0A%%0Aalter%%20table%%20public.jornadas_proyecto%%20add%%20column%%20if%%20not%%20exists%%20hora_inicio%%20text%%20not%%20null%%20default%%20''%%3B%%0A%%0Anotify%%20pgrst%%2C%%20'reload%%20schema'%%3B%%0A%%0A--%%20Abajo%%20debe%%20salir%%20un%%20cuadro%%20con%%20la%%20palabra%%20LISTO.%%0Aselect%%20'horario%%20de%%20entrenamiento'%%20as%%20casilla%%2C%%0A%%20%%20%%20%%20%%20%%20%%20case%%20when%%20exists%%20(select%%201%%20from%%20information_schema.columns%%0A%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20where%%20table_name%%3D'jornadas_proyecto'%%20and%%20column_name%%3D'hora_inicio')%%0A%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20then%%20'LISTO'%%20else%%20'FALTA'%%20end%%20as%%20resultado%%3B"
start "" "%URL%"

echo.
echo  ============================================================
echo    Abajo, en Supabase, debe salir:
echo.
echo         horario de entrenamiento    LISTO
echo.
echo    Si dice FALTA, mandale la foto a quien te ayuda.
echo  ============================================================
echo.
pause

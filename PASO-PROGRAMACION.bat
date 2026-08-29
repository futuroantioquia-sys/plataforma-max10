@echo off
chcp 65001 >nul
title PROGRAMACION DE COMPETENCIA - preparar la base
cd /d "%~dp0"
cls
echo.
echo  ============================================================
echo    PROGRAMACION DE COMPETENCIA
echo  ============================================================
echo.
echo  Esto crea en la base el cuadro donde la direccion programa
echo  los partidos. Se corre UNA SOLA VEZ.
echo.
echo  NO borra nada. Si ya estaba, no pasa nada.
echo.
echo  Se va a abrir Supabase con el texto ya puesto.
echo  Alla solo hay que oprimir el boton  RUN  (arriba a la derecha).
echo.
pause

set "URL=https://supabase.com/dashboard/project/fykdyalpuydkwfjqguip/sql/new?content=--%%20PROGRAMACION%%20DE%%20COMPETENCIA%%20-%%2028%%2F08%%2F2026%%0A--%%20Crea%%20el%%20cuadro%%20donde%%20la%%20direccion%%20programa%%20los%%20partidos.%%0A--%%20Correr%%20esto%%20NO%%20borra%%20nada.%%20Se%%20puede%%20correr%%20varias%%20veces%%20sin%%20problema.%%0A%%0Acreate%%20table%%20if%%20not%%20exists%%20public.programacion_competencia%%20%%28%%0Aid%%20uuid%%20primary%%20key%%20default%%20gen_random_uuid%%28%%29%%2C%%0Atorneo_num%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Ajornada%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Afecha%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Ahora%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Arival%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Aescenario%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Adt%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Aat%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Amicrociclo_id%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Aactualizada_en%%20timestamptz%%20not%%20null%%20default%%20now%%28%%29%%29%%3B%%0A%%0Aalter%%20table%%20public.programacion_competencia%%20add%%20column%%20if%%20not%%20exists%%20microciclo_id%%20text%%20not%%20null%%20default%%20%%27%%27%%3B%%0Aalter%%20table%%20public.programacion_competencia%%20add%%20column%%20if%%20not%%20exists%%20escenario%%20text%%20not%%20null%%20default%%20%%27%%27%%3B%%0Aalter%%20table%%20public.programacion_competencia%%20add%%20column%%20if%%20not%%20exists%%20dt%%20text%%20not%%20null%%20default%%20%%27%%27%%3B%%0Aalter%%20table%%20public.programacion_competencia%%20add%%20column%%20if%%20not%%20exists%%20at%%20text%%20not%%20null%%20default%%20%%27%%27%%3B%%0A%%0Aalter%%20table%%20public.programacion_competencia%%20disable%%20row%%20level%%20security%%3B%%0Agrant%%20select%%2C%%20insert%%2C%%20update%%2C%%20delete%%20on%%20public.programacion_competencia%%20to%%20anon%%2C%%20authenticated%%3B%%0A%%0Anotify%%20pgrst%%2C%%20%%27reload%%20schema%%27%%3B%%0A%%0A--%%20Abajo%%20debe%%20salir%%20un%%20cuadro%%20con%%20la%%20palabra%%20LISTO.%%0Aselect%%20%%27cuadro%%20de%%20programacion%%27%%20as%%20casilla%%2C%%0A%%20%%20%%20%%20%%20%%20%%20case%%20when%%20exists%%20%%28select%%201%%20from%%20information_schema.tables%%0A%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20where%%20table_name%%3D%%27programacion_competencia%%27%%29%%20then%%20%%27LISTO%%27%%20else%%20%%27FALTA%%27%%20end%%20as%%20resultado%%3B"
start "" "%URL%"

echo.
echo  ============================================================
echo    Abajo, en Supabase, debe salir:
echo.
echo         cuadro de programacion    LISTO
echo.
echo    Si dice FALTA, mandale la foto a quien te ayuda.
echo  ============================================================
echo.
pause

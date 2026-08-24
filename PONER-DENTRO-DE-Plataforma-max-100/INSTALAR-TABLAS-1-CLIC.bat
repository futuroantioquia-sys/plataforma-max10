@echo off
chcp 65001 >nul
title MICROCICLO - Instalar tablas (1 clic)
color 0A

echo.
echo  ============================================================
echo    MICROCICLO - Abriendo Supabase CON EL SQL YA ESCRITO
echo  ============================================================
echo.
echo  No tienes que copiar ni pegar nada.
echo  Solo vas a oprimir el boton verde CORRER.
echo.

set "URL=https://supabase.com/dashboard/project/fykdyalpuydkwfjqguip/sql/new?content=create%%20table%%20if%%20not%%20exists%%20public.microciclos%%20%%28%%0Aid%%20uuid%%20primary%%20key%%20default%%20gen_random_uuid%%28%%29%%2C%%0Aproyecto%%20text%%20not%%20null%%2C%%20profesor%%20text%%20default%%20%%27%%27%%2C%%20numero%%20int%%20default%%201%%2C%%0Amesociclo%%20text%%20default%%20%%27%%27%%2C%%20fecha_inicio%%20date%%20not%%20null%%2C%%20fecha_fin%%20date%%20not%%20null%%2C%%0Aobjetivo_general%%20text%%20default%%20%%27%%27%%2C%%20objetivo_tecnico%%20text%%20default%%20%%27%%27%%2C%%0Aobjetivo_tactico%%20text%%20default%%20%%27%%27%%2C%%20objetivo_fisico%%20text%%20default%%20%%27%%27%%2C%%0Aobjetivo_psico%%20text%%20default%%20%%27%%27%%2C%%20estado%%20text%%20not%%20null%%20default%%20%%27borrador%%27%%2C%%0Acreado_por%%20text%%20default%%20%%27%%27%%2C%%20created_at%%20timestamptz%%20not%%20null%%20default%%20now%%28%%29%%2C%%0Aupdated_at%%20timestamptz%%20not%%20null%%20default%%20now%%28%%29%%2C%%0Aconstraint%%20microciclos_estado_ok%%20check%%20%%28estado%%20in%%20%%28%%27borrador%%27%%2C%%27publicado%%27%%2C%%27cerrado%%27%%29%%29%%2C%%0Aconstraint%%20microciclos_fechas_ok%%20check%%20%%28fecha_fin%%20%%3E%%3D%%20fecha_inicio%%29%%29%%3B%%0A%%0Acreate%%20unique%%20index%%20if%%20not%%20exists%%20microciclos_proyecto_semana_uk%%20on%%20public.microciclos%%20%%28proyecto%%2C%%20fecha_inicio%%29%%3B%%0Acreate%%20index%%20if%%20not%%20exists%%20microciclos_proyecto_idx%%20on%%20public.microciclos%%20%%28proyecto%%2C%%20fecha_inicio%%20desc%%29%%3B%%0A%%0Acreate%%20table%%20if%%20not%%20exists%%20public.microciclo_dias%%20%%28%%0Aid%%20uuid%%20primary%%20key%%20default%%20gen_random_uuid%%28%%29%%2C%%0Amicrociclo_id%%20uuid%%20not%%20null%%20references%%20public.microciclos%%28id%%29%%20on%%20delete%%20cascade%%2C%%0Afecha%%20date%%20not%%20null%%2C%%20dia_semana%%20int%%20not%%20null%%2C%%0Atipo_dia%%20text%%20default%%20%%27entreno%%27%%2C%%20carga%%20text%%20default%%20%%27media%%27%%2C%%0Aobjetivo_dia%%20text%%20default%%20%%27%%27%%2C%%20contenidos%%20text%%20default%%20%%27%%27%%2C%%0Afase_inicial%%20text%%20default%%20%%27%%27%%2C%%20fase_central%%20text%%20default%%20%%27%%27%%2C%%20fase_final%%20text%%20default%%20%%27%%27%%2C%%0Apizarra_inicial%%20jsonb%%2C%%20pizarra_central%%20jsonb%%2C%%20pizarra_final%%20jsonb%%2C%%0Aobservaciones%%20text%%20default%%20%%27%%27%%2C%%20created_at%%20timestamptz%%20not%%20null%%20default%%20now%%28%%29%%2C%%0Aupdated_at%%20timestamptz%%20not%%20null%%20default%%20now%%28%%29%%2C%%0Aconstraint%%20microciclo_dias_tipo_ok%%20check%%20%%28tipo_dia%%20in%%20%%28%%27entreno%%27%%2C%%27partido%%27%%2C%%27descarga%%27%%2C%%27recuperacion%%27%%2C%%27descanso%%27%%2C%%27competencia%%27%%29%%29%%2C%%0Aconstraint%%20microciclo_dias_carga_ok%%20check%%20%%28carga%%20in%%20%%28%%27baja%%27%%2C%%27media%%27%%2C%%27alta%%27%%2C%%27muy_alta%%27%%29%%29%%2C%%0Aconstraint%%20microciclo_dias_dia_ok%%20check%%20%%28dia_semana%%20between%%201%%20and%%207%%29%%29%%3B%%0A%%0Acreate%%20unique%%20index%%20if%%20not%%20exists%%20microciclo_dias_fecha_uk%%20on%%20public.microciclo_dias%%20%%28microciclo_id%%2C%%20fecha%%29%%3B%%0Acreate%%20index%%20if%%20not%%20exists%%20microciclo_dias_mc_idx%%20on%%20public.microciclo_dias%%20%%28microciclo_id%%2C%%20dia_semana%%29%%3B%%0A%%0Acreate%%20or%%20replace%%20function%%20public.tocar_updated_at%%28%%29%%20returns%%20trigger%%20language%%20plpgsql%%20as%%20%%24%%24%%0Abegin%%20new.updated_at%%20%%3D%%20now%%28%%29%%3B%%20return%%20new%%3B%%20end%%3B%%20%%24%%24%%3B%%0A%%0Adrop%%20trigger%%20if%%20exists%%20microciclos_touch%%20on%%20public.microciclos%%3B%%0Acreate%%20trigger%%20microciclos_touch%%20before%%20update%%20on%%20public.microciclos%%0Afor%%20each%%20row%%20execute%%20function%%20public.tocar_updated_at%%28%%29%%3B%%0A%%0Adrop%%20trigger%%20if%%20exists%%20microciclo_dias_touch%%20on%%20public.microciclo_dias%%3B%%0Acreate%%20trigger%%20microciclo_dias_touch%%20before%%20update%%20on%%20public.microciclo_dias%%0Afor%%20each%%20row%%20execute%%20function%%20public.tocar_updated_at%%28%%29%%3B%%0A%%0Aalter%%20table%%20public.microciclos%%20disable%%20row%%20level%%20security%%3B%%0Aalter%%20table%%20public.microciclo_dias%%20disable%%20row%%20level%%20security%%3B%%0Agrant%%20select%%2C%%20insert%%2C%%20update%%2C%%20delete%%20on%%20public.microciclos%%20to%%20anon%%2C%%20authenticated%%3B%%0Agrant%%20select%%2C%%20insert%%2C%%20update%%2C%%20delete%%20on%%20public.microciclo_dias%%20to%%20anon%%2C%%20authenticated%%3B"

set "CHROME="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if defined CHROME (
  start "" "%CHROME%" --new-tab "%URL%"
) else (
  start "" "%URL%"
)

echo  Se abrio una pestana nueva en Chrome.
echo.
echo  ------------------------------------------------------------
echo    EN ESA PESTANA:
echo.
echo      El editor ya trae el SQL escrito.
echo      Solo oprime el boton verde  CORRER  (arriba a la derecha).
echo.
echo    Debe responder:  Success. No rows returned
echo  ------------------------------------------------------------
echo.
echo  Luego vuelve a localhost:3000/microciclo y oprime F5.
echo.
pause

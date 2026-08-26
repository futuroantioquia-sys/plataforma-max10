@echo off
chcp 65001 >nul
title SOLICITUD DE RETIRO - Preparar la tabla
color 0A
mode con: cols=78 lines=40

echo.
echo  ============================================================
echo    SOLICITUD DE RETIRO - Preparar la tabla
echo  ============================================================
echo.
echo  Se puede correr las veces que sea. Si la tabla ya existe, no la
echo  altera: solo le agrega lo que le falte.
echo.

set "URL=https://supabase.com/dashboard/project/fykdyalpuydkwfjqguip/sql/new?content=create%%20table%%20if%%20not%%20exists%%20public.solicitudes_retiro%%20%%28%%0Aid%%20text%%20primary%%20key%%2C%%0Adeportista_id%%20text%%20not%%20null%%2C%%0Acodigo%%20text%%2C%%0Anombre%%20text%%2C%%0Aprograma%%20text%%2C%%0Aproyecto%%20text%%2C%%0Asede%%20text%%2C%%0Amotivo%%20text%%20not%%20null%%2C%%0Aestado%%20text%%20not%%20null%%20default%%20%%27EN%%20ESTUDIO%%27%%2C%%0Ameses_pendientes%%20int%%20not%%20null%%20default%%200%%2C%%0Avalor_pendiente%%20bigint%%20not%%20null%%20default%%200%%2C%%0Acreada_en%%20timestamptz%%20not%%20null%%20default%%20now%%28%%29%%2C%%0Aresuelta_en%%20timestamptz%%2C%%0Aresuelta_por%%20text%%2C%%0Anota_admin%%20text%%29%%3B%%0A%%0Aalter%%20table%%20public.solicitudes_retiro%%20add%%20column%%20if%%20not%%20exists%%20paz_salvo%%20boolean%%20not%%20null%%20default%%20false%%3B%%0Aalter%%20table%%20public.solicitudes_retiro%%20add%%20column%%20if%%20not%%20exists%%20paz_salvo_en%%20timestamptz%%3B%%0Aalter%%20table%%20public.solicitudes_retiro%%20add%%20column%%20if%%20not%%20exists%%20paz_salvo_por%%20text%%3B%%0Aalter%%20table%%20public.solicitudes_retiro%%20add%%20column%%20if%%20not%%20exists%%20motivo_tipo%%20text%%3B%%0A%%0Acreate%%20index%%20if%%20not%%20exists%%20idx_sret_dep%%20on%%20public.solicitudes_retiro%%20%%28deportista_id%%29%%3B%%0Acreate%%20index%%20if%%20not%%20exists%%20idx_sret_estado%%20on%%20public.solicitudes_retiro%%20%%28estado%%29%%3B%%0A%%0Aalter%%20table%%20public.solicitudes_retiro%%20disable%%20row%%20level%%20security%%3B%%0Agrant%%20select%%2C%%20insert%%2C%%20update%%2C%%20delete%%20on%%20public.solicitudes_retiro%%20to%%20anon%%2C%%20authenticated%%3B%%0A%%0Anotify%%20pgrst%%2C%%20%%27reload%%20schema%%27%%3B%%0A%%0A--%%20Abajo%%20debe%%20salir%%20un%%20cuadro%%20con%%20la%%20palabra%%20LISTO%%20en%%20las%%20cuatro%%20filas.%%0Aselect%%20%%27motivo_tipo%%27%%20as%%20casilla%%2C%%0A%%20%%20%%20%%20%%20%%20%%20case%%20when%%20exists%%20%%28select%%201%%20from%%20information_schema.columns%%0A%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20where%%20table_name%%3D%%27solicitudes_retiro%%27%%20and%%20column_name%%3D%%27motivo_tipo%%27%%29%%0A%%20%%20%%20%%20%%20%%20%%20then%%20%%27LISTO%%27%%20else%%20%%27FALTA%%27%%20end%%20as%%20resultado%%0Aunion%%20all%%20select%%20%%27paz_salvo%%27%%2C%%0A%%20%%20%%20%%20%%20%%20%%20case%%20when%%20exists%%20%%28select%%201%%20from%%20information_schema.columns%%0A%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20where%%20table_name%%3D%%27solicitudes_retiro%%27%%20and%%20column_name%%3D%%27paz_salvo%%27%%29%%0A%%20%%20%%20%%20%%20%%20%%20then%%20%%27LISTO%%27%%20else%%20%%27FALTA%%27%%20end%%0Aunion%%20all%%20select%%20%%27paz_salvo_en%%27%%2C%%0A%%20%%20%%20%%20%%20%%20%%20case%%20when%%20exists%%20%%28select%%201%%20from%%20information_schema.columns%%0A%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20where%%20table_name%%3D%%27solicitudes_retiro%%27%%20and%%20column_name%%3D%%27paz_salvo_en%%27%%29%%0A%%20%%20%%20%%20%%20%%20%%20then%%20%%27LISTO%%27%%20else%%20%%27FALTA%%27%%20end%%0Aunion%%20all%%20select%%20%%27paz_salvo_por%%27%%2C%%0A%%20%%20%%20%%20%%20%%20%%20case%%20when%%20exists%%20%%28select%%201%%20from%%20information_schema.columns%%0A%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20where%%20table_name%%3D%%27solicitudes_retiro%%27%%20and%%20column_name%%3D%%27paz_salvo_por%%27%%29%%0A%%20%%20%%20%%20%%20%%20%%20then%%20%%27LISTO%%27%%20else%%20%%27FALTA%%27%%20end%%3B"

set "CHROME="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if defined CHROME (
  start "" "%CHROME%" --new-window --start-maximized "%URL%"
) else (
  start "" "%URL%"
)

echo  Se abrio una ventana de Chrome con el SQL ya escrito.
echo.
echo  ------------------------------------------------------------
echo    HAGA ESTO, EN ESTE ORDEN:
echo.
echo      1. Si Chrome le pregunta si traduce la pagina, diga que NO.
echo.
echo      2. Haga UN CLIC encima del texto del SQL (las lineas de
echo         colores). Debe quedar una rayita parpadeando ahi.
echo.
echo      3. Oprima  CTRL + ENTER  (las dos teclas al tiempo).
echo         Tambien sirve el boton verde RUN, abajo a la derecha.
echo.
echo  ------------------------------------------------------------
echo    COMO SABER SI QUEDO BIEN:
echo.
echo    Abajo NO debe decir Success. Debe salir un CUADRO con
echo    cuatro filas, asi:
echo.
echo         casilla            resultado
echo         motivo_tipo        LISTO
echo         paz_salvo          LISTO
echo         paz_salvo_en       LISTO
echo         paz_salvo_por      LISTO
echo.
echo    Si las cuatro dicen LISTO, ya quedo. Vuelva a la plataforma
echo    y oprima F5.
echo.
echo    Si alguna dice FALTA, o sale un mensaje rojo, tome un
echo    pantallazo de la pantalla de Chrome y enviemelo.
echo  ------------------------------------------------------------
echo.
pause

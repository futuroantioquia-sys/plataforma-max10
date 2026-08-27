@echo off
chcp 65001 >nul
title BANCO POSPARTIDO - Preparar la base
color 0A
mode con: cols=78 lines=44

echo.
echo  ============================================================
echo    BANCO POSPARTIDO - varios partidos por torneo
echo  ============================================================
echo.
echo  Se corre UNA sola vez.
echo.
echo  QUE HACE: hasta ahora la base guardaba UN solo partido por
echo  torneo. Al jugar la fecha 2, la fecha 1 se perdia.
echo.
echo  Con esto, cada torneo guarda todas sus fechas:
echo.
echo        FECHA 1  LIGA DESARROLLO SUB 8
echo        FECHA 2  LIGA DESARROLLO SUB 8
echo        FECHA 3  LIGA DESARROLLO SUB 8
echo.
echo  No le borra nada de lo que ya este guardado.
echo.

set "URL=https://supabase.com/dashboard/project/fykdyalpuydkwfjqguip/sql/new?content=create%%20table%%20if%%20not%%20exists%%20public.pospartido_planillas%%20%%28%%0Atorneo_num%%20text%%20not%%20null%%2C%%0Ajornada%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Afecha%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Allegar%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Arival%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Agoles_nos%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Agoles_ellos%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Aautogoles%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Afilas%%20jsonb%%20not%%20null%%20default%%20%%27%%5B%%5D%%27%%3A%%3Ajsonb%%2C%%0Aactualizada_en%%20timestamptz%%20not%%20null%%20default%%20now%%28%%29%%29%%3B%%0A%%0Aalter%%20table%%20public.pospartido_planillas%%20add%%20column%%20if%%20not%%20exists%%20jornada%%20text%%20not%%20null%%20default%%20%%27%%27%%3B%%0Aalter%%20table%%20public.pospartido_planillas%%20add%%20column%%20if%%20not%%20exists%%20filas%%20jsonb%%20not%%20null%%20default%%20%%27%%5B%%5D%%27%%3A%%3Ajsonb%%3B%%0Aalter%%20table%%20public.pospartido_planillas%%20add%%20column%%20if%%20not%%20exists%%20autogoles%%20text%%20not%%20null%%20default%%20%%27%%27%%3B%%0Aalter%%20table%%20public.pospartido_planillas%%20add%%20column%%20if%%20not%%20exists%%20actualizada_en%%20timestamptz%%20not%%20null%%20default%%20now%%28%%29%%3B%%0A%%0A--%%20LA%%20LLAVE%%20NUEVA%%3A%%20torneo%%20%%2B%%20fecha.%%20Antes%%20era%%20solo%%20el%%20torneo%%2C%%20y%%20por%%20eso%%20la%%0A--%%20fecha%%202%%20le%%20pisaba%%20la%%20planilla%%20a%%20la%%20fecha%%201.%%0Aalter%%20table%%20public.pospartido_planillas%%20drop%%20constraint%%20if%%20exists%%20pospartido_planillas_pkey%%3B%%0Aalter%%20table%%20public.pospartido_planillas%%20add%%20primary%%20key%%20%%28torneo_num%%2C%%20jornada%%29%%3B%%0A%%0Aalter%%20table%%20public.pospartido_planillas%%20disable%%20row%%20level%%20security%%3B%%0Agrant%%20select%%2C%%20insert%%2C%%20update%%2C%%20delete%%20on%%20public.pospartido_planillas%%20to%%20anon%%2C%%20authenticated%%3B%%0A%%0Anotify%%20pgrst%%2C%%20%%27reload%%20schema%%27%%3B%%0A%%0A--%%20Abajo%%20debe%%20salir%%20un%%20cuadro%%20con%%20la%%20palabra%%20LISTO%%20en%%20las%%20tres%%20filas.%%0Aselect%%20%%27tabla%%20pospartido_planillas%%27%%20as%%20casilla%%2C%%0A%%20%%20%%20%%20%%20%%20%%20case%%20when%%20exists%%20%%28select%%201%%20from%%20information_schema.tables%%0A%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20where%%20table_name%%3D%%27pospartido_planillas%%27%%29%%20then%%20%%27LISTO%%27%%20else%%20%%27FALTA%%27%%20end%%20as%%20resultado%%0Aunion%%20all%%20select%%20%%27casilla%%20jornada%%27%%2C%%0A%%20%%20%%20%%20%%20%%20%%20case%%20when%%20exists%%20%%28select%%201%%20from%%20information_schema.columns%%0A%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20where%%20table_name%%3D%%27pospartido_planillas%%27%%20and%%20column_name%%3D%%27jornada%%27%%29%%20then%%20%%27LISTO%%27%%20else%%20%%27FALTA%%27%%20end%%0Aunion%%20all%%20select%%20%%27llave%%20torneo%%20%%2B%%20fecha%%27%%2C%%0A%%20%%20%%20%%20%%20%%20%%20case%%20when%%20exists%%20%%28select%%201%%20from%%20information_schema.key_column_usage%%0A%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20where%%20table_name%%3D%%27pospartido_planillas%%27%%20and%%20column_name%%3D%%27jornada%%27%%0A%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20and%%20constraint_name%%20like%%20%%27%%25pkey%%25%%27%%29%%20then%%20%%27LISTO%%27%%20else%%20%%27FALTA%%27%%20end%%3B"

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
echo      1. Si Chrome le pregunta si traduce la pagina, diga NO.
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
echo    Abajo debe salir un CUADRO con tres filas, asi:
echo.
echo         casilla                      resultado
echo         tabla pospartido_planillas   LISTO
echo         casilla jornada              LISTO
echo         llave torneo + fecha         LISTO
echo.
echo    Si las tres dicen LISTO, ya quedo. Vuelva a la plataforma,
echo    entre a POSPARTIDO y oprima CTRL + F5.
echo.
echo    Si alguna dice FALTA, o sale un mensaje rojo, tome un
echo    pantallazo de la pantalla de Chrome y enviemelo.
echo  ------------------------------------------------------------
echo.
pause

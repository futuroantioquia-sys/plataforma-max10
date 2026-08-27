@echo off
chcp 65001 >nul
title ARREGLAR LA BASE - valor del torneo y banco pospartido
color 0A
mode con: cols=78 lines=44

echo.
echo  ============================================================
echo    ARREGLAR LA BASE  -  se corre UNA sola vez
echo  ============================================================
echo.
echo  Arregla DOS cosas de una:
echo.
echo    1. TORNEOS Y COMPETENCIAS
echo       Le falta la casilla VALOR DEL TORNEO. Por eso al
echo       escribir un precio sale el letrero rojo que dice
echo       "Could not find the 'valor' column".
echo.
echo    2. BANCO POSPARTIDO
echo       Para que un torneo guarde FECHA 1, FECHA 2, FECHA 3...
echo       y no se pisen entre ellas.
echo.
echo  NO borra nada de lo que ya este guardado.
echo.

set "URL=https://supabase.com/dashboard/project/fykdyalpuydkwfjqguip/sql/new?content=--%%20ARREGLO%%20DE%%20LA%%20BASE%%20-%%2027%%2F08%%2F2026%%0A--%%20Dos%%20cosas%%20que%%20le%%20faltan%%20a%%20la%%20base%%20para%%20que%%20la%%20plataforma%%20funcione%%20completa.%%0A--%%20Correr%%20esto%%20no%%20borra%%20NADA%%20de%%20lo%%20que%%20ya%%20este%%20guardado.%%0A%%0A--%%201.%%20TORNEOS%%20Y%%20COMPETENCIAS%%3A%%20la%%20casilla%%20VALOR%%20DEL%%20TORNEO.%%0A--%%20%%20%%20%%20La%%20tabla%%20se%%20creo%%20antes%%20de%%20que%%20existiera%%20esa%%20columna%%2C%%20por%%20eso%%20al%%20escribir%%0A--%%20%%20%%20%%20un%%20precio%%20salia%%20el%%20error%%20PGRST204.%%0Aalter%%20table%%20public.torneos_cuadro%%20add%%20column%%20if%%20not%%20exists%%20valor%%20numeric%%20not%%20null%%20default%%200%%3B%%0A%%0A--%%202.%%20BANCO%%20POSPARTIDO%%3A%%20un%%20torneo%%20debe%%20poder%%20guardar%%20muchas%%20fechas.%%0A--%%20%%20%%20%%20Antes%%20la%%20llave%%20era%%20solo%%20el%%20torneo%%2C%%20y%%20la%%20fecha%%202%%20le%%20pisaba%%20la%%201.%%0Acreate%%20table%%20if%%20not%%20exists%%20public.pospartido_planillas%%20%%28%%0Atorneo_num%%20text%%20not%%20null%%2C%%0Ajornada%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Afecha%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Allegar%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Arival%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Agoles_nos%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Agoles_ellos%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Aautogoles%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Afilas%%20jsonb%%20not%%20null%%20default%%20%%27%%5B%%5D%%27%%3A%%3Ajsonb%%2C%%0Aactualizada_en%%20timestamptz%%20not%%20null%%20default%%20now%%28%%29%%29%%3B%%0A%%0Aalter%%20table%%20public.pospartido_planillas%%20add%%20column%%20if%%20not%%20exists%%20jornada%%20text%%20not%%20null%%20default%%20%%27%%27%%3B%%0Aalter%%20table%%20public.pospartido_planillas%%20add%%20column%%20if%%20not%%20exists%%20filas%%20jsonb%%20not%%20null%%20default%%20%%27%%5B%%5D%%27%%3A%%3Ajsonb%%3B%%0Aalter%%20table%%20public.pospartido_planillas%%20add%%20column%%20if%%20not%%20exists%%20autogoles%%20text%%20not%%20null%%20default%%20%%27%%27%%3B%%0Aalter%%20table%%20public.pospartido_planillas%%20add%%20column%%20if%%20not%%20exists%%20actualizada_en%%20timestamptz%%20not%%20null%%20default%%20now%%28%%29%%3B%%0A%%0Aalter%%20table%%20public.pospartido_planillas%%20drop%%20constraint%%20if%%20exists%%20pospartido_planillas_pkey%%3B%%0Aalter%%20table%%20public.pospartido_planillas%%20add%%20primary%%20key%%20%%28torneo_num%%2C%%20jornada%%29%%3B%%0A%%0Aalter%%20table%%20public.pospartido_planillas%%20disable%%20row%%20level%%20security%%3B%%0Agrant%%20select%%2C%%20insert%%2C%%20update%%2C%%20delete%%20on%%20public.pospartido_planillas%%20to%%20anon%%2C%%20authenticated%%3B%%0Agrant%%20select%%2C%%20insert%%2C%%20update%%2C%%20delete%%20on%%20public.torneos_cuadro%%20to%%20anon%%2C%%20authenticated%%3B%%0A%%0A--%%203.%%20Avisarle%%20a%%20la%%20plataforma%%20que%%20la%%20base%%20cambio.%%0Anotify%%20pgrst%%2C%%20%%27reload%%20schema%%27%%3B%%0A%%0A--%%20Abajo%%20debe%%20salir%%20un%%20cuadro%%20con%%20la%%20palabra%%20LISTO%%20en%%20las%%20tres%%20filas.%%0Aselect%%20%%27valor%%20del%%20torneo%%27%%20as%%20casilla%%2C%%0A%%20%%20%%20%%20%%20%%20%%20case%%20when%%20exists%%20%%28select%%201%%20from%%20information_schema.columns%%0A%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20where%%20table_name%%3D%%27torneos_cuadro%%27%%20and%%20column_name%%3D%%27valor%%27%%29%%20then%%20%%27LISTO%%27%%20else%%20%%27FALTA%%27%%20end%%20as%%20resultado%%0Aunion%%20all%%20select%%20%%27casilla%%20jornada%%27%%2C%%0A%%20%%20%%20%%20%%20%%20%%20case%%20when%%20exists%%20%%28select%%201%%20from%%20information_schema.columns%%0A%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20where%%20table_name%%3D%%27pospartido_planillas%%27%%20and%%20column_name%%3D%%27jornada%%27%%29%%20then%%20%%27LISTO%%27%%20else%%20%%27FALTA%%27%%20end%%0Aunion%%20all%%20select%%20%%27llave%%20torneo%%20%%2B%%20fecha%%27%%2C%%0A%%20%%20%%20%%20%%20%%20%%20case%%20when%%20exists%%20%%28select%%201%%20from%%20information_schema.key_column_usage%%0A%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20where%%20table_name%%3D%%27pospartido_planillas%%27%%20and%%20column_name%%3D%%27jornada%%27%%0A%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20and%%20constraint_name%%20like%%20%%27%%25pkey%%25%%27%%29%%20then%%20%%27LISTO%%27%%20else%%20%%27FALTA%%27%%20end%%3B"

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
echo         casilla                 resultado
echo         valor del torneo        LISTO
echo         casilla jornada         LISTO
echo         llave torneo + fecha    LISTO
echo.
echo    Si las tres dicen LISTO, ya quedo. Vuelva a la plataforma
echo    y oprima CTRL + F5.
echo.
echo    Si alguna dice FALTA, o sale un mensaje rojo, tome un
echo    pantallazo de la pantalla de Chrome y enviemelo.
echo  ------------------------------------------------------------
echo.
pause

@echo off
chcp 65001 >nul
title TORNEOS Y COMPETENCIAS - Preparar la tabla
color 0A
mode con: cols=78 lines=40

echo.
echo  ============================================================
echo    TORNEOS Y COMPETENCIAS - Preparar la tabla
echo  ============================================================
echo.
echo  Se puede correr las veces que sea. Si la tabla ya existe no
echo  le borra nada: solo le agrega la casilla que le falte.
echo.

set "URL=https://supabase.com/dashboard/project/fykdyalpuydkwfjqguip/sql/new?content=create%%20table%%20if%%20not%%20exists%%20public.torneos_cuadro%%20%%28%%0Aid%%20text%%20primary%%20key%%2C%%0Aorden%%20int%%20not%%20null%%20default%%200%%2C%%0Atorneo%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Aprograma%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Acategoria%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Anombre%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Aformador%%20text%%20not%%20null%%20default%%20%%27%%27%%2C%%0Avalor%%20bigint%%20not%%20null%%20default%%200%%2C%%0Acreado_en%%20timestamptz%%20not%%20null%%20default%%20now%%28%%29%%29%%3B%%0A%%0Aalter%%20table%%20public.torneos_cuadro%%20add%%20column%%20if%%20not%%20exists%%20orden%%20int%%20not%%20null%%20default%%200%%3B%%0Aalter%%20table%%20public.torneos_cuadro%%20add%%20column%%20if%%20not%%20exists%%20formador%%20text%%20not%%20null%%20default%%20%%27%%27%%3B%%0Aalter%%20table%%20public.torneos_cuadro%%20add%%20column%%20if%%20not%%20exists%%20valor%%20bigint%%20not%%20null%%20default%%200%%3B%%0A%%0Aalter%%20table%%20public.torneos_cuadro%%20disable%%20row%%20level%%20security%%3B%%0Agrant%%20select%%2C%%20insert%%2C%%20update%%2C%%20delete%%20on%%20public.torneos_cuadro%%20to%%20anon%%2C%%20authenticated%%3B%%0A%%0Anotify%%20pgrst%%2C%%20%%27reload%%20schema%%27%%3B%%0A%%0A--%%20Abajo%%20debe%%20salir%%20un%%20cuadro%%20con%%20la%%20palabra%%20LISTO%%20en%%20las%%20tres%%20filas.%%0Aselect%%20%%27tabla%%20torneos_cuadro%%27%%20as%%20casilla%%2C%%0A%%20%%20%%20%%20%%20%%20%%20case%%20when%%20exists%%20%%28select%%201%%20from%%20information_schema.tables%%0A%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20where%%20table_name%%3D%%27torneos_cuadro%%27%%29%%20then%%20%%27LISTO%%27%%20else%%20%%27FALTA%%27%%20end%%20as%%20resultado%%0Aunion%%20all%%20select%%20%%27casilla%%20formador%%27%%2C%%0A%%20%%20%%20%%20%%20%%20%%20case%%20when%%20exists%%20%%28select%%201%%20from%%20information_schema.columns%%0A%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20where%%20table_name%%3D%%27torneos_cuadro%%27%%20and%%20column_name%%3D%%27formador%%27%%29%%20then%%20%%27LISTO%%27%%20else%%20%%27FALTA%%27%%20end%%0Aunion%%20all%%20select%%20%%27casilla%%20valor%%27%%2C%%0A%%20%%20%%20%%20%%20%%20%%20case%%20when%%20exists%%20%%28select%%201%%20from%%20information_schema.columns%%0A%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20%%20where%%20table_name%%3D%%27torneos_cuadro%%27%%20and%%20column_name%%3D%%27valor%%27%%29%%20then%%20%%27LISTO%%27%%20else%%20%%27FALTA%%27%%20end%%3B"

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
echo    Abajo debe salir un CUADRO con tres filas, asi:
echo.
echo         casilla                 resultado
echo         tabla torneos_cuadro    LISTO
echo         casilla formador        LISTO
echo         casilla valor           LISTO
echo.
echo    Si las tres dicen LISTO, ya quedo. Vuelva a la plataforma,
echo    entre a TORNEOS Y COMPETENCIAS y oprima F5.
echo.
echo    Si alguna dice FALTA, o sale un mensaje rojo, tome un
echo    pantallazo de la pantalla de Chrome y enviemelo.
echo  ------------------------------------------------------------
echo.
pause

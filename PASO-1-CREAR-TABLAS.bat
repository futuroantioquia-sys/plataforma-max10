@echo off
title PASO 1 - Crear las tablas de configuracion
color 0A
mode con: cols=80 lines=36

echo.
echo  ============================================================
echo    PASO 1 de 2  -  CREAR LAS TABLAS DE CONFIGURACION
echo  ============================================================
echo.
echo  Esto se hace UNA SOLA VEZ. No hay que copiar ni pegar nada:
echo  el SQL ya va escrito. Usted solo lo manda a correr.
echo.
echo  Crea las dos tablas que faltan en la base de datos buena:
echo     - config_cobro      (Gestion - Botones de Cobro)
echo     - config_valoracion (Gestion de Valoracion)
echo.
echo  Si alguna ya existe, no le pasa nada: se deja como esta.
echo.

set "CHROME="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

set "URL=https://supabase.com/dashboard/project/fykdyalpuydkwfjqguip/sql/new?content=create%%20table%%20if%%20not%%20exists%%20public.config_cobro%%20%%28%%0A%%20%%20id%%20text%%20primary%%20key%%2C%%0A%%20%%20data%%20jsonb%%20not%%20null%%20default%%20%%27%%7B%%7D%%27%%3A%%3Ajsonb%%2C%%0A%%20%%20updated_at%%20timestamptz%%20not%%20null%%20default%%20now%%28%%29%%29%%3B%%0A%%0Acreate%%20table%%20if%%20not%%20exists%%20public.config_valoracion%%20%%28%%0A%%20%%20id%%20text%%20primary%%20key%%2C%%0A%%20%%20data%%20jsonb%%20not%%20null%%20default%%20%%27%%7B%%7D%%27%%3A%%3Ajsonb%%2C%%0A%%20%%20updated_at%%20timestamptz%%20not%%20null%%20default%%20now%%28%%29%%29%%3B%%0A%%0Ainsert%%20into%%20public.config_cobro%%20%%28id%%2C%%20data%%29%%20values%%20%%28%%27botones%%27%%2C%%20%%27%%7B%%7D%%27%%3A%%3Ajsonb%%29%%0Aon%%20conflict%%20%%28id%%29%%20do%%20nothing%%3B%%0A%%0Ainsert%%20into%%20public.config_valoracion%%20%%28id%%2C%%20data%%29%%20values%%0A%%20%%20%%28%%27descripciones%%27%%2C%%20%%27%%7B%%7D%%27%%3A%%3Ajsonb%%29%%2C%%20%%28%%27meta%%27%%2C%%20%%27%%7B%%7D%%27%%3A%%3Ajsonb%%29%%2C%%20%%28%%27categorias%%27%%2C%%20%%27%%7B%%7D%%27%%3A%%3Ajsonb%%29%%0Aon%%20conflict%%20%%28id%%29%%20do%%20nothing%%3B%%0A%%0Aalter%%20table%%20public.config_cobro%%20%%20%%20%%20%%20%%20disable%%20row%%20level%%20security%%3B%%0Aalter%%20table%%20public.config_valoracion%%20disable%%20row%%20level%%20security%%3B%%0A%%0Agrant%%20select%%2C%%20insert%%2C%%20update%%20on%%20public.config_cobro%%20%%20%%20%%20%%20%%20to%%20anon%%2C%%20authenticated%%3B%%0Agrant%%20select%%2C%%20insert%%2C%%20update%%20on%%20public.config_valoracion%%20to%%20anon%%2C%%20authenticated%%3B%%0A"

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
echo      1. Si Chrome le pregunta si TRADUCE la pagina, diga que NO.
echo         Si la traduce, la pagina se daNa y toca recargarla.
echo.
echo      2. Haga UN CLIC encima del texto del SQL, el de colores.
echo         Debe quedar una rayita parpadeando ahi.
echo.
echo      3. Oprima  CTRL + ENTER  (las dos teclas al tiempo).
echo         O el boton verde RUN, abajo a la derecha. Es lo mismo.
echo.
echo      4. Abajo debe responder:  Success. No rows returned
echo  ------------------------------------------------------------
echo.
echo  Cuando diga Success, cierre esta ventana y haga doble clic en
echo  PASO-2-PASAR-TEXTOS-VALORACION.bat
echo.
pause

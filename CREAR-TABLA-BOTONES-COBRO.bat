@echo off
chcp 65001 >nul
title BOTONES DE COBRO - Crear la tabla (una sola vez)
color 0A
mode con: cols=78 lines=34

echo.
echo  ============================================================
echo    BOTONES DE COBRO - Crear la tabla en la base de datos
echo  ============================================================
echo.
echo  Esto se hace UNA SOLA VEZ. No hay que copiar ni pegar nada:
echo  el SQL ya va escrito. Usted solo lo manda a correr.
echo.

set "URL=https://supabase.com/dashboard/project/fykdyalpuydkwfjqguip/sql/new?content=create%%20table%%20if%%20not%%20exists%%20public.config_cobro%%20%%28%%0Aid%%20text%%20primary%%20key%%2C%%0Adata%%20jsonb%%20not%%20null%%20default%%20%%27%%7B%%7D%%27%%3A%%3Ajsonb%%2C%%0Aupdated_at%%20timestamptz%%20not%%20null%%20default%%20now%%28%%29%%29%%3B%%0A%%0Ainsert%%20into%%20public.config_cobro%%20%%28id%%2C%%20data%%29%%0Avalues%%20%%28%%27botones%%27%%2C%%20%%27%%7B%%7D%%27%%3A%%3Ajsonb%%29%%0Aon%%20conflict%%20%%28id%%29%%20do%%20nothing%%3B%%0A%%0Aalter%%20table%%20public.config_cobro%%20disable%%20row%%20level%%20security%%3B%%0Agrant%%20select%%2C%%20insert%%2C%%20update%%20on%%20public.config_cobro%%20to%%20anon%%2C%%20authenticated%%3B"

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
echo.
echo      4. Abajo debe responder:  Success. No rows returned
echo.
echo    Si prefiere el boton: es el verde que dice RUN, abajo a la
echo    derecha del cuadro del SQL. Hace lo mismo.
echo  ------------------------------------------------------------
echo.
echo  Cuando diga Success, vuelva a la plataforma, oprima F5 y ya
echo  puede guardar en  Gestion - Botones de Cobro.
echo.
pause

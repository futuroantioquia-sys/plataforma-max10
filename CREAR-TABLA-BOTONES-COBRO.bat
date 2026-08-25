@echo off
chcp 65001 >nul
title BOTONES DE COBRO - Crear la tabla (1 clic)
color 0A

echo.
echo  ============================================================
echo    BOTONES DE COBRO - Abriendo Supabase CON EL SQL YA ESCRITO
echo  ============================================================
echo.
echo  No tiene que copiar ni pegar nada.
echo  Solo va a oprimir el boton verde CORRER.
echo.

set "URL=https://supabase.com/dashboard/project/fykdyalpuydkwfjqguip/sql/new?content=create%%20table%%20if%%20not%%20exists%%20public.config_cobro%%20%%28%%0Aid%%20text%%20primary%%20key%%2C%%0Adata%%20jsonb%%20not%%20null%%20default%%20%%27%%7B%%7D%%27%%3A%%3Ajsonb%%2C%%0Aupdated_at%%20timestamptz%%20not%%20null%%20default%%20now%%28%%29%%29%%3B%%0A%%0Ainsert%%20into%%20public.config_cobro%%20%%28id%%2C%%20data%%29%%0Avalues%%20%%28%%27botones%%27%%2C%%20%%27%%7B%%7D%%27%%3A%%3Ajsonb%%29%%0Aon%%20conflict%%20%%28id%%29%%20do%%20nothing%%3B%%0A%%0Aalter%%20table%%20public.config_cobro%%20disable%%20row%%20level%%20security%%3B%%0Agrant%%20select%%2C%%20insert%%2C%%20update%%20on%%20public.config_cobro%%20to%%20anon%%2C%%20authenticated%%3B"

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
echo      Solo oprima el boton verde  CORRER  (arriba a la derecha).
echo.
echo    Debe responder:  Success. No rows returned
echo  ------------------------------------------------------------
echo.
echo  Esto solo se hace UNA VEZ. Despues entre a la plataforma,
echo  Gestion - Botones de Cobro, y ya puede guardar.
echo.
pause

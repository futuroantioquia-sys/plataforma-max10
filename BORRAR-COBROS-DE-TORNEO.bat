@echo off
chcp 65001 >nul
title BORRAR LOS COBROS DE TORNEO - una sola vez
color 0E
mode con: cols=78 lines=42

echo.
echo  ============================================================
echo    BORRAR LOS COBROS DE TORNEO DE TODOS LOS DEPORTISTAS
echo  ============================================================
echo.
echo  Esto borra los cobros que salen ABAJO DEL ESTADO DE CUENTA,
echo  en Otros pagos, marcados como TORNEO.
echo.
echo  NO se tocan:
echo     - Los implementos (guayos, uniformes, etc).
echo     - Las mensualidades ni la matricula.
echo     - Las columnas TORNEO 1 a 4 de Total Afiliados.
echo.
echo  ANTES DE BORRAR se guarda una COPIA de todo lo que se va a
echo  borrar, en una tabla aparte. Si se necesita, se puede volver
echo  a poner.
echo.
echo  ------------------------------------------------------------
echo    OJO: si algun torneo ya estaba PAGADO, tambien se borra.
echo    El informe del final le dice cuantos eran.
echo  ------------------------------------------------------------
echo.
pause

set "URL=https://supabase.com/dashboard/project/fykdyalpuydkwfjqguip/sql/new?content=--%%20BORRAR%%20LOS%%20COBROS%%20DE%%20TORNEO%%20DE%%20TODOS%%20LOS%%20DEPORTISTAS%%0A--%%20%%28los%%20que%%20salen%%20abajo%%20del%%20estado%%20de%%20cuenta%%2C%%20en%%20%%22Otros%%20pagos%%22%%29%%0A--%%0A--%%20PASO%%201%%3A%%20COPIA%%20DE%%20SEGURIDAD.%%20Nada%%20se%%20borra%%20sin%%20quedar%%20guardado%%20antes.%%0Acreate%%20table%%20if%%20not%%20exists%%20public.respaldo_torneos_20260826%%20as%%0Aselect%%20%%2A%%20from%%20public.otros_pagos%%20where%%20lower%%28tipo%%29%%20%%3D%%20%%27torneo%%27%%3B%%0A%%0A--%%20PASO%%202%%3A%%20BORRAR.%%20Solo%%20los%%20de%%20tipo%%20TORNEO.%%20Los%%20implementos%%20NO%%20se%%20tocan.%%0Adelete%%20from%%20public.otros_pagos%%20where%%20lower%%28tipo%%29%%20%%3D%%20%%27torneo%%27%%3B%%0A%%0A--%%20PASO%%203%%3A%%20EL%%20INFORME.%%20Abajo%%20sale%%20un%%20cuadro%%20con%%20estas%%20cuatro%%20cifras.%%0Aselect%%0A%%20%%20%%28select%%20count%%28%%2A%%29%%20from%%20public.respaldo_torneos_20260826%%29%%0A%%20%%20%%20%%20as%%20torneos_guardados_en_la_copia%%2C%%0A%%20%%20%%28select%%20count%%28%%2A%%29%%20from%%20public.respaldo_torneos_20260826%%20where%%20estado%%20%%3D%%20%%27PAG%%C3%%93%%27%%29%%0A%%20%%20%%20%%20as%%20de_esos_ya_estaban_pagados%%2C%%0A%%20%%20%%28select%%20count%%28%%2A%%29%%20from%%20public.otros_pagos%%20where%%20lower%%28tipo%%29%%20%%3D%%20%%27torneo%%27%%29%%0A%%20%%20%%20%%20as%%20torneos_que_quedan%%2C%%0A%%20%%20%%28select%%20count%%28%%2A%%29%%20from%%20public.otros_pagos%%29%%0A%%20%%20%%20%%20as%%20otros_pagos_que_quedan%%3B"

set "CHROME="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if defined CHROME (
  start "" "%CHROME%" --new-window --start-maximized "%URL%"
) else (
  start "" "%URL%"
)

echo.
echo  Se abrio Chrome con el SQL ya escrito.
echo.
echo    1. Si le pregunta si traduce la pagina, diga que NO.
echo    2. Haga UN CLIC encima del texto de colores.
echo    3. Oprima  CTRL + ENTER.
echo.
echo  Abajo va a salir un cuadro con cuatro cifras:
echo.
echo     torneos_guardados_en_la_copia    <- lo que se respaldo
echo     de_esos_ya_estaban_pagados       <- ojo con este
echo     torneos_que_quedan               <- debe decir 0
echo     otros_pagos_que_quedan           <- los implementos
echo.
echo  Cuando quede en 0, vuelva a la plataforma y oprima F5.
echo  Ya puede volver a cargar los torneos desde cero.
echo.
pause

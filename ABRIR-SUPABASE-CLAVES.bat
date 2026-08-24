@echo off
chcp 65001 >nul
title Abrir Supabase y el archivo de claves
set RAIZ=C:\Users\Lenovo\Claude\Projects\Plataforma max 100
cls
echo.
echo  ============================================================
echo    DEVOLVER LAS CLAVES DE LOS PROFES
echo  ============================================================
echo.
echo  Le voy a abrir DOS ventanas:
echo.
echo    1) El Bloc de notas con el archivo de las claves
echo    2) Supabase, en la pantalla donde se pega
echo.
echo  ------------------------------------------------------------
echo   QUE HACER, EN ORDEN:
echo  ------------------------------------------------------------
echo.
echo   PASO 1  En el BLOC DE NOTAS:
echo             oprima  Ctrl + E   (selecciona todo)
echo             oprima  Ctrl + C   (copia)
echo.
echo   PASO 2  En el NAVEGADOR (Supabase):
echo             si le pide entrar, use el boton
echo             "Continue with GitHub"
echo.
echo   PASO 3  Haga clic en el recuadro grande del centro y
echo             oprima  Ctrl + V   (pega)
echo.
echo   PASO 4  Oprima el boton verde  RUN  (abajo a la derecha)
echo             o las teclas  Ctrl + Enter
echo.
echo   PASO 5  Abajo sale una lista de los 24 profes.
echo             Todos deben decir:  cifrada OK
echo             Tome un pantallazo y mandemelo.
echo.
echo  ------------------------------------------------------------
echo.
pause

start "" notepad "%RAIZ%\DEVOLVER-CLAVES.sql"
timeout /t 2 >nul
start "" "https://supabase.com/dashboard/project/fykdyalpuydkwfjqguip/sql/new"

echo.
echo  Listo, ya se abrieron las dos ventanas.
echo  Si algo no le abre, avise.
echo.
pause

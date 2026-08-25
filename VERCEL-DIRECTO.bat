@echo off
REM ---------------------------------------------------------------
REM  Este boton habia quedado viejo: buscaba la carpeta del
REM  computador anterior (C:\Users\Lenovo\...) y ademas pedia el
REM  programa "vercel", que en este computador no esta instalado.
REM
REM  Ahora simplemente llama al boton bueno, que sube a GitHub y
REM  deja que Vercel publique solo. No hay que instalar nada.
REM ---------------------------------------------------------------
call "%~dp0SUBIR-AHORA.bat"

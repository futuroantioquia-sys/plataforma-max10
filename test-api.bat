@echo off
chcp 65001 >nul
echo Verificando API calidoso-login...
curl -s "https://plataforma-max10.vercel.app/api/calidoso-login?codigo=21187" > test-result.txt
echo Resultado guardado en test-result.txt
echo.
type test-result.txt
echo.
pause

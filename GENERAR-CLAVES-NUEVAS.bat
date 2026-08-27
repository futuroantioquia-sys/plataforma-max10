@echo off
chcp 65001 >nul
title GENERAR CLAVES NUEVAS - Futuro Antioquia
color 0A
mode con: cols=78 lines=40
cd /d "%~dp0"

echo.
echo  ============================================================
echo    GENERAR CLAVES NUEVAS
echo  ============================================================
echo.
echo  Esto arma cuatro claves nuevas, largas y al azar, AQUI en su
echo  computador. Nadie mas las ve: ni Claude, ni internet.
echo.
echo  Quedan escritas en el archivo  CLAVES-NUEVAS.txt  al lado de
echo  este programa. Ese archivo NO se sube a GitHub.
echo.
pause

powershell -NoProfile -Command ^
  "$ErrorActionPreference='Stop';" ^
  "function Nueva($n){ $b=New-Object byte[] $n; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ($b | ForEach-Object { '{0:x2}' -f $_ }) -join '' }" ^
  "$s=Nueva 32; $p=Nueva 12; $a=Nueva 4;" ^
  "$t=@();" ^
  "$t+='CLAVES NUEVAS - generadas el ' + (Get-Date -Format 'dd/MM/yyyy HH:mm');" ^
  "$t+='';" ^
  "$t+='COPIE CADA UNA EN: vercel.com -> su proyecto -> Settings ->';" ^
  "$t+='Environment Variables. Y las mismas en frontend\.env.local.';" ^
  "$t+='';" ^
  "$t+='SESSION_SECRET=' + $s;" ^
  "$t+='ADMIN_USER=ADMON';" ^
  "$t+='ADMIN_PASS=' + $p;" ^
  "$t+='AFILIACION_CODE=' + $a;" ^
  "$t+='';" ^
  "$t+='FALTA UNA MAS, esa se saca de Supabase (no se genera aqui):';" ^
  "$t+='SUPABASE_SERVICE_ROLE_KEY=  <- la nueva llave, despues de rotarla';" ^
  "$t+='';" ^
  "$t+='GUARDE ESTE ARCHIVO EN LUGAR SEGURO Y NO LO MANDE POR CHAT.';" ^
  "Set-Content -Path 'CLAVES-NUEVAS.txt' -Value $t -Encoding UTF8;" ^
  "Write-Host '  Listo: se creo CLAVES-NUEVAS.txt' -ForegroundColor Green"

echo.
echo  ------------------------------------------------------------
echo    AHORA HAGA ESTO:
echo.
echo     1. Abra el archivo  CLAVES-NUEVAS.txt  (esta aqui al lado).
echo.
echo     2. Copie cada linea en Vercel:
echo        vercel.com  ^>  su proyecto  ^>  Settings  ^>
echo        Environment Variables  ^>  Add New
echo.
echo     3. Copie las mismas en  frontend\.env.local
echo.
echo     4. AVISEME cuando esten puestas. Solo despues de eso se
echo        publica la version blindada: si se publica antes,
echo        NADIE va a poder entrar a la plataforma.
echo  ------------------------------------------------------------
echo.
pause

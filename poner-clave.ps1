$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$local = Join-Path $raiz 'frontend\.env.local'
$prod  = Join-Path $raiz 'frontend\.env.production'

Write-Host ''
Write-Host '=========================================================' -ForegroundColor Cyan
Write-Host '  PEGAR LA CLAVE ANON DEL PROYECTO NUEVO' -ForegroundColor Cyan
Write-Host '=========================================================' -ForegroundColor Cyan
Write-Host ''
Write-Host '  Se abrio Supabase en el navegador.'
Write-Host '  Busque el recuadro que dice   anon   public'
Write-Host '  y oprima el boton de copiar.'
Write-Host ''
Write-Host '  Luego vuelva aqui, haga CLIC DERECHO para pegar'
Write-Host '  y oprima Enter.'
Write-Host ''

$clave = Read-Host '  Clave anon'
$clave = $clave.Trim().Trim('"').Trim("'")

if ($clave -notmatch '^eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$') {
  Write-Host ''
  Write-Host '  ERROR: eso no parece una clave de Supabase.' -ForegroundColor Red
  Write-Host '  Debe empezar por  eyJ  y tener dos puntos adentro.'
  Write-Host '  No se cambio nada. Vuelva a intentarlo.'
  Write-Host ''
  Read-Host '  Enter para cerrar'
  exit 1
}

# A que proyecto pertenece la clave. La parte del medio del token
# es texto legible en base64: no se descifra nada.
$parte = $clave.Split('.')[1].Replace('-','+').Replace('_','/')
while ($parte.Length % 4) { $parte += '=' }
$datos = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parte)) | ConvertFrom-Json

Write-Host ''
Write-Host ("  Proyecto de esta clave : " + $datos.ref)
Write-Host ("  Tipo de clave          : " + $datos.role)
Write-Host ''

if ($datos.ref -ne 'fykdyalpuydkwfjqguip') {
  Write-Host '  ERROR: esa clave es de OTRO proyecto.' -ForegroundColor Red
  Write-Host '  Hace falta la del proyecto  fykdyalpuydkwfjqguip'
  Write-Host '  No se cambio nada.'
  Write-Host ''
  Read-Host '  Enter para cerrar'
  exit 1
}
if ($datos.role -ne 'anon') {
  Write-Host '  ERROR: esa NO es la clave anon.' -ForegroundColor Red
  Write-Host ('  Usted copio la clave  ' + $datos.role + '  y esa no va aqui.')
  Write-Host '  No se cambio nada.'
  Write-Host ''
  Read-Host '  Enter para cerrar'
  exit 1
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
$sello = Get-Date -Format 'yyyyMMdd-HHmm'

# ── Copia de seguridad de lo que habia ──────────────────────
foreach ($f in @($local, $prod)) {
  if (Test-Path $f) {
    Copy-Item $f ($f + '.viejo-' + $sello)
    Write-Host ('  Copia guardada: ' + (Split-Path $f -Leaf) + '.viejo-' + $sello) -ForegroundColor DarkGray
  }
}

# ── Rescatar la llave service_role que ya estaba bien ────────
$servicio = ''
if (Test-Path $local) {
  foreach ($l in [IO.File]::ReadAllLines($local, $utf8)) {
    if ($l -match '^\s*SUPABASE_SERVICE_ROLE_KEY\s*=\s*(\S+)') { $servicio = $Matches[1] }
  }
}
if ($servicio -eq '') {
  Write-Host ''
  Write-Host '  AVISO: no encontre SUPABASE_SERVICE_ROLE_KEY en el archivo.' -ForegroundColor Yellow
  Write-Host '  La dejo vacia; habra que ponerla a mano.'
  Write-Host ''
}

# ── Secreto de sesion: reutilizar el que haya, o crear uno ───
$secreto = ''
if (Test-Path $local) {
  foreach ($l in [IO.File]::ReadAllLines($local, $utf8)) {
    if ($l -match '^\s*SESSION_SECRET\s*=\s*(\S+)') { $secreto = $Matches[1] }
  }
}
if ($secreto -eq '') {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secreto = -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

# ── Escribir el .env.local nuevo ─────────────────────────────
$txt = @"
# =============================================================
#  VARIABLES LOCALES · Futuro Antioquia / MAX 10
#  Corregido el $(Get-Date -Format 'dd/MM/yyyy HH:mm').
#
#  Este archivo NO se sube a GitHub ni a Vercel: es solo de
#  este computador. Las variables de Vercel se configuran
#  aparte, en vercel.com -> Settings -> Environment Variables.
# =============================================================

# -- SUPABASE - proyecto NUEVO (el que esta en uso) -----------
# Dashboard: supabase.com/dashboard/project/fykdyalpuydkwfjqguip

NEXT_PUBLIC_SUPABASE_URL=https://fykdyalpuydkwfjqguip.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=$clave

# Llave maestra (service_role). SOLO servidor. Nunca NEXT_PUBLIC_.
SUPABASE_SERVICE_ROLE_KEY=$servicio

# -- APP ------------------------------------------------------
NEXT_PUBLIC_APP_URL=http://localhost:3000

# -- SESION ---------------------------------------------------
SESSION_SECRET=$secreto

# 1 = el login explica por que fallo. Util para probar aqui.
# En internet (Vercel) siempre 0.
LOGIN_DEBUG=0

# -- INGRESO (a proposito, sin definir) -----------------------
# ADMIN_USER, ADMIN_PASS, DIANA_USER, DIANA_PASS y
# AFILIACION_CODE se dejan SIN definir en este computador.
# Al faltar, la plataforma local entra con los valores de
# siempre, igual que hoy. Se configuran en Vercel, no aqui.
# Ver PASOS-SEGURIDAD.md, Paso 1.
"@
[IO.File]::WriteAllText($local, $txt, $utf8)
Write-Host ''
Write-Host '  OK  frontend\.env.local        reescrito' -ForegroundColor Green

# ── .env.production tambien apuntaba al proyecto viejo ───────
if (Test-Path $prod) {
  $p = [IO.File]::ReadAllText($prod, $utf8)
  $p = [Regex]::Replace($p, '(?m)^NEXT_PUBLIC_SUPABASE_URL=.*$', 'NEXT_PUBLIC_SUPABASE_URL=https://fykdyalpuydkwfjqguip.supabase.co')
  $p = [Regex]::Replace($p, '(?m)^NEXT_PUBLIC_SUPABASE_ANON_KEY=.*$', ('NEXT_PUBLIC_SUPABASE_ANON_KEY=' + $clave))
  [IO.File]::WriteAllText($prod, $p, $utf8)
  Write-Host '  OK  frontend\.env.production   actualizado' -ForegroundColor Green
}

Write-Host ''
Write-Host '=========================================================' -ForegroundColor Cyan
Write-Host '  LISTO. Ahora:' -ForegroundColor Cyan
Write-Host '=========================================================' -ForegroundColor Cyan
Write-Host ''
Write-Host '  1. Cierre la ventana negra del servidor si esta abierta.'
Write-Host '  2. Doble clic en  PRENDER-LOCAL.bat'
Write-Host '  3. Abra  http://localhost:3000  y mire el panel'
Write-Host '     "Visitantes de la plataforma": ya no debe marcar 0.'
Write-Host ''
Write-Host "  Si algo sale mal, las copias  .viejo-$sello"
Write-Host '  quedaron guardadas al lado de los archivos.'
Write-Host ''
Read-Host '  Enter para cerrar'

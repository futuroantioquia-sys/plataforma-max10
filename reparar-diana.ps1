# ---------------------------------------------------------------------------
#  reparar-diana.ps1  -  Revisa y repara el ingreso de un administrador.
#
#  Lee la llave maestra del archivo frontend\.env.local (la misma que ya usa
#  el servidor) y habla con la base de datos. NO guarda ninguna contrasena en
#  este archivo: la pide en pantalla en el momento.
#
#  Hecho el 26/08/2026 porque DIANA no podia entrar y el registro del servidor
#  decia que no existia ese usuario en la tabla.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$ruta = Join-Path $raiz 'frontend\.env.local'

Write-Host ''
Write-Host '  ============================================================'
Write-Host '    REVISAR Y REPARAR EL INGRESO DE UN ADMINISTRADOR'
Write-Host '  ============================================================'
Write-Host ''

if (-not (Test-Path $ruta)) {
  Write-Host '  No encontre el archivo de configuracion:' -ForegroundColor Red
  Write-Host "     $ruta"
  Write-Host ''
  Read-Host '  Oprima ENTER para cerrar'
  exit 1
}

$m = Select-String -Path $ruta -Pattern '^\s*SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.+)$'
if (-not $m) {
  Write-Host '  El archivo .env.local no tiene SUPABASE_SERVICE_ROLE_KEY.' -ForegroundColor Red
  Read-Host '  Oprima ENTER para cerrar'
  exit 1
}
$llave = $m.Matches[0].Groups[1].Value.Trim().Trim('"').Trim("'")

$SB = 'https://fykdyalpuydkwfjqguip.supabase.co'
$h  = @{ apikey = $llave; Authorization = "Bearer $llave" }

# ---- 1. Mostrar los administradores que hay hoy --------------------------
Write-Host '  Leyendo la lista de administradores...' -ForegroundColor Cyan
Write-Host ''
try {
  $lista = @(Invoke-RestMethod -Method Get -Headers $h -Uri "$SB/rest/v1/admins?select=id,usuario,nombre,tipo,clave&order=usuario")
} catch {
  Write-Host "  No pude leer la tabla: $($_.Exception.Message)" -ForegroundColor Red
  Read-Host '  Oprima ENTER para cerrar'
  exit 1
}

if ($lista.Count -eq 0) {
  Write-Host '  LA TABLA DE ADMINISTRADORES ESTA VACIA.' -ForegroundColor Yellow
  Write-Host '  Por eso no entra nadie salvo ADMON.'
} else {
  Write-Host ("  Hay {0} administrador(es):" -f $lista.Count) -ForegroundColor Green
  Write-Host ''
  Write-Host '     USUARIO            TIPO           NOMBRE                   CLAVE'
  foreach ($a in $lista) {
    $c = [string]$a.clave
    if ([string]::IsNullOrEmpty($c))  { $formato = 'SIN CLAVE' }
    elseif ($c.StartsWith('$2'))      { $formato = 'cifrada' }
    else                              { $formato = 'texto plano' }
    Write-Host ('     {0,-18} {1,-14} {2,-24} {3}' -f $a.usuario, $a.tipo, $a.nombre, $formato)
  }
}
Write-Host ''
Write-Host '  ------------------------------------------------------------'
Write-Host ''

# ---- 2. Preguntar a quien se repara --------------------------------------
$usuario = Read-Host '  Usuario a reparar (ENTER = DIANA)'
if ([string]::IsNullOrWhiteSpace($usuario)) { $usuario = 'DIANA' }
$usuario = $usuario.Trim().ToUpper()

$existente = $null
if ($lista.Count -gt 0) {
  $existente = $lista | Where-Object { ([string]$_.usuario).Trim().ToUpper() -eq $usuario } | Select-Object -First 1
}

Write-Host ''
if ($existente) {
  Write-Host ("  {0} SI existe. Se le va a cambiar la contrasena." -f $usuario) -ForegroundColor Green
} else {
  Write-Host ("  {0} NO existe en la tabla. Se va a CREAR." -f $usuario) -ForegroundColor Yellow
}

Write-Host ''
Write-Host '  Tipos:  1 = contabilidad   2 = deportivo   3 = acceso total'
$op = Read-Host '  Que tipo sera (ENTER = deja el que tiene)'
$op = $op.Trim()
if     ($op -eq '2') { $tipo = 'deportivo' }
elseif ($op -eq '3') { $tipo = 'total' }
elseif ($op -eq '1') { $tipo = 'contabilidad' }
elseif ($existente)  { $tipo = [string]$existente.tipo }
else                 { $tipo = 'contabilidad' }
if ([string]::IsNullOrWhiteSpace($tipo)) { $tipo = 'contabilidad' }

Write-Host ''
$c1 = Read-Host '  Contrasena nueva (minimo 8 caracteres)'
if ($c1.Length -lt 8) {
  Write-Host '  Muy corta. No se cambio nada.' -ForegroundColor Red
  Read-Host '  Oprima ENTER para cerrar'
  exit 1
}
$c2 = Read-Host '  Escribala otra vez'
if ($c1 -ne $c2) {
  Write-Host '  Las dos no coinciden. No se cambio nada.' -ForegroundColor Red
  Read-Host '  Oprima ENTER para cerrar'
  exit 1
}

$nombre = ''
if ($existente) { $nombre = [string]$existente.nombre }
if ([string]::IsNullOrWhiteSpace($nombre)) {
  $nombre = Read-Host '  Nombre para mostrar (ENTER = el usuario)'
  if ([string]::IsNullOrWhiteSpace($nombre)) { $nombre = $usuario }
}

# ---- 3. Guardar -----------------------------------------------------------
Write-Host ''
Write-Host '  Guardando...' -ForegroundColor Cyan
$hj = @{ apikey = $llave; Authorization = "Bearer $llave"; 'Content-Type' = 'application/json'; Prefer = 'return=minimal' }
try {
  if ($existente) {
    $cuerpo = @{ usuario = $usuario; nombre = $nombre; tipo = $tipo; clave = $c1 } | ConvertTo-Json -Compress
    $id = [string]$existente.id
    Invoke-RestMethod -Method Patch -Headers $hj -Uri "$SB/rest/v1/admins?id=eq.$id" -Body $cuerpo | Out-Null
  } else {
    $id = [guid]::NewGuid().ToString()
    $cuerpo = @{ id = $id; usuario = $usuario; nombre = $nombre; tipo = $tipo; clave = $c1 } | ConvertTo-Json -Compress
    Invoke-RestMethod -Method Post -Headers $hj -Uri "$SB/rest/v1/admins" -Body $cuerpo | Out-Null
  }
} catch {
  Write-Host "  No se pudo guardar: $($_.Exception.Message)" -ForegroundColor Red
  Read-Host '  Oprima ENTER para cerrar'
  exit 1
}

Write-Host ''
Write-Host '  ============================================================' -ForegroundColor Green
Write-Host ("   LISTO. {0} ya puede entrar, con tipo {1}." -f $usuario, $tipo) -ForegroundColor Green
Write-Host '  ============================================================' -ForegroundColor Green
Write-Host ''
Write-Host '  IMPORTANTE, hagalo enseguida:'
Write-Host '    La contrasena quedo guardada SIN CIFRAR, que es lo unico'
Write-Host '    que se puede hacer desde aqui. Entre como ADMON a'
Write-Host '    Gestion - Administradores, abra esa ficha y vuelva a'
Write-Host '    escribir la misma contrasena. Al guardar desde la app'
Write-Host '    queda cifrada, como debe ser.'
Write-Host ''
Read-Host '  Oprima ENTER para cerrar'

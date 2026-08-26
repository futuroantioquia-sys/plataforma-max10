# ---------------------------------------------------------------------------
#  borrar-torneos.ps1  -  Borra los cobros de TORNEO de todos los deportistas.
#
#  Son los que salen ABAJO DEL ESTADO DE CUENTA, en "Otros pagos", con el
#  simbolo del trofeo. NO toca implementos, ni mensualidades, ni matriculas.
#
#  Antes de borrar guarda TODO en un archivo .csv en esta misma carpeta.
#  Ese archivo es el respaldo: con el se puede volver a cargar si hiciera falta.
#
#  26/08/2026 - pedido de la direccion para volver a cargar los torneos de cero.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$ruta = Join-Path $raiz 'frontend\.env.local'

Write-Host ''
Write-Host '  ============================================================'
Write-Host '    BORRAR LOS COBROS DE TORNEO'
Write-Host '  ============================================================'
Write-Host ''

if (-not (Test-Path $ruta)) {
  Write-Host '  No encontre el archivo de configuracion:' -ForegroundColor Red
  Write-Host "     $ruta"
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

# ---- 1. Traer TODO otros_pagos -------------------------------------------
Write-Host '  Leyendo los cobros...' -ForegroundColor Cyan
try {
  $todos = @(Invoke-RestMethod -Method Get -Headers $h `
    -Uri "$SB/rest/v1/otros_pagos?select=id,deportista_id,descripcion,tipo,valor,fecha,estado&limit=20000")
} catch {
  Write-Host "  No pude leer la tabla: $($_.Exception.Message)" -ForegroundColor Red
  Read-Host '  Oprima ENTER para cerrar'
  exit 1
}

$torneos = @($todos | Where-Object { ([string]$_.tipo).ToLower().Contains('torneo') })
$otros   = @($todos | Where-Object { -not ([string]$_.tipo).ToLower().Contains('torneo') })

if ($torneos.Count -eq 0) {
  Write-Host ''
  Write-Host '  No hay ningun cobro de torneo. No hay nada que borrar.' -ForegroundColor Green
  Read-Host '  Oprima ENTER para cerrar'
  exit 0
}

$pagados   = @($torneos | Where-Object { ([string]$_.estado).ToUpper().StartsWith('PAG') })
$total     = ($torneos | Measure-Object -Property valor -Sum).Sum
$totalPag  = 0
if ($pagados.Count -gt 0) { $totalPag = ($pagados | Measure-Object -Property valor -Sum).Sum }
$deps      = @($torneos | ForEach-Object { $_.deportista_id } | Sort-Object -Unique).Count

Write-Host ''
Write-Host '  ESTO ES LO QUE SE VA A BORRAR:' -ForegroundColor Yellow
Write-Host ''
Write-Host ("     Cobros de torneo .......... {0}" -f $torneos.Count)
Write-Host ("     Deportistas afectados ..... {0}" -f $deps)
Write-Host ("     Suman ..................... {0:N0} pesos" -f $total)
Write-Host ''
if ($pagados.Count -gt 0) {
  Write-Host ("     OJO: {0} ya estaban PAGADOS ({1:N0} pesos)." -f $pagados.Count, $totalPag) -ForegroundColor Red
  Write-Host '     Esas familias van a volver a aparecer debiendo lo que ya pagaron.' -ForegroundColor Red
} else {
  Write-Host '     Ninguno esta pagado. Borrarlos no hace perder ningun pago.' -ForegroundColor Green
}
Write-Host ''
Write-Host ("     No se tocan {0} implemento(s)." -f $otros.Count)
Write-Host ''
Write-Host '  Por torneo:'
$torneos | Group-Object descripcion | Sort-Object Count -Descending | Select-Object -First 15 | ForEach-Object {
  $s = ($_.Group | Measure-Object -Property valor -Sum).Sum
  Write-Host ('     {0,-42} {1,4} cobros   {2,12:N0}' -f $_.Name, $_.Count, $s)
}
Write-Host ''
Write-Host '  ------------------------------------------------------------'

# ---- 2. Respaldo en un archivo -------------------------------------------
$sello   = Get-Date -Format 'yyyyMMdd-HHmm'
$respaldo = Join-Path $raiz ("respaldo-torneos-$sello.csv")
try {
  $torneos | Select-Object id,deportista_id,descripcion,tipo,valor,fecha,estado |
    Export-Csv -Path $respaldo -NoTypeInformation -Encoding UTF8
  Write-Host ''
  Write-Host '  Respaldo guardado en:' -ForegroundColor Green
  Write-Host "     $respaldo"
} catch {
  Write-Host "  No pude guardar el respaldo: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host '  NO se borro nada.' -ForegroundColor Red
  Read-Host '  Oprima ENTER para cerrar'
  exit 1
}

# ---- 3. Confirmar ---------------------------------------------------------
Write-Host ''
Write-Host '  ------------------------------------------------------------'
Write-Host '  Para borrar, escriba la palabra   BORRAR   y oprima ENTER.'
Write-Host '  Cualquier otra cosa cancela y no se toca nada.'
Write-Host ''
$conf = Read-Host '  Escriba aqui'
if ($conf.Trim().ToUpper() -ne 'BORRAR') {
  Write-Host ''
  Write-Host '  Cancelado. No se borro nada.' -ForegroundColor Yellow
  Read-Host '  Oprima ENTER para cerrar'
  exit 0
}

# ---- 4. Borrar, de a 100 --------------------------------------------------
Write-Host ''
Write-Host '  Borrando...' -ForegroundColor Cyan
$ids  = @($torneos | ForEach-Object { [string]$_.id })
$hd   = @{ apikey = $llave; Authorization = "Bearer $llave"; Prefer = 'return=minimal' }
$hech = 0
try {
  for ($i = 0; $i -lt $ids.Count; $i += 100) {
    $fin  = [Math]::Min($i + 99, $ids.Count - 1)
    $lote = $ids[$i..$fin]
    $filtro = ($lote | ForEach-Object { '"' + $_ + '"' }) -join ','
    Invoke-RestMethod -Method Delete -Headers $hd -Uri "$SB/rest/v1/otros_pagos?id=in.($filtro)" | Out-Null
    $hech += $lote.Count
    Write-Host ("     {0} de {1}" -f $hech, $ids.Count)
  }
} catch {
  Write-Host "  Se detuvo con error: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host ("  Alcanzo a borrar {0}. El respaldo esta completo en el .csv." -f $hech) -ForegroundColor Yellow
  Read-Host '  Oprima ENTER para cerrar'
  exit 1
}

# ---- 5. Comprobar ---------------------------------------------------------
Start-Sleep -Milliseconds 600
try {
  $quedan = @(Invoke-RestMethod -Method Get -Headers $h `
    -Uri "$SB/rest/v1/otros_pagos?select=id,tipo&limit=20000")
  $quedanTorneo = @($quedan | Where-Object { ([string]$_.tipo).ToLower().Contains('torneo') }).Count
} catch { $quedanTorneo = -1 }

Write-Host ''
Write-Host '  ============================================================' -ForegroundColor Green
if ($quedanTorneo -eq 0) {
  Write-Host ("   LISTO. Se borraron {0} cobros de torneo." -f $hech) -ForegroundColor Green
  Write-Host '   No queda ninguno. Ya puede cargarlos de nuevo desde cero.' -ForegroundColor Green
} elseif ($quedanTorneo -gt 0) {
  Write-Host ("   Se borraron {0}, pero quedaron {1}." -f $hech, $quedanTorneo) -ForegroundColor Yellow
  Write-Host '   Vuelva a correr este archivo para terminar.' -ForegroundColor Yellow
} else {
  Write-Host ("   Se borraron {0}. No pude comprobar cuantos quedaron." -f $hech) -ForegroundColor Yellow
}
Write-Host '  ============================================================' -ForegroundColor Green
Write-Host ''
Write-Host '  Vuelva a la plataforma y oprima F5.'
Write-Host '  Guarde el archivo .csv del respaldo por si acaso.'
Write-Host ''
Read-Host '  Oprima ENTER para cerrar'

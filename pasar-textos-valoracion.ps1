# ─────────────────────────────────────────────────────────────────────────────
#  Pasa los textos de "Gestion de Valoracion" de la base VIEJA a la BUENA.
#
#  Hasta el 25/08/2026 el archivo valoracion-textos.ts seguia apuntando al
#  proyecto viejo de Supabase. Todo lo que el administrador editaba en Gestion
#  de Valoracion se guardaba alla, en una base que ya nadie mas leia.
#
#  Este script copia esas tres filas a la base buena. Es PRUDENTE: si en la
#  base buena ya hay algo escrito, NO lo pisa.
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$VIEJA_URL = 'https://gsovtgtrsqzoruvgmhed.supabase.co'
$VIEJA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdzb3Z0Z3Ryc3F6b3J1dmdtaGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NzQyNjUsImV4cCI6MjA5OTU1MDI2NX0.ZpLaLh-Y_ksfGInDLHeuzb8UG1r3stzjcqcyBUQ-uP4'

$BUENA_URL = 'https://fykdyalpuydkwfjqguip.supabase.co'
$BUENA_KEY = 'sb_publishable_r070aJtc2s6cP23mYqw6qA_4uJjk4o0'

$hVieja = @{ apikey = $VIEJA_KEY; Authorization = "Bearer $VIEJA_KEY" }
$hBuena = @{ apikey = $BUENA_KEY; Authorization = "Bearer $BUENA_KEY" }

function Vacio($d) {
  if ($null -eq $d) { return $true }
  $t = ($d | ConvertTo-Json -Depth 100 -Compress)
  return ($t -eq '{}' -or $t -eq 'null' -or $t -eq '')
}

Write-Host ''
Write-Host '  Leyendo los textos de la base vieja...' -ForegroundColor Cyan

try {
  $viejas = Invoke-RestMethod -Method Get -Headers $hVieja `
    -Uri "$VIEJA_URL/rest/v1/config_valoracion?select=id,data"
} catch {
  Write-Host ''
  Write-Host '  NO se pudo leer la base vieja.' -ForegroundColor Red
  Write-Host ('  Detalle: ' + $_.Exception.Message) -ForegroundColor DarkGray
  Write-Host ''
  Write-Host '  Revise que tenga internet y vuelva a intentar.'
  exit 1
}

if (-not $viejas -or $viejas.Count -eq 0) {
  Write-Host '  La base vieja no tiene nada que pasar. Nada que hacer.' -ForegroundColor Yellow
  exit 0
}

Write-Host ("  Encontradas {0} filas en la base vieja." -f $viejas.Count) -ForegroundColor Green
Write-Host ''

$copiadas = 0
$respetadas = 0
$fallidas = 0

foreach ($fila in $viejas) {
  $id = [string]$fila.id
  Write-Host ("  - {0}" -f $id) -NoNewline

  if (Vacio $fila.data) {
    Write-Host '   ... en la vieja esta vacia, se salta.' -ForegroundColor DarkGray
    continue
  }

  # ¿Que hay ya en la base buena?
  $actual = $null
  try {
    $actual = Invoke-RestMethod -Method Get -Headers $hBuena `
      -Uri ("$BUENA_URL/rest/v1/config_valoracion?id=eq.$id&select=data")
  } catch {
    Write-Host '   ... NO se pudo consultar la base buena.' -ForegroundColor Red
    Write-Host ('      Detalle: ' + $_.Exception.Message) -ForegroundColor DarkGray
    Write-Host '      ¿Ya corrio el PASO 1? La tabla config_valoracion debe existir.' -ForegroundColor Yellow
    $fallidas++
    continue
  }

  if ($actual -and $actual.Count -gt 0 -and -not (Vacio $actual[0].data)) {
    Write-Host '   ... la base buena YA tiene texto propio. No se pisa.' -ForegroundColor Yellow
    $respetadas++
    continue
  }

  $cuerpo = @{
    id         = $id
    data       = $fila.data
    updated_at = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  } | ConvertTo-Json -Depth 100 -Compress

  try {
    Invoke-RestMethod -Method Post -Uri "$BUENA_URL/rest/v1/config_valoracion" `
      -Headers ($hBuena + @{ 'Content-Type' = 'application/json; charset=utf-8'
                             'Prefer'       = 'resolution=merge-duplicates,return=minimal' }) `
      -Body ([Text.Encoding]::UTF8.GetBytes($cuerpo)) | Out-Null
    Write-Host '   ... COPIADA.' -ForegroundColor Green
    $copiadas++
  } catch {
    Write-Host '   ... NO se pudo escribir.' -ForegroundColor Red
    Write-Host ('      Detalle: ' + $_.Exception.Message) -ForegroundColor DarkGray
    $fallidas++
  }
}

Write-Host ''
Write-Host '  ------------------------------------------------------------'
Write-Host ("   Copiadas: {0}   Ya tenian texto: {1}   Con error: {2}" -f $copiadas, $respetadas, $fallidas)
Write-Host '  ------------------------------------------------------------'
Write-Host ''
if ($fallidas -gt 0) {
  Write-Host '  Quedaron filas con error. Mande la foto de esta ventana.' -ForegroundColor Yellow
} else {
  Write-Host '  Listo. Entre a Gestion de Valoracion y revise los textos.' -ForegroundColor Green
}
Write-Host ''

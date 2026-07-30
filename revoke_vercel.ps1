$token = "vcp_1hGY4pZLO5axhVi5YVLCVISy7TAGG1GysBCkIC7A6z7xqTSMSn41eVFT"
$headers = @{ Authorization = "Bearer $token" }

Write-Host "Listando tokens de Vercel..."
try {
    $r = Invoke-RestMethod -Uri "https://api.vercel.com/v3/user/tokens" -Headers $headers -Method GET
    $tokens = $r.tokens
    Write-Host "Tokens encontrados: $($tokens.Count)"
    foreach ($t in $tokens) {
        Write-Host "  ID: $($t.id) | Nombre: $($t.name)"
    }

    # Delete all tokens (or specific ones)
    foreach ($t in $tokens) {
        Write-Host "Eliminando token: $($t.name) [$($t.id)]..."
        try {
            Invoke-RestMethod -Uri "https://api.vercel.com/v3/user/tokens/$($t.id)" -Headers $headers -Method DELETE
            Write-Host "  -> ELIMINADO: $($t.name)"
        } catch {
            Write-Host "  -> ERROR eliminando $($t.name): $($_.Exception.Message)"
        }
    }
    Write-Host "Proceso completado."
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    Write-Host "Respuesta: $($_.ErrorDetails.Message)"
}

Read-Host "Presiona Enter para cerrar"

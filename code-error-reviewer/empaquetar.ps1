# Script para empaquetar el skill como archivo .skill instalable
$skillDir = "$PSScriptRoot"
$output   = "$PSScriptRoot\..\code-error-reviewer.skill"

# Incluir solo el SKILL.md y carpeta evals (excluir htmls y scripts temporales)
$include = @("SKILL.md", "evals\evals.json")

Add-Type -Assembly System.IO.Compression.FileSystem

if (Test-Path $output) { Remove-Item $output }

$zip = [System.IO.Compression.ZipFile]::Open($output, 'Create')
foreach ($rel in $include) {
    $full = Join-Path $skillDir $rel
    if (Test-Path $full) {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip, $full, "code-error-reviewer\$rel"
        ) | Out-Null
        Write-Host "Añadido: $rel"
    }
}
$zip.Dispose()

Write-Host ""
Write-Host "✅ Skill empaquetado en: $output"
Write-Host "   Abre Claude > Settings > Skills e instala el archivo .skill"

# =============================================================================
# Ripristino del database da un backup (Windows)
# =============================================================================
# Uso:  .\scripts\backup\ripristina.ps1 <file.dump> [file-compose]
#
# Stessi passi di ripristina.sh: verifica, conferma, backup di sicurezza,
# ripristino in un'unica transazione, riavvio del backend.
# Tutto avviene nel container "backup", che vede la cartella backups\.
# =============================================================================
param(
    [string]$File = "",
    [string]$ComposeFile = "docker-compose.yml"
)

$ErrorActionPreference = "Stop"

if (-not $File) {
    Write-Host "Uso: .\scripts\backup\ripristina.ps1 <file.dump> [file-compose]" -ForegroundColor Yellow
    Write-Host "Backup disponibili:"
    Get-ChildItem -Path "backups" -Filter "*.dump" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 10 |
        ForEach-Object { Write-Host "  $($_.Name)" }
    exit 2
}

$Nome = Split-Path -Leaf $File
if (-not (Test-Path (Join-Path "backups" $Nome))) {
    Write-Host "Il file deve trovarsi nella cartella backups\ del progetto: backups\$Nome non esiste." -ForegroundColor Red
    exit 1
}

function Dc { docker compose -f $ComposeFile @args; if ($LASTEXITCODE -ne 0) { throw "docker compose $args non riuscito" } }

Write-Host "==> Verifica del backup $Nome" -ForegroundColor Cyan
$Tabelle = docker compose -f $ComposeFile exec -T backup sh /script/nel-container.sh verifica $Nome
if ($LASTEXITCODE -ne 0 -or -not $Tabelle -or [int]$Tabelle -eq 0) {
    Write-Host "Il backup non è leggibile o non contiene dati." -ForegroundColor Red
    exit 1
}
Write-Host "    leggibile, $Tabelle tabelle con dati"

Write-Host ""
Write-Host "ATTENZIONE: il contenuto attuale del database verrà SOSTITUITO da quello del backup." -ForegroundColor Yellow
$Conferma = Read-Host "Per continuare scrivere RIPRISTINA"
if ($Conferma -ne "RIPRISTINA") { Write-Host "Annullato."; exit 1 }

if ($env:SENZA_BACKUP_DI_SICUREZZA -ne "1") {
    Write-Host "==> Backup di sicurezza dello stato attuale" -ForegroundColor Cyan
    docker compose -f $ComposeFile exec -T backup sh /script/backup.sh esegui
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Backup di sicurezza non riuscito: ripristino annullato." -ForegroundColor Red
        Write-Host "Se il database attuale è inutilizzabile, impostare `$env:SENZA_BACKUP_DI_SICUREZZA='1' e rilanciare."
        exit 1
    }
}

Write-Host "==> Arresto del backend" -ForegroundColor Cyan
Dc stop backend

Write-Host "==> Ripristino" -ForegroundColor Cyan
docker compose -f $ComposeFile exec -T backup sh /script/nel-container.sh ripristina $Nome
$Riuscito = ($LASTEXITCODE -eq 0)

Write-Host "==> Riavvio del backend" -ForegroundColor Cyan
Dc start backend

if (-not $Riuscito) {
    Write-Host "Ripristino NON riuscito: il database è rimasto com'era prima." -ForegroundColor Red
    exit 1
}

Write-Host "==> Ripristino completato. Contenuto attuale:" -ForegroundColor Green
docker compose -f $ComposeFile exec -T backup sh /script/nel-container.sh riepilogo

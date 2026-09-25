# =============================================================================
# SSL Certificate Renewal Script for Sissibol (Windows PowerShell)
# =============================================================================
# Manually renews SSL certificates using DNS-01 challenge via DuckDNS
#
# Usage: .\scripts\ssl\renew-ssl.ps1
#
# Note: The certbot container in docker-compose.https.yml handles automatic
# renewal. Use this script only for manual renewal if needed.
# =============================================================================

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent (Split-Path -Parent $ScriptDir)

Write-Host "==============================================================================" -ForegroundColor Blue
Write-Host "   Sissibol SSL Certificate Renewal" -ForegroundColor Blue
Write-Host "==============================================================================" -ForegroundColor Blue
Write-Host ""

# Load environment variables
$EnvFile = Join-Path $ProjectDir ".env"
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim() -replace '^["'']|["'']$', ''
            Set-Item -Path "env:$name" -Value $value
        }
    }
} else {
    Write-Host "[!] Error: .env file not found" -ForegroundColor Red
    exit 1
}

$Domain = "$env:DUCKDNS_SUBDOMAIN.duckdns.org"
$LetsencryptDir = Join-Path $ProjectDir "letsencrypt"
$CertDir = Join-Path $LetsencryptDir "live\$Domain"

# Check if certificate exists
if (-not (Test-Path $CertDir)) {
    Write-Host "[!] Error: No existing certificate found" -ForegroundColor Red
    Write-Host "    Run init-ssl.ps1 first to obtain a certificate" -ForegroundColor Yellow
    exit 1
}

Write-Host "[+] Renewing certificate for: $Domain" -ForegroundColor Green
Write-Host ""

# Hook DuckDNS del repository (scripts/ssl/hooks), montati in /hooks: gli
# stessi usati dal container certbot per i rinnovi automatici.
$HooksDir = Join-Path $ProjectDir "scripts\ssl\hooks"

# Convert paths for Docker
$LetsencryptMount = $LetsencryptDir -replace '\\', '/' -replace '^([A-Za-z]):', '/$1'
$HooksMount = $HooksDir -replace '\\', '/' -replace '^([A-Za-z]):', '/$1'

# Run renewal
Write-Host "[+] Running certificate renewal..." -ForegroundColor Blue

docker run --rm `
    -v "${LetsencryptMount}:/etc/letsencrypt" `
    -v "${HooksMount}:/hooks:ro" `
    -e "DUCKDNS_TOKEN=$env:DUCKDNS_TOKEN" `
    -e "DUCKDNS_SUBDOMAIN=$env:DUCKDNS_SUBDOMAIN" `
    certbot/certbot renew `
    --manual-auth-hook "/hooks/auth-hook.sh" `
    --manual-cleanup-hook "/hooks/cleanup-hook.sh"


# Reload nginx to pick up new certificate
Write-Host "[+] Reloading nginx..." -ForegroundColor Blue
try {
    docker exec sissibol-frontend nginx -s reload
    Write-Host "      nginx reloaded successfully" -ForegroundColor Green
} catch {
    Write-Host "    Note: nginx container not running or reload failed" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[+] Certificate renewal complete!" -ForegroundColor Green
Write-Host ""

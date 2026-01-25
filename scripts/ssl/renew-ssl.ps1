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

# Create temporary hooks directory
$TempHooksDir = Join-Path $env:TEMP "certbot-hooks-renew"
if (Test-Path $TempHooksDir) {
    Remove-Item -Recurse -Force $TempHooksDir
}
New-Item -ItemType Directory -Path $TempHooksDir -Force | Out-Null

# Create auth hook
$AuthHook = @"
#!/bin/sh
ENCODED_TOKEN=`$(echo -n "`${CERTBOT_VALIDATION}" | sed 's/ /%20/g')
curl -s "https://www.duckdns.org/update?domains=${env:DUCKDNS_SUBDOMAIN}&token=${env:DUCKDNS_TOKEN}&txt=`${ENCODED_TOKEN}"
echo "Waiting 60 seconds for DNS propagation..."
sleep 60
"@
$AuthHook | Out-File -FilePath (Join-Path $TempHooksDir "auth-hook.sh") -Encoding utf8 -NoNewline

# Create cleanup hook
$CleanupHook = @"
#!/bin/sh
curl -s "https://www.duckdns.org/update?domains=${env:DUCKDNS_SUBDOMAIN}&token=${env:DUCKDNS_TOKEN}&txt=&clear=true"
"@
$CleanupHook | Out-File -FilePath (Join-Path $TempHooksDir "cleanup-hook.sh") -Encoding utf8 -NoNewline

# Convert paths for Docker
$LetsencryptMount = $LetsencryptDir -replace '\\', '/' -replace '^([A-Za-z]):', '/$1'
$HooksMount = $TempHooksDir -replace '\\', '/' -replace '^([A-Za-z]):', '/$1'

# Run renewal
Write-Host "[+] Running certificate renewal..." -ForegroundColor Blue

docker run --rm `
    -v "${LetsencryptMount}:/etc/letsencrypt" `
    -v "${HooksMount}:/hooks" `
    certbot/certbot renew `
    --manual-auth-hook "/hooks/auth-hook.sh" `
    --manual-cleanup-hook "/hooks/cleanup-hook.sh"

# Cleanup
Remove-Item -Recurse -Force $TempHooksDir -ErrorAction SilentlyContinue

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

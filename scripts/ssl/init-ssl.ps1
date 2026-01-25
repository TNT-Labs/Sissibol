# =============================================================================
# Initial SSL Certificate Setup for Sissibol (Windows PowerShell)
# =============================================================================
# This script generates SSL certificates using Let's Encrypt with DNS-01 challenge
# via DuckDNS API. No port 80 required!
#
# Usage: .\scripts\ssl\init-ssl.ps1
#
# Prerequisites:
#   - Docker Desktop for Windows installed and running
#   - .env file configured with DuckDNS credentials
# =============================================================================

$ErrorActionPreference = "Stop"

# Script and project directories
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent (Split-Path -Parent $ScriptDir)

Write-Host "==============================================================================" -ForegroundColor Blue
Write-Host "   Sissibol SSL Certificate Setup (DuckDNS DNS-01 Challenge)" -ForegroundColor Blue
Write-Host "==============================================================================" -ForegroundColor Blue
Write-Host ""

# Load environment variables from .env file
$EnvFile = Join-Path $ProjectDir ".env"
if (Test-Path $EnvFile) {
    Write-Host "[+] Loading environment from .env" -ForegroundColor Green
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            # Remove quotes if present
            $value = $value -replace '^["'']|["'']$', ''
            Set-Item -Path "env:$name" -Value $value
        }
    }
} else {
    Write-Host "[!] Error: .env file not found" -ForegroundColor Red
    Write-Host "    Please copy .env.https.example to .env and configure it" -ForegroundColor Yellow
    exit 1
}

# Validate required variables
$RequiredVars = @("DUCKDNS_TOKEN", "DUCKDNS_SUBDOMAIN", "CERT_EMAIL")
foreach ($var in $RequiredVars) {
    $value = [Environment]::GetEnvironmentVariable($var)
    if ([string]::IsNullOrEmpty($value)) {
        Write-Host "[!] Error: $var is not set in .env" -ForegroundColor Red
        exit 1
    }
}

$Domain = "$env:DUCKDNS_SUBDOMAIN.duckdns.org"

Write-Host "[+] Domain: $Domain" -ForegroundColor Green
Write-Host "[+] Email: $env:CERT_EMAIL" -ForegroundColor Green
Write-Host ""

# =============================================================================
# Step 1: Update DuckDNS with current IP
# =============================================================================
Write-Host "[1/4] Updating DuckDNS IP address..." -ForegroundColor Blue

$UpdateUrl = "https://www.duckdns.org/update?domains=$env:DUCKDNS_SUBDOMAIN&token=$env:DUCKDNS_TOKEN&ip="
try {
    $Response = Invoke-RestMethod -Uri $UpdateUrl -Method Get
    if ($Response -eq "OK") {
        Write-Host "      DuckDNS updated successfully" -ForegroundColor Green
    } else {
        Write-Host "[!] Error updating DuckDNS: $Response" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "[!] Error updating DuckDNS: $_" -ForegroundColor Red
    exit 1
}

# =============================================================================
# Step 2: Generate Diffie-Hellman parameters
# =============================================================================
$SslDir = Join-Path $ProjectDir "ssl"
$DhFile = Join-Path $SslDir "dhparam.pem"

# Create ssl directory if it doesn't exist
if (-not (Test-Path $SslDir)) {
    New-Item -ItemType Directory -Path $SslDir -Force | Out-Null
}

if (Test-Path $DhFile) {
    Write-Host "[2/4] DH parameters already exist, skipping..." -ForegroundColor Blue
} else {
    Write-Host "[2/4] Generating Diffie-Hellman parameters (this may take a few minutes)..." -ForegroundColor Blue

    # Use Docker to generate DH params (OpenSSL available in alpine)
    docker run --rm -v "${SslDir}:/ssl" alpine/openssl dhparam -out /ssl/dhparam.pem 2048

    if (Test-Path $DhFile) {
        Write-Host "      DH parameters generated" -ForegroundColor Green
    } else {
        Write-Host "[!] Error: Failed to generate DH parameters" -ForegroundColor Red
        exit 1
    }
}

# =============================================================================
# Step 3: Create Let's Encrypt certificate using DNS-01 challenge
# =============================================================================
Write-Host "[3/4] Obtaining SSL certificate via DNS-01 challenge..." -ForegroundColor Blue
Write-Host ""

# Create letsencrypt directory if it doesn't exist
$LetsencryptDir = Join-Path $ProjectDir "letsencrypt"
if (-not (Test-Path $LetsencryptDir)) {
    New-Item -ItemType Directory -Path $LetsencryptDir -Force | Out-Null
}

# Create temporary directory for hooks
$TempHooksDir = Join-Path $env:TEMP "certbot-hooks"
if (Test-Path $TempHooksDir) {
    Remove-Item -Recurse -Force $TempHooksDir
}
New-Item -ItemType Directory -Path $TempHooksDir -Force | Out-Null

# Create auth hook script
$AuthHook = @"
#!/bin/sh
ENCODED_TOKEN=`$(echo -n "`${CERTBOT_VALIDATION}" | sed 's/ /%20/g')
curl -s "https://www.duckdns.org/update?domains=${env:DUCKDNS_SUBDOMAIN}&token=${env:DUCKDNS_TOKEN}&txt=`${ENCODED_TOKEN}"
echo "Waiting 60 seconds for DNS propagation..."
sleep 60
"@
$AuthHook | Out-File -FilePath (Join-Path $TempHooksDir "auth-hook.sh") -Encoding utf8 -NoNewline

# Create cleanup hook script
$CleanupHook = @"
#!/bin/sh
curl -s "https://www.duckdns.org/update?domains=${env:DUCKDNS_SUBDOMAIN}&token=${env:DUCKDNS_TOKEN}&txt=&clear=true"
"@
$CleanupHook | Out-File -FilePath (Join-Path $TempHooksDir "cleanup-hook.sh") -Encoding utf8 -NoNewline

# Convert Windows paths to Docker-compatible paths
$LetsencryptMount = $LetsencryptDir -replace '\\', '/' -replace '^([A-Za-z]):', '/$1'
$HooksMount = $TempHooksDir -replace '\\', '/' -replace '^([A-Za-z]):', '/$1'

# Run Certbot in Docker with DNS-01 challenge
Write-Host "      Running Certbot (this may take a minute)..." -ForegroundColor Cyan

docker run --rm `
    -v "${LetsencryptMount}:/etc/letsencrypt" `
    -v "${HooksMount}:/hooks" `
    certbot/certbot certonly `
    --manual `
    --preferred-challenges dns `
    --manual-auth-hook "/hooks/auth-hook.sh" `
    --manual-cleanup-hook "/hooks/cleanup-hook.sh" `
    --non-interactive `
    --agree-tos `
    --email $env:CERT_EMAIL `
    -d $Domain

# Check if certificate was created
$CertPath = Join-Path $LetsencryptDir "live\$Domain\fullchain.pem"
if (Test-Path $CertPath) {
    Write-Host "      Certificate obtained successfully!" -ForegroundColor Green
} else {
    Write-Host "[!] Error: Certificate was not created" -ForegroundColor Red
    Write-Host "    Check the output above for errors" -ForegroundColor Yellow
    exit 1
}

# Cleanup temporary hooks
Remove-Item -Recurse -Force $TempHooksDir -ErrorAction SilentlyContinue

# =============================================================================
# Step 4: Summary
# =============================================================================
Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host "   SSL Certificate Setup Complete!" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Certificate location:" -ForegroundColor Yellow
Write-Host "  - Fullchain: $LetsencryptDir\live\$Domain\fullchain.pem"
Write-Host "  - Private key: $LetsencryptDir\live\$Domain\privkey.pem"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Start the HTTPS stack:" -ForegroundColor White
Write-Host "     docker compose -f docker-compose.https.yml up -d" -ForegroundColor Blue
Write-Host ""
Write-Host "  2. Access your application:" -ForegroundColor White
Write-Host "     https://$Domain" -ForegroundColor Blue
Write-Host ""
Write-Host "Certificate renewal:" -ForegroundColor Yellow
Write-Host "  Certificates will be automatically renewed by the certbot container."
Write-Host "  You can also manually renew with:"
Write-Host "     .\scripts\ssl\renew-ssl.ps1" -ForegroundColor Blue
Write-Host ""

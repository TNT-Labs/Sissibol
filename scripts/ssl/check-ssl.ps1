# =============================================================================
# SSL Configuration Security Check (Windows PowerShell)
# =============================================================================
# Verifies SSL/TLS configuration and certificate status
#
# Usage: .\scripts\ssl\check-ssl.ps1
# =============================================================================

$ErrorActionPreference = "Continue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent (Split-Path -Parent $ScriptDir)

Write-Host "==============================================================================" -ForegroundColor Blue
Write-Host "   Sissibol SSL Security Check" -ForegroundColor Blue
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
$CertPath = Join-Path $LetsencryptDir "live\$Domain\fullchain.pem"

Write-Host "[1] Checking certificate files..." -ForegroundColor Blue
Write-Host ""

if (Test-Path $CertPath) {
    Write-Host "    [OK] Certificate found" -ForegroundColor Green

    # Use Docker to check certificate with OpenSSL
    $CertMount = $LetsencryptDir -replace '\\', '/' -replace '^([A-Za-z]):', '/$1'

    # Get certificate expiry date
    $ExpiryOutput = docker run --rm -v "${CertMount}:/certs:ro" alpine/openssl x509 -enddate -noout -in "/certs/live/$Domain/fullchain.pem" 2>$null
    if ($ExpiryOutput -match 'notAfter=(.+)') {
        $ExpiryDate = $matches[1]
        try {
            $Expiry = [DateTime]::Parse($ExpiryDate)
            $DaysLeft = ($Expiry - (Get-Date)).Days

            if ($DaysLeft -gt 30) {
                Write-Host "    [OK] Certificate expires in $DaysLeft days ($ExpiryDate)" -ForegroundColor Green
            } elseif ($DaysLeft -gt 7) {
                Write-Host "    [WARN] Certificate expires in $DaysLeft days ($ExpiryDate)" -ForegroundColor Yellow
            } else {
                Write-Host "    [CRITICAL] Certificate expires in $DaysLeft days!" -ForegroundColor Red
            }
        } catch {
            Write-Host "    [INFO] Expiry: $ExpiryDate" -ForegroundColor Cyan
        }
    }

    # Show certificate details
    Write-Host ""
    Write-Host "    Certificate Details:" -ForegroundColor Blue
    $CertInfo = docker run --rm -v "${CertMount}:/certs:ro" alpine/openssl x509 -noout -subject -issuer -in "/certs/live/$Domain/fullchain.pem" 2>$null
    $CertInfo | ForEach-Object { Write-Host "    $_" }
} else {
    Write-Host "    [FAIL] Certificate not found at $CertPath" -ForegroundColor Red
}

Write-Host ""
Write-Host "[2] Checking DH parameters..." -ForegroundColor Blue
Write-Host ""

$DhFile = Join-Path $ProjectDir "ssl\dhparam.pem"
if (Test-Path $DhFile) {
    Write-Host "    [OK] DH parameters file exists" -ForegroundColor Green
} else {
    Write-Host "    [FAIL] DH parameters not found" -ForegroundColor Red
}

Write-Host ""
Write-Host "[3] Checking SSL connection (if server is running)..." -ForegroundColor Blue
Write-Host ""

try {
    # Test HTTPS connection
    $Response = Invoke-WebRequest -Uri "https://$Domain/health" -TimeoutSec 5 -SkipCertificateCheck -ErrorAction Stop
    if ($Response.StatusCode -eq 200) {
        Write-Host "    [OK] HTTPS connection successful" -ForegroundColor Green
    }
} catch {
    Write-Host "    [SKIP] Server not reachable (may not be running yet)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[4] Security recommendations..." -ForegroundColor Blue
Write-Host ""

# Check environment variables
if ([string]::IsNullOrEmpty($env:JWT_SECRET) -or $env:JWT_SECRET -eq "your-production-secret-key-change-me") {
    Write-Host "    [CRITICAL] JWT_SECRET is not set or using default value!" -ForegroundColor Red
} else {
    Write-Host "    [OK] JWT_SECRET is configured" -ForegroundColor Green
}

if ($env:POSTGRES_PASSWORD -eq "sissibol_password") {
    Write-Host "    [CRITICAL] Database password is using default value!" -ForegroundColor Red
} else {
    Write-Host "    [OK] Database password is configured" -ForegroundColor Green
}

Write-Host ""
Write-Host "[5] Docker container status..." -ForegroundColor Blue
Write-Host ""

$Containers = @("sissibol-frontend", "sissibol-backend", "sissibol-postgres")
foreach ($Container in $Containers) {
    $Status = docker inspect -f '{{.State.Status}}' $Container 2>$null
    if ($Status -eq "running") {
        Write-Host "    [OK] $Container is running" -ForegroundColor Green
    } elseif ($Status) {
        Write-Host "    [WARN] $Container is $Status" -ForegroundColor Yellow
    } else {
        Write-Host "    [INFO] $Container not found" -ForegroundColor Cyan
    }
}

Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Blue
Write-Host "   For a comprehensive SSL test, use:" -ForegroundColor Blue
Write-Host "   https://www.ssllabs.com/ssltest/analyze.html?d=$Domain" -ForegroundColor Blue
Write-Host "==============================================================================" -ForegroundColor Blue
Write-Host ""

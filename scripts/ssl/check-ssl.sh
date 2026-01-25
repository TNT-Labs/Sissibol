#!/bin/bash
# =============================================================================
# SSL Configuration Security Check
# =============================================================================
# Verifies SSL/TLS configuration and certificate status
#
# Usage: ./scripts/ssl/check-ssl.sh
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo -e "${BLUE}==============================================================================${NC}"
echo -e "${BLUE}   Sissibol SSL Security Check${NC}"
echo -e "${BLUE}==============================================================================${NC}"
echo ""

# Load environment
if [[ -f "$PROJECT_DIR/.env" ]]; then
    set -a
    source "$PROJECT_DIR/.env"
    set +a
else
    echo -e "${RED}[!] Error: .env file not found${NC}"
    exit 1
fi

DOMAIN="${DUCKDNS_SUBDOMAIN}.duckdns.org"
CERT_PATH="$PROJECT_DIR/letsencrypt/live/$DOMAIN"

echo -e "${BLUE}[1] Checking certificate files...${NC}"
echo ""

if [[ -f "$CERT_PATH/fullchain.pem" ]]; then
    echo -e "${GREEN}    [OK] Certificate found${NC}"

    # Check certificate expiry
    EXPIRY=$(openssl x509 -enddate -noout -in "$CERT_PATH/fullchain.pem" | cut -d= -f2)
    EXPIRY_EPOCH=$(date -d "$EXPIRY" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$EXPIRY" +%s 2>/dev/null)
    NOW_EPOCH=$(date +%s)
    DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))

    if [[ $DAYS_LEFT -gt 30 ]]; then
        echo -e "${GREEN}    [OK] Certificate expires in $DAYS_LEFT days ($EXPIRY)${NC}"
    elif [[ $DAYS_LEFT -gt 7 ]]; then
        echo -e "${YELLOW}    [WARN] Certificate expires in $DAYS_LEFT days ($EXPIRY)${NC}"
    else
        echo -e "${RED}    [CRITICAL] Certificate expires in $DAYS_LEFT days!${NC}"
    fi

    # Show certificate info
    echo ""
    echo -e "${BLUE}    Certificate Details:${NC}"
    openssl x509 -noout -subject -issuer -in "$CERT_PATH/fullchain.pem" | sed 's/^/    /'
else
    echo -e "${RED}    [FAIL] Certificate not found at $CERT_PATH${NC}"
fi

echo ""
echo -e "${BLUE}[2] Checking DH parameters...${NC}"
echo ""

if [[ -f "$PROJECT_DIR/ssl/dhparam.pem" ]]; then
    DH_BITS=$(openssl dhparam -in "$PROJECT_DIR/ssl/dhparam.pem" -text 2>/dev/null | grep "DH Parameters" | grep -oE '[0-9]+')
    if [[ "$DH_BITS" -ge 2048 ]]; then
        echo -e "${GREEN}    [OK] DH parameters: $DH_BITS bits${NC}"
    else
        echo -e "${YELLOW}    [WARN] DH parameters only $DH_BITS bits (recommended: 2048+)${NC}"
    fi
else
    echo -e "${RED}    [FAIL] DH parameters not found${NC}"
fi

echo ""
echo -e "${BLUE}[3] Checking SSL connection (if server is running)...${NC}"
echo ""

if command -v openssl &> /dev/null; then
    if timeout 5 bash -c "echo | openssl s_client -connect ${DOMAIN}:443 -servername ${DOMAIN} 2>/dev/null" | grep -q "Verify return code: 0"; then
        echo -e "${GREEN}    [OK] SSL connection successful${NC}"

        # Check TLS version
        TLS_VERSION=$(echo | openssl s_client -connect ${DOMAIN}:443 -servername ${DOMAIN} 2>/dev/null | grep "Protocol" | awk '{print $3}')
        echo -e "${GREEN}    [OK] TLS Version: $TLS_VERSION${NC}"

        # Check cipher
        CIPHER=$(echo | openssl s_client -connect ${DOMAIN}:443 -servername ${DOMAIN} 2>/dev/null | grep "Cipher" | head -1 | awk '{print $3}')
        echo -e "${GREEN}    [OK] Cipher: $CIPHER${NC}"
    else
        echo -e "${YELLOW}    [SKIP] Server not reachable (may not be running yet)${NC}"
    fi
else
    echo -e "${YELLOW}    [SKIP] openssl not available for connection test${NC}"
fi

echo ""
echo -e "${BLUE}[4] Security recommendations...${NC}"
echo ""

# Check environment variables
if [[ "${JWT_SECRET:-}" == "your-production-secret-key-change-me" ]] || [[ -z "${JWT_SECRET:-}" ]]; then
    echo -e "${RED}    [CRITICAL] JWT_SECRET is not set or using default value!${NC}"
else
    echo -e "${GREEN}    [OK] JWT_SECRET is configured${NC}"
fi

if [[ "${POSTGRES_PASSWORD:-}" == "sissibol_password" ]]; then
    echo -e "${RED}    [CRITICAL] Database password is using default value!${NC}"
else
    echo -e "${GREEN}    [OK] Database password is configured${NC}"
fi

echo ""
echo -e "${BLUE}==============================================================================${NC}"
echo -e "${BLUE}   For a comprehensive SSL test, use:${NC}"
echo -e "${BLUE}   https://www.ssllabs.com/ssltest/analyze.html?d=${DOMAIN}${NC}"
echo -e "${BLUE}==============================================================================${NC}"
echo ""

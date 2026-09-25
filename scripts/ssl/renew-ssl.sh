#!/bin/bash
# =============================================================================
# SSL Certificate Renewal Script for Sissibol
# =============================================================================
# Manually renews SSL certificates using DNS-01 challenge via DuckDNS
#
# Usage: ./scripts/ssl/renew-ssl.sh
#
# Note: The certbot container in docker-compose.https.yml handles automatic
# renewal. Use this script only for manual renewal if needed.
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo -e "${BLUE}==============================================================================${NC}"
echo -e "${BLUE}   Sissibol SSL Certificate Renewal${NC}"
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

# Check if certificate exists
if [[ ! -d "$PROJECT_DIR/letsencrypt/live/$DOMAIN" ]]; then
    echo -e "${RED}[!] Error: No existing certificate found${NC}"
    echo -e "${YELLOW}    Run init-ssl.sh first to obtain a certificate${NC}"
    exit 1
fi

echo -e "${GREEN}[+] Renewing certificate for: ${DOMAIN}${NC}"
echo ""

# Hook DuckDNS del repository, gli stessi dei rinnovi automatici.
CERTBOT_HOOKS_DIR="$PROJECT_DIR/scripts/ssl/hooks"

# Run renewal
docker run --rm \
    -v "$PROJECT_DIR/letsencrypt:/etc/letsencrypt" \
    -v "$CERTBOT_HOOKS_DIR:/hooks:ro" \
    -e DUCKDNS_TOKEN="$DUCKDNS_TOKEN" \
    -e DUCKDNS_SUBDOMAIN="$DUCKDNS_SUBDOMAIN" \
    certbot/certbot renew \
    --manual-auth-hook "/hooks/auth-hook.sh" \
    --manual-cleanup-hook "/hooks/cleanup-hook.sh"


# Reload nginx to pick up new certificate
echo -e "${BLUE}[+] Reloading nginx...${NC}"
docker exec sissibol-frontend nginx -s reload 2>/dev/null || echo -e "${YELLOW}    Note: nginx container not running or reload failed${NC}"

echo ""
echo -e "${GREEN}[+] Certificate renewal complete!${NC}"
echo ""

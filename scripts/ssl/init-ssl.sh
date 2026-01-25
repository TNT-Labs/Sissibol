#!/bin/bash
# =============================================================================
# Initial SSL Certificate Setup for Sissibol
# =============================================================================
# This script generates SSL certificates using Let's Encrypt with DNS-01 challenge
# via DuckDNS API. No port 80 required!
#
# Usage: ./scripts/ssl/init-ssl.sh
#
# Prerequisites:
#   - Docker installed
#   - .env file configured with DuckDNS credentials
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo -e "${BLUE}==============================================================================${NC}"
echo -e "${BLUE}   Sissibol SSL Certificate Setup (DuckDNS DNS-01 Challenge)${NC}"
echo -e "${BLUE}==============================================================================${NC}"
echo ""

# Load environment variables
if [[ -f "$PROJECT_DIR/.env" ]]; then
    echo -e "${GREEN}[+] Loading environment from .env${NC}"
    set -a
    source "$PROJECT_DIR/.env"
    set +a
else
    echo -e "${RED}[!] Error: .env file not found${NC}"
    echo -e "${YELLOW}    Please copy .env.https.example to .env and configure it${NC}"
    exit 1
fi

# Validate required variables
REQUIRED_VARS=("DUCKDNS_TOKEN" "DUCKDNS_SUBDOMAIN" "CERT_EMAIL")
for var in "${REQUIRED_VARS[@]}"; do
    if [[ -z "${!var:-}" ]]; then
        echo -e "${RED}[!] Error: $var is not set in .env${NC}"
        exit 1
    fi
done

DOMAIN="${DUCKDNS_SUBDOMAIN}.duckdns.org"

echo -e "${GREEN}[+] Domain: ${DOMAIN}${NC}"
echo -e "${GREEN}[+] Email: ${CERT_EMAIL}${NC}"
echo ""

# =============================================================================
# Step 1: Update DuckDNS with current IP
# =============================================================================
echo -e "${BLUE}[1/4] Updating DuckDNS IP address...${NC}"

UPDATE_URL="https://www.duckdns.org/update?domains=${DUCKDNS_SUBDOMAIN}&token=${DUCKDNS_TOKEN}&ip="
RESPONSE=$(curl -s "$UPDATE_URL")

if [[ "$RESPONSE" == "OK" ]]; then
    echo -e "${GREEN}      DuckDNS updated successfully${NC}"
else
    echo -e "${RED}[!] Error updating DuckDNS: $RESPONSE${NC}"
    exit 1
fi

# =============================================================================
# Step 2: Generate Diffie-Hellman parameters
# =============================================================================
DH_FILE="$PROJECT_DIR/ssl/dhparam.pem"

if [[ -f "$DH_FILE" ]]; then
    echo -e "${BLUE}[2/4] DH parameters already exist, skipping...${NC}"
else
    echo -e "${BLUE}[2/4] Generating Diffie-Hellman parameters (this may take a few minutes)...${NC}"
    openssl dhparam -out "$DH_FILE" 2048
    chmod 600 "$DH_FILE"
    echo -e "${GREEN}      DH parameters generated${NC}"
fi

# =============================================================================
# Step 3: Create Let's Encrypt certificate using DNS-01 challenge
# =============================================================================
echo -e "${BLUE}[3/4] Obtaining SSL certificate via DNS-01 challenge...${NC}"
echo ""

# Create a temporary directory for the DuckDNS authentication scripts
CERTBOT_HOOKS_DIR="/tmp/certbot-hooks"
mkdir -p "$CERTBOT_HOOKS_DIR"

# Create the authentication hook script
cat > "$CERTBOT_HOOKS_DIR/auth-hook.sh" << 'AUTHEOF'
#!/bin/bash
# DuckDNS authentication hook for Certbot
# Sets TXT record for DNS-01 challenge

DUCKDNS_TOKEN="${DUCKDNS_TOKEN}"
DUCKDNS_SUBDOMAIN="${DUCKDNS_SUBDOMAIN}"

# URL encode the validation token
ENCODED_TOKEN=$(echo -n "${CERTBOT_VALIDATION}" | sed 's/ /%20/g')

# Set TXT record via DuckDNS API
curl -s "https://www.duckdns.org/update?domains=${DUCKDNS_SUBDOMAIN}&token=${DUCKDNS_TOKEN}&txt=${ENCODED_TOKEN}"

# Wait for DNS propagation
echo "Waiting 60 seconds for DNS propagation..."
sleep 60
AUTHEOF

# Create the cleanup hook script
cat > "$CERTBOT_HOOKS_DIR/cleanup-hook.sh" << 'CLEANEOF'
#!/bin/bash
# DuckDNS cleanup hook for Certbot
# Clears TXT record after validation

DUCKDNS_TOKEN="${DUCKDNS_TOKEN}"
DUCKDNS_SUBDOMAIN="${DUCKDNS_SUBDOMAIN}"

# Clear TXT record
curl -s "https://www.duckdns.org/update?domains=${DUCKDNS_SUBDOMAIN}&token=${DUCKDNS_TOKEN}&txt=&clear=true"
CLEANEOF

chmod +x "$CERTBOT_HOOKS_DIR"/*.sh

# Run Certbot in Docker with DNS-01 challenge
docker run --rm \
    -v "$PROJECT_DIR/letsencrypt:/etc/letsencrypt" \
    -v "$CERTBOT_HOOKS_DIR:/hooks" \
    -e DUCKDNS_TOKEN="$DUCKDNS_TOKEN" \
    -e DUCKDNS_SUBDOMAIN="$DUCKDNS_SUBDOMAIN" \
    certbot/certbot certonly \
    --manual \
    --preferred-challenges dns \
    --manual-auth-hook "/hooks/auth-hook.sh" \
    --manual-cleanup-hook "/hooks/cleanup-hook.sh" \
    --non-interactive \
    --agree-tos \
    --email "$CERT_EMAIL" \
    -d "$DOMAIN"

# Check if certificate was created
if [[ -f "$PROJECT_DIR/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
    echo -e "${GREEN}      Certificate obtained successfully!${NC}"
else
    echo -e "${RED}[!] Error: Certificate was not created${NC}"
    exit 1
fi

# Cleanup temporary hooks
rm -rf "$CERTBOT_HOOKS_DIR"

# =============================================================================
# Step 4: Set proper permissions
# =============================================================================
echo -e "${BLUE}[4/4] Setting permissions...${NC}"

# Ensure certificates are readable by nginx
chmod -R 755 "$PROJECT_DIR/letsencrypt/live" 2>/dev/null || true
chmod -R 755 "$PROJECT_DIR/letsencrypt/archive" 2>/dev/null || true

echo ""
echo -e "${GREEN}==============================================================================${NC}"
echo -e "${GREEN}   SSL Certificate Setup Complete!${NC}"
echo -e "${GREEN}==============================================================================${NC}"
echo ""
echo -e "${YELLOW}Certificate location:${NC}"
echo -e "  - Fullchain: $PROJECT_DIR/letsencrypt/live/$DOMAIN/fullchain.pem"
echo -e "  - Private key: $PROJECT_DIR/letsencrypt/live/$DOMAIN/privkey.pem"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Start the HTTPS stack:"
echo -e "     ${BLUE}docker compose -f docker-compose.https.yml up -d${NC}"
echo ""
echo -e "  2. Access your application:"
echo -e "     ${BLUE}https://${DOMAIN}${NC}"
echo ""
echo -e "${YELLOW}Certificate renewal:${NC}"
echo -e "  Certificates will be automatically renewed by the certbot container."
echo -e "  You can also manually renew with:"
echo -e "     ${BLUE}./scripts/ssl/renew-ssl.sh${NC}"
echo ""

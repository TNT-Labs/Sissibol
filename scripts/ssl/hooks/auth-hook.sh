#!/bin/sh
# Hook di autenticazione certbot (DNS-01 via DuckDNS).
set -eu
"$(dirname "$0")/duckdns.sh" imposta "${CERTBOT_VALIDATION:?CERTBOT_VALIDATION mancante}"
# Il record TXT deve propagarsi prima che Let's Encrypt lo verifichi.
ATTESA="${DUCKDNS_ATTESA_SECONDI:-60}"
echo "Attesa di ${ATTESA} secondi per la propagazione DNS..."
sleep "$ATTESA"

#!/bin/sh
# Hook di pulizia certbot: rimuove il record TXT dopo la verifica.
set -eu
"$(dirname "$0")/duckdns.sh" cancella

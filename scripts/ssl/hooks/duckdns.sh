#!/bin/sh
# Imposta o cancella il record TXT DuckDNS per la verifica DNS-01 di Let's Encrypt.
#
# Usato dagli hook di certbot, sia alla prima emissione (init-ssl) sia nei
# rinnovi automatici del container certbot: per questo sta nel repository e
# viene montato in /hooks, lo stesso percorso che certbot salva nella
# configurazione di rinnovo.
#
# Solo sh POSIX: l'immagine certbot/certbot è Alpine e non ha bash.
#
# Uso: duckdns.sh imposta <valore> | duckdns.sh cancella
set -eu

API="${DUCKDNS_API:-https://www.duckdns.org/update}"
: "${DUCKDNS_TOKEN:?DUCKDNS_TOKEN non impostato}"
: "${DUCKDNS_SUBDOMAIN:?DUCKDNS_SUBDOMAIN non impostato}"

case "${1:-}" in
  imposta) URL="${API}?domains=${DUCKDNS_SUBDOMAIN}&token=${DUCKDNS_TOKEN}&txt=${2:?valore mancante}" ;;
  cancella) URL="${API}?domains=${DUCKDNS_SUBDOMAIN}&token=${DUCKDNS_TOKEN}&txt=&clear=true" ;;
  *) echo "Uso: $0 imposta <valore> | cancella" >&2; exit 2 ;;
esac

# python3 c'è sempre nell'immagine certbot; curl e wget sono ripieghi.
if command -v python3 >/dev/null 2>&1; then
  RISPOSTA=$(python3 -c 'import sys, urllib.request; print(urllib.request.urlopen(sys.argv[1], timeout=30).read().decode().strip())' "$URL")
elif command -v curl >/dev/null 2>&1; then
  RISPOSTA=$(curl -fsS --max-time 30 "$URL")
else
  RISPOSTA=$(wget -qO- -T 30 "$URL")
fi

# DuckDNS risponde OK o KO: un token sbagliato non deve passare in silenzio.
if [ "$RISPOSTA" != "OK" ]; then
  echo "DuckDNS ha risposto \"${RISPOSTA}\" (${1}): controllare DUCKDNS_TOKEN e DUCKDNS_SUBDOMAIN" >&2
  exit 1
fi
echo "DuckDNS: record TXT ${1} (${DUCKDNS_SUBDOMAIN})"

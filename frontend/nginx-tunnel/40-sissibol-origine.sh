#!/bin/sh
# =============================================================================
# Genera /etc/nginx/conf.d/sissibol.conf all'avvio del container.
#
# Le richieste arrivano solo da cloudflared, quindi l'IP del client non è
# quello della connessione ma quello indicato da Cloudflare:
#
# - accesso diretto dal tunnel (ORIGINE_SEGRETO vuota): CF-Connecting-IP,
#   impostata dalla rete di Cloudflare e non falsificabile dal client;
# - accesso tramite il Worker (ORIGINE_SEGRETO impostata): ogni richiesta deve
#   portare il segreto in X-Sissibol-Origine, altrimenti è respinta (403), e
#   l'IP è quello che il Worker indica in X-Sissibol-Client-IP (per le
#   richieste di un Worker, CF-Connecting-IP è quello del Worker).
#
# L'IP serve ai limiti di richieste per client e ai registri.
# =============================================================================
set -eu

DESTINAZIONE=/etc/nginx/conf.d/sissibol.conf
SEGRETO="${ORIGINE_SEGRETO:-}"

if [ -n "$SEGRETO" ]; then
  # Solo caratteri sicuri dentro la configurazione di nginx, e abbastanza
  # lungo da non poter essere indovinato.
  if ! printf '%s' "$SEGRETO" | grep -Eq '^[A-Za-z0-9_-]{32,128}$'; then
    echo "ORIGINE_SEGRETO non valida: 32-128 caratteri fra lettere, numeri, - e _ (openssl rand -hex 32)" >&2
    exit 1
  fi
  cat > "$DESTINAZIONE" <<CONF
# Generato da 40-sissibol-origine.sh: accesso tramite Worker con segreto.
# Il segreto (fino a 128 caratteri) è una chiave della mappa.
map_hash_bucket_size 256;
map \$http_x_sissibol_origine \$sissibol_origine_ammessa {
    default 0;
    "$SEGRETO" 1;
}
map \$http_x_sissibol_client_ip \$sissibol_ip_cliente {
    default \$http_x_sissibol_client_ip;
    "" \$remote_addr;
}
include /etc/nginx/sissibol/sito.conf;
CONF
  echo "Sissibol: accesso tramite Worker, segreto d'origine richiesto"
else
  cat > "$DESTINAZIONE" <<'CONF'
# Generato da 40-sissibol-origine.sh: accesso diretto dal tunnel.
map $http_cf_connecting_ip $sissibol_origine_ammessa {
    default 1;
}
map $http_cf_connecting_ip $sissibol_ip_cliente {
    default $http_cf_connecting_ip;
    "" $remote_addr;
}
include /etc/nginx/sissibol/sito.conf;
CONF
  echo "Sissibol: accesso diretto dal tunnel (IP del client da CF-Connecting-IP)"
fi

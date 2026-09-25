#!/bin/sh
# =============================================================================
# Ripristino del database da un backup
# =============================================================================
# Uso:  ./scripts/backup/ripristina.sh <file.dump> [file-compose]
#
#   file.dump     un file della cartella backups/ (es. sissibol-20261001-023000.dump)
#   file-compose  default docker-compose.yml; in produzione docker-compose.https.yml
#                 o docker-compose.cloudflare.yml
#
# Passi:
#   1. verifica che il backup sia leggibile;
#   2. chiede conferma scrivendo RIPRISTINA;
#   3. fa un backup di sicurezza dello stato attuale (annullabile solo con
#      SENZA_BACKUP_DI_SICUREZZA=1, se il database è inutilizzabile);
#   4. ferma il backend, ripristina in un'unica transazione (se qualcosa va
#      storto il database resta com'era) e riavvia il backend, che applica le
#      eventuali migrazioni più recenti del backup.
# =============================================================================
set -eu

FILE="${1:-}"
COMPOSE_FILE="${2:-docker-compose.yml}"
if [ -z "$FILE" ]; then
  echo "Uso: $0 <file.dump> [file-compose]" >&2
  echo "Backup disponibili:" >&2
  ls -1t backups/*.dump 2>/dev/null | head -n 10 >&2 || echo "  nessuno" >&2
  exit 2
fi

NOME=$(basename "$FILE")
if [ ! -f "backups/$NOME" ]; then
  echo "Il file deve trovarsi nella cartella backups/ del progetto: backups/$NOME non esiste." >&2
  exit 1
fi

dc() { docker compose -f "$COMPOSE_FILE" "$@"; }

echo "==> Verifica del backup $NOME"
TABELLE=$(dc exec -T backup sh /script/nel-container.sh verifica "$NOME" || echo 0)
if [ "$TABELLE" -eq 0 ]; then
  echo "Il backup non è leggibile o non contiene dati." >&2
  exit 1
fi
echo "    leggibile, $TABELLE tabelle con dati"

echo
echo "ATTENZIONE: il contenuto attuale del database verrà SOSTITUITO da quello del backup."
printf 'Per continuare scrivere RIPRISTINA: '
read -r CONFERMA
[ "$CONFERMA" = "RIPRISTINA" ] || { echo "Annullato."; exit 1; }

if [ "${SENZA_BACKUP_DI_SICUREZZA:-0}" != "1" ]; then
  echo "==> Backup di sicurezza dello stato attuale"
  dc exec -T backup sh /script/backup.sh esegui || {
    echo "Backup di sicurezza non riuscito: ripristino annullato." >&2
    echo "Se il database attuale è inutilizzabile, rilanciare con SENZA_BACKUP_DI_SICUREZZA=1." >&2
    exit 1
  }
fi

echo "==> Arresto del backend"
dc stop backend

echo "==> Ripristino"
if dc exec -T backup sh /script/nel-container.sh ripristina "$NOME"; then
  RIUSCITO=1
else
  RIUSCITO=0
fi

echo "==> Riavvio del backend"
dc start backend

if [ "$RIUSCITO" -ne 1 ]; then
  echo "Ripristino NON riuscito: il database è rimasto com'era prima." >&2
  exit 1
fi

echo "==> Ripristino completato. Contenuto attuale:"
dc exec -T backup sh /script/nel-container.sh riepilogo

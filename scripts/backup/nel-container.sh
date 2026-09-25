#!/bin/sh
# Operazioni di ripristino eseguite nel container "backup" (che ha le
# credenziali del database e vede la cartella /backups).
# Chiamato da ripristina.sh e ripristina.ps1 con argomenti semplici, senza
# virgolette annidate: PowerShell 5.1 le altera passando argomenti a docker.
#
#   nel-container.sh verifica <nome.dump>    numero di tabelle con dati
#   nel-container.sh ripristina <nome.dump>  ripristino in un'unica transazione
#   nel-container.sh riepilogo               conteggi principali
set -eu

DIR="${BACKUP_DIR:-/backups}"

nome_valido() {
  case "$1" in
    */*|..*|"") echo "Nome di file non valido: $1" >&2; exit 2 ;;
  esac
  [ -f "$DIR/$1" ] || { echo "$DIR/$1 non esiste" >&2; exit 1; }
}

case "${1:-}" in
  verifica)
    nome_valido "${2:-}"
    pg_restore --list "$DIR/$2" | grep -c "TABLE DATA" || true
    ;;
  ripristina)
    nome_valido "${2:-}"
    # --single-transaction: se qualcosa fallisce il database resta com'era.
    pg_restore --clean --if-exists --no-owner --single-transaction --exit-on-error \
      -d "$PGDATABASE" "$DIR/$2"
    ;;
  riepilogo)
    psql -tA -c "select (select count(*) from clienti) || ' clienti, ' || (select count(*) from veicoli) || ' veicoli, ' || (select count(*) from scadenze) || ' scadenze, ' || (select count(*) from pagamenti) || ' pagamenti'"
    ;;
  *) echo "Uso: $0 verifica|ripristina <nome.dump> | riepilogo" >&2; exit 2 ;;
esac

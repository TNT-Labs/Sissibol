#!/bin/sh
# =============================================================================
# Backup del database Sissibol
# =============================================================================
# Gira nel container "backup" dei compose (immagine postgres:15-alpine, la
# stessa versione del server, quindi pg_dump è compatibile).
#
#   backup.sh ciclo    resta attivo e fa un backup al giorno all'ora BACKUP_ORA
#   backup.sh esegui   fa subito un backup
#
# Ogni backup è un dump in formato custom (pg_dump -Fc: compresso, ripristinabile
# anche parzialmente) scritto prima in un file temporaneo e VERIFICATO con
# pg_restore --list: solo un dump leggibile diventa un backup. Un backup mai
# verificato scoperto illeggibile il giorno del bisogno equivale a non averlo.
#
# Con il database si archiviano le ricevute di pagamento caricate (cartella
# BACKUP_UPLOADS_DIR, montata in sola lettura): sono file, non stanno nel
# database, e sono la prova di un pagamento.
#
# Conservazione: i giornalieri per BACKUP_GIORNI giorni, quelli del primo del
# mese per BACKUP_MESI mesi. Se il backup fallisce non si cancella nulla.
#
# Lo stato dell'ultimo tentativo è in $BACKUP_DIR/stato.json, letto
# dall'applicazione per mostrare agli amministratori se i backup funzionano.
# =============================================================================
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_ORA="${BACKUP_ORA:-02:30}"
BACKUP_GIORNI="${BACKUP_GIORNI:-14}"
BACKUP_MESI="${BACKUP_MESI:-12}"
BACKUP_UPLOADS_DIR="${BACKUP_UPLOADS_DIR:-/uploads}"
PREFISSO="sissibol"
STATO="$BACKUP_DIR/stato.json"

log() { echo "[backup $(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Testo sicuro dentro una stringa JSON.
json_testo() { printf '%s' "$1" | tr '\n\r\t' '   ' | sed 's/\\/\\\\/g; s/"/\\"/g'; }

ultimo_riuscito() {
  ls -1 "$BACKUP_DIR"/"$PREFISSO"-*.dump 2>/dev/null | sort | tail -n 1
}

scrivi_stato() {
  esito="$1"; errore="$2"
  ultimo=$(ultimo_riuscito || true)
  if [ -n "$ultimo" ]; then
    riuscito="{\"file\":\"$(basename "$ultimo")\",\"dimensioneByte\":$(wc -c < "$ultimo" | tr -d ' '),\"quando\":\"$(date -r "$ultimo" -Iseconds)\"}"
  else
    riuscito="null"
  fi
  totale=$(ls -1 "$BACKUP_DIR"/"$PREFISSO"-*.dump 2>/dev/null | wc -l | tr -d ' ')
  tmp="$STATO.tmp"
  printf '{"esito":"%s","quando":"%s","errore":%s,"ultimoRiuscito":%s,"backupConservati":%s,"conservazione":{"giorni":%s,"mesi":%s},"ora":"%s"}\n' \
    "$esito" "$(date -Iseconds)" \
    "$( [ -n "$errore" ] && printf '"%s"' "$(json_testo "$errore")" || printf 'null')" \
    "$riuscito" "$totale" "$BACKUP_GIORNI" "$BACKUP_MESI" "$BACKUP_ORA" > "$tmp"
  mv "$tmp" "$STATO"
}

ruota() {
  # -exec rm e non -delete: la find di busybox può non avere -delete.
  for estensione in dump tar.gz; do
    # Giornalieri oltre BACKUP_GIORNI giorni, esclusi quelli del primo del mese.
    find "$BACKUP_DIR" -maxdepth 1 -type f -name "$PREFISSO-*.$estensione" \
      ! -name "$PREFISSO-??????01-*.$estensione" -mtime +"$BACKUP_GIORNI" \
      -print -exec rm -f {} \; | sed 's/^/  rimosso: /'
    # Mensili oltre BACKUP_MESI mesi.
    find "$BACKUP_DIR" -maxdepth 1 -type f -name "$PREFISSO-??????01-*.$estensione" \
      -mtime +"$((BACKUP_MESI * 31))" -print -exec rm -f {} \; | sed 's/^/  rimosso: /'
  done
  # File temporanei di tentativi interrotti.
  find "$BACKUP_DIR" -maxdepth 1 -type f -name "*.tmp" -mmin +60 -exec rm -f {} \;
}

# Archivio delle ricevute caricate, verificato come il dump.
archivia_ricevute() {
  base="$1"
  [ -d "$BACKUP_UPLOADS_DIR" ] || return 0
  archivio="$BACKUP_DIR/$base-ricevute.tar.gz"
  if ! tar -czf "$archivio.tmp" -C "$BACKUP_UPLOADS_DIR" . 2>"$BACKUP_DIR/.errore" ||
     ! tar -tzf "$archivio.tmp" >/dev/null 2>>"$BACKUP_DIR/.errore"; then
    msg="archivio delle ricevute non riuscito: $(cat "$BACKUP_DIR/.errore")"
    rm -f "$archivio.tmp" "$BACKUP_DIR/.errore"
    log "ERRORE: $msg"
    scrivi_stato "ERRORE" "$msg"
    return 1
  fi
  rm -f "$BACKUP_DIR/.errore"
  mv "$archivio.tmp" "$archivio"
  log "ricevute archiviate: $(wc -c < "$archivio" | tr -d ' ') byte"
}

esegui() {
  mkdir -p "$BACKUP_DIR"
  umask 027
  base="$PREFISSO-$(date '+%Y%m%d-%H%M%S')"
  nome="$base.dump"
  tmp="$BACKUP_DIR/$nome.tmp"
  errore_file="$BACKUP_DIR/.errore"
  inizio=$(date +%s)
  log "backup di ${PGDATABASE:-?} su ${PGHOST:-?} in $nome"

  if ! pg_dump --format=custom --compress=6 --no-owner --file="$tmp" 2>"$errore_file"; then
    msg="pg_dump non riuscito: $(cat "$errore_file")"
    rm -f "$tmp" "$errore_file"
    log "ERRORE: $msg"
    scrivi_stato "ERRORE" "$msg"
    return 1
  fi

  # Verifica: il dump deve essere leggibile e contenere le tabelle.
  if ! voci=$(pg_restore --list "$tmp" 2>"$errore_file") ||
     ! printf '%s\n' "$voci" | grep -Eq "TABLE DATA [^ ]+ scadenze( |$)"; then
    msg="dump non valido: $(cat "$errore_file" 2>/dev/null) (tabella scadenze assente o archivio illeggibile)"
    rm -f "$tmp" "$errore_file"
    log "ERRORE: $msg"
    scrivi_stato "ERRORE" "$msg"
    return 1
  fi
  rm -f "$errore_file"

  mv "$tmp" "$BACKUP_DIR/$nome"
  log "database: $(wc -c < "$BACKUP_DIR/$nome" | tr -d ' ') byte, verificato"
  archivia_ricevute "$base" || return 1
  log "completato in $(( $(date +%s) - inizio ))s"
  # Un problema nella pulizia dei vecchi backup non rende fallito quello nuovo.
  ruota || log "attenzione: rotazione dei vecchi backup non riuscita"
  scrivi_stato "OK" ""
}

# Attende (al massimo ATTESA_TABELLE secondi) che esista la tabella delle
# scadenze, creata dalle migrazioni all'avvio del backend.
attendi_tabelle() {
  limite=$(( $(date +%s) + ${ATTESA_TABELLE:-600} ))
  avvisato=""
  while [ "$(psql -tAc "select to_regclass('public.scadenze') is not null" 2>/dev/null)" != "t" ]; do
    if [ "$(date +%s)" -ge "$limite" ]; then
      log "tabelle ancora assenti: si prova comunque il backup"
      return 0
    fi
    [ -n "$avvisato" ] || log "in attesa che il backend crei le tabelle del database"
    avvisato=1
    sleep 10
  done
}

backup_di_oggi() {
  ls "$BACKUP_DIR"/"$PREFISSO-$(date '+%Y%m%d')"-*.dump >/dev/null 2>&1
}

ciclo() {
  mkdir -p "$BACKUP_DIR"
  log "attivo: backup giornaliero alle $BACKUP_ORA (fuso ${TZ:-UTC}), conservazione $BACKUP_GIORNI giorni e $BACKUP_MESI mensili"

  # Alla prima installazione un backup subito: una configurazione sbagliata
  # si scopre adesso, non domattina. Prima però si aspetta che il backend
  # abbia creato le tabelle: il database appena avviato è vuoto, e un dump
  # vuoto veniva scartato (stato in errore fino al tentativo successivo).
  if [ -z "$(ultimo_riuscito || true)" ]; then
    attendi_tabelle
    esegui || true
  fi

  obiettivo=$(echo "$BACKUP_ORA" | tr -d ':')
  while :; do
    # Dopo l'ora prevista, se oggi non c'è ancora un backup, lo si fa: così
    # anche un container riavviato dopo quell'ora recupera il backup del giorno.
    if [ "$(date '+%H%M')" -ge "$obiettivo" ] && ! backup_di_oggi; then
      esegui || log "nuovo tentativo al prossimo controllo"
    fi
    sleep 300 & wait $!
  done
}

trap 'log "arresto"; exit 0' TERM INT

case "${1:-ciclo}" in
  ciclo) ciclo ;;
  esegui) esegui ;;
  *) echo "Uso: $0 [ciclo|esegui]" >&2; exit 2 ;;
esac

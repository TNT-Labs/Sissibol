# Backup e ripristino

Questo documento descrive i backup introdotti nella **Fase 5** della
reingegnerizzazione. Prima non ce n'erano: la sola copia del database era il
volume Docker sul disco del server.

---

## Cosa viene salvato

Ogni giorno all'ora `BACKUP_ORA` (default 02:30, fuso `APP_FUSO_ORARIO`), il
servizio `backup` dei compose salva nella cartella `backups/` del progetto:

| File | Contenuto |
|---|---|
| `sissibol-AAAAMMGG-HHMMSS.dump` | il database completo (formato `pg_dump -Fc`, compresso) |
| `sissibol-AAAAMMGG-HHMMSS-ricevute.tar.gz` | le ricevute di pagamento caricate, che sono file e non stanno nel database |
| `stato.json` | esito dell'ultimo tentativo e ultimo backup riuscito |

Sull'archivio reale (2.438 veicoli, 124.568 scadenze) il dump pesa circa 2 MB
e richiede un secondo.

**Ogni backup viene verificato prima di essere tenuto**: il dump viene letto
con `pg_restore --list` e deve contenere i dati delle scadenze, l'archivio
delle ricevute viene riletto. Un file non verificato non diventa mai un backup,
e un backup mai verificato, scoperto illeggibile il giorno in cui serve,
equivale a non averlo.

### Conservazione

- i giornalieri per `BACKUP_GIORNI` giorni (default 14);
- quelli del primo del mese per `BACKUP_MESI` mesi (default 12).

Se un backup fallisce non viene cancellato nulla. Alla prima installazione il
servizio fa subito un backup, così una configurazione sbagliata si scopre
all'avvio e non la mattina dopo (dopo aver atteso, fino a 10 minuti, che il
backend crei le tabelle del database). Se il server è spento all'ora prevista, il
backup del giorno viene fatto appena il servizio riparte.

---

## Controllare che funzionino

- **Dashboard** (amministratori): la sezione *Stato del sistema* mostra
  l'ultimo backup riuscito e diventa rossa se l'ultimo tentativo è fallito o
  se non ci sono backup riusciti da più di 30 ore.
- Da riga di comando:

  ```bash
  make backup-stato                    # stato dell'ultimo backup
  make backup                          # backup immediato
  ls -lh backups/                      # file presenti
  ```

  In produzione aggiungere `COMPOSE=docker-compose.https.yml`.

---

## Copia fuori dal server (da organizzare)

I backup stanno sullo stesso computer del database: proteggono da errori,
cancellazioni e aggiornamenti andati male, **non** da un guasto del disco, un
furto o un ransomware. La cartella `backups/` va copiata regolarmente altrove:
un disco esterno, un NAS, un servizio cloud. Basta copiare i file: sono
completi e indipendenti fra loro.

I file contengono i dati dei clienti: la copia va tenuta in un luogo protetto.

---

## Ripristino

```bash
./scripts/backup/ripristina.sh sissibol-20261001-023000.dump [docker-compose.https.yml]
# oppure:  make ripristina FILE=sissibol-20261001-023000.dump
# Windows: .\scripts\backup\ripristina.ps1 sissibol-20261001-023000.dump
```

Il file deve trovarsi nella cartella `backups/` (per ripristinare una copia
esterna, copiarla prima lì). Lo script:

1. verifica che il backup sia leggibile;
2. chiede di scrivere `RIPRISTINA`;
3. fa un **backup di sicurezza** dello stato attuale, per poter tornare
   indietro (si salta solo con `SENZA_BACKUP_DI_SICUREZZA=1`, se il database
   attuale è inutilizzabile);
4. ferma il backend, ripristina **in un'unica transazione** (se qualcosa va
   storto, il database resta esattamente com'era), riavvia il backend, che
   applica le eventuali migrazioni più recenti del backup.

Le ricevute si ripristinano estraendo l'archivio nella cartella
`backend/uploads`:

```bash
tar -xzf backups/sissibol-20261001-023000-ricevute.tar.gz -C backend/uploads
```

### Verificato

Sull'archivio reale: backup, ripristino in un database nuovo e confronto
(stessi conteggi di veicoli, scadenze, pagamenti, avvisi e registro, stessa
somma degli importi). Un backup troncato viene rifiutato durante il
ripristino, e il database resta intatto.

---

## Configurazione

| Variabile | Default | |
|---|---|---|
| `BACKUP_ORA` | `02:30` | ora del backup giornaliero |
| `BACKUP_GIORNI` | `14` | giorni di conservazione dei giornalieri |
| `BACKUP_MESI` | `12` | mesi di conservazione dei mensili |
| `APP_FUSO_ORARIO` | `Europe/Rome` | fuso dell'ora di backup |

Lo script è `scripts/backup/backup.sh`, POSIX `sh`: gira nell'immagine
`postgres:15-alpine`, la stessa versione del server, quindi `pg_dump` è
sempre compatibile.

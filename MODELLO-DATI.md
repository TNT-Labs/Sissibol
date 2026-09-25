# Modello dati

Questo documento descrive le scelte di modellazione introdotte nella **Fase 1**
della reingegnerizzazione, e il perché di ciascuna. Serve a chi deve modificare
lo schema: le decisioni qui sotto hanno tutte una ragione misurata, non una
preferenza stilistica.

---

## 1. La scadenza ha una data

### Prima

`Scadenza` era identificata da `meseScadenza` e `annoScadenza`, eredità diretta
dell'archivio Access. Conseguenze:

- ogni consumatore ricostruiva la data a mano (cinque utility di date nello
  stesso servizio);
- nessun indice poteva coprire un intervallo di date, quindi "in scadenza nei
  prossimi 30 giorni" si risolveva con una `OR` su mese/anno seguita da un
  ri-filtro in memoria, perché il confine dei 30 giorni non coincide con il
  confine del mese;
- l'import **scartava** la data reale del CSV per tenere solo mese e anno.

### Dopo

`scadenze.data_scadenza DATE NOT NULL` è la fonte di verità.
`mese_scadenza` e `anno_scadenza` restano per compatibilità con API e
interfaccia, e un vincolo `CHECK` impedisce che divergano:

```sql
CHECK (EXTRACT(MONTH FROM data_scadenza) = mese_scadenza
   AND EXTRACT(YEAR  FROM data_scadenza) = anno_scadenza)
```

Nel codice esiste un solo punto che valorizza i tre campi insieme
(`ScadenzeService.campiDataScadenza`), perché il vincolo rifiuta qualsiasi
scrittura parziale.

### La migrazione è senza perdita, verificato

Il backfill usa l'ultimo giorno del mese. Non è un'approssimazione: **tutte le
138.725 date dell'archivio di origine cadono a fine mese**, verificato riga per
riga prima di scrivere la migrazione. Dopo l'applicazione, le 124.568 date
prodotte sono state confrontate una a una con il CSV originale:
**100% coincidenti**.

L'import ora scrive la data originale dell'archivio, non una ricostruzione.

---

## 2. Le date sono normalizzate a mezzanotte UTC

`parseMDBDate` costruiva le date nel fuso locale. Tutte finiscono in colonne
`DATE` (scadenza, pagamento, immatricolazione), dove conta il giorno e non
l'istante: su un server con offset positivo — `Europe/Rome`, cioè la
destinazione naturale di questa applicazione — mezzanotte locale è il giorno
*precedente* in UTC, e la data veniva salvata con un giorno di scarto.

Il difetto non si manifesta su un container UTC, quindi sarebbe rimasto
invisibile fino alla messa in produzione. Corretti anche due punti in
`ScadenzeService` che leggevano con getter locali date già normalizzate in UTC;
il secondo, `dataImmatricolazione.getMonth()`, avrebbe generato le scadenze
**nel mese sbagliato** per i veicoli immatricolati il primo del mese su un
server con offset negativo.

---

## 3. Lo zero non è un valore

### Il problema

L'import scriveva `0` dove il dato mancava. Nel database:
**2.437 veicoli su 2.438 avevano `potenza_kw = 0` e nessuno aveva `NULL`.**

Così la lacuna era invisibile: una query su `IS NULL` non restituiva nulla e lo
zero sembrava un valore misurato. È la ragione per cui il fatto che il motore
non calcolasse nulla per l'intero parco veicoli non era mai emerso.

### La scelta

Le grandezze fisiche mancanti sono `NULL`; un vincolo `CHECK` impone che i
valori presenti siano positivi. Il dato mancante diventa interrogabile, ed è la
premessa del rapporto di completezza (§6).

Il calcolo non è cambiato: il motore tratta già `0` e `NULL` allo stesso modo.
Il golden master lo conferma — **zero differenze su 684 voci** dopo la
normalizzazione.

---

## 4. I domini sono vincolati dal database

Il motore seleziona le tariffe confrontando `tipoVeicolo`, `classeAmbientale`,
`alimentazione`, `tipoSospensione` e `regione` per **uguaglianza esatta di
stringa**. Una variante di scrittura — `autovettura` minuscolo, `Autocarro `
con spazio finale, `EURO 4` — non corrisponde ad alcuna tariffa e produce un
bollo di zero euro senza alcun errore: l'importo sbagliato sembra valido.
Finora nulla impediva a un client dell'API di scriverli.

I cinque campi hanno ora un vincolo `CHECK` con l'elenco dei valori ammessi.

**Perché `CHECK` e non un enum Prisma.** Gli enum Prisma con `@map` esporrebbero
in JavaScript il nome dell'enum (`AUTOVETTURA`) e non il valore memorizzato
(`Autovettura`), rompendo il confronto con `tariffe_bollo.tipo_veicolo`, che
resta una stringa libera. Convertire entrambi è lavoro che appartiene alla
riscrittura del motore (Fase 2), quando le tabelle di mappatura interne
(`CATEGORIA_TARIFFARIA_AUTOVETTURE` e simili) verranno comunque rifatte. Il
vincolo `CHECK` ottiene l'effetto utile — impedire che i dati peggiorino —
senza anticipare quel lavoro. Aggiungere un valore costa una migrazione di una
riga, accettabile per domini che cambiano una volta ogni dieci anni.

**I `NULL` restano ammessi**: un campo non valorizzato è una lacuna da sanare,
non un errore di validità. Il vincolo impedisce che la situazione peggiori, non
pretende di risolverla.

`Motrice` e `Altro`, prodotti dall'import, sono ammessi pur non avendo alcuna
tariffa corrispondente: rifiutarli significherebbe rifiutare dati già presenti.
Vanno riclassificati durante la bonifica, e il rapporto di completezza li
elenca come tali. Non sono stati rimappati d'ufficio perché indovinare la
categoria di un veicolo cambierebbe un importo.

---

## 5. Avvisi e registro delle modifiche

### Avvisi

L'archivio Access tracciava, per ogni scadenza, la data del primo e del secondo
avviso al cliente. La prima migrazione non aveva importato quelle colonne,
facendo perdere allo studio **la prova di aver avvisato il cliente**: il
requisito principale di uno scadenziario e la prima cosa da dimostrare in caso
di contestazione.

La tabella `avvisi` la ripristina. L'import recupera lo storico: **3.036 avvisi
(2.674 primi, 362 secondi), verificati al 100% contro l'archivio**. Quelli
storici hanno canale `ARCHIVIO`, perché dell'originale si conosce la data ma non
il mezzo con cui fu inviato.

Un vincolo di unicità `(id_scadenza, tipo)` rende la generazione idempotente:
rieseguirla non produce doppioni né doppi invii.

**Ambito**: gli avvisi vengono maturati e registrati; l'invio vero e proprio
(email al cliente, gestione dei fallimenti di consegna, solleciti) è della fase
successiva. `esito` resta `DA_INVIARE` finché un mittente non lo aggiorna.

### Registro delle modifiche

`audit_log` è un registro append-only di chi ha cambiato cosa, quando, e da
quale valore a quale. Collegato ai percorsi che muovono denaro: creazione,
modifica ed eliminazione dei pagamenti, e variazioni dell'importo previsto di
una scadenza.

Tre scelte deliberate:

1. **Nessuna chiave esterna verso l'entità tracciata.** Cancellare un pagamento
   non deve cancellare la prova di averlo registrato.
2. **Un errore del registro non fa fallire l'operazione.** Perdere una riga di
   audit è meno grave che impedire la registrazione di un pagamento; l'errore
   viene loggato.
3. **Importi e date serializzati come stringa.** `Decimal` e `Date` non
   sopravvivono a `JSON.stringify` nella forma attesa; la stringa è la forma
   stabile per un registro destinato a essere riletto anni dopo.

---

## 6. Cosa resta da fare, e perché non è stato fatto qui

### Lo stato della scadenza resta una colonna

`stato` (`DA_PAGARE` / `PAGATO` / `SCADUTO`) è dato derivato da
`(data_scadenza, pagamenti)`, e in teoria non andrebbe memorizzato.

Non è stato reso calcolato perché non è possibile farlo bene: una colonna
generata Postgres non può dipendere da `now()` né da una join, e una vista
richiederebbe di riscrivere ogni query — su oltre centomila righe i filtri per
stato devono poter usare un indice.

La riconciliazione ora confronta direttamente `data_scadenza < oggi` e sfrutta
l'indice `(stato, data_scadenza)`. Resta uno scarto possibile fra un giro del
cron e il successivo; è un'etichetta di stato, non un importo.

### La bonifica dei dati

Il rapporto di completezza (`npm run dati:completezza --workspace=backend`)
elenca, veicolo per veicolo, quali campi mancano e su quale riquadro della carta
di circolazione trovarli. Sul parco attuale:

| Campo mancante | Veicoli |
|---|---|
| `tipoVeicolo` | 2.270 |
| `pesoComplessivoKg` | 113 |
| `potenzaKw` | 45 |
| `classeAmbientale` | 45 |
| `tipoVeicolo` non tariffato (`Motrice`, `Altro`) | 10 |
| `regione` | 1 |

**Veicoli con dati sufficienti al calcolo: 0 su 2.438.**

È il vincolo che condiziona la Fase 2: senza questi dati, anche un motore di
calcolo corretto continuerebbe a restituire zero. La riscrittura del motore e la
bonifica dei dati vanno pianificate insieme.

### Altri punti annotati nei test

- ~~il motore restituisce `0` invece di dichiarare il calcolo impossibile~~:
  risolto dal motore 2, vedi `MOTORE-CALCOLO.md`;
- un pagamento su veicolo di regione non configurata viene registrato **senza
  snapshot**, quindi senza tracciabilità dell'importo (ora almeno annotato nel
  registro delle modifiche);
- il locking ottimistico dei pagamenti si attiva solo se il client invia
  `version` (ora annotato nel registro quando non accade);
- `updateScaduteAutomaticamente` aggiorna anche le scadenze di clienti
  disattivati, mentre `findAll` le esclude: i due percorsi restano incoerenti;
- la periodicità letta dall'archivio ricade su `ANNUALE` per qualunque valore
  anomalo (0, 14, 137, 138, 139) senza segnalazione;
- l'archivio contiene scadenze datate fino al 2050 e almeno una targa con un
  carattere spurio (`AW532PY,`): dati da ripulire.

---

## Migrazioni della fase 1

| Migrazione | Contenuto |
|---|---|
| `20260922000000_scadenza_data_effettiva` | `data_scadenza`, backfill, vincoli di coerenza, indici |
| `20260922000001_avvisi_e_audit_log` | tabelle `avvisi` e `audit_log` con i relativi enum |
| `20260922000002_validita_tariffe` | `valido_da` / `valido_a` sul tariffario |
| `20260922000003_vincoli_dominio_veicoli` | normalizzazione degli zeri e vincoli di dominio |

Tutte applicate e verificate su un database popolato con l'archivio reale
(2.438 veicoli, 124.568 scadenze, 19.169 pagamenti); l'intera catena è
riapplicata da zero a ogni esecuzione dei test di integrazione, in locale e in
CI.

# Rete di sicurezza dei test

Questo documento descrive l'infrastruttura di test introdotta come **Fase 0**
della reingegnerizzazione: la rete di sicurezza che deve esistere *prima* di
toccare il modello dati e il motore di calcolo.

Il principio è uno solo: **nessun importo può cambiare per sbaglio**. Ogni
modifica che sposta un euro deve farlo in modo visibile, in un diff che si
possa leggere e approvare.

---

## I tre livelli

| Livello | Cosa copre | Serve il database? | Comando |
|---|---|---|---|
| Unit | Funzioni pure: mapping di import, motore di calcolo con Prisma mockato | No | `npm test --workspace=backend` |
| Golden master | Il motore di calcolo su tutto il parco veicoli reale + casi limite | No | incluso in `npm test` |
| Integrazione | Migrazioni, filtri annidati, transazioni, locking ottimistico | Sì | `npm run test:integration --workspace=backend` |

```
backend/test/
├── helpers/frozen-time.ts          orologio congelato (determinismo)
├── unit/import-mapping.spec.ts     parsing e mapping dell'archivio Access
├── golden/
│   ├── fixtures/
│   │   ├── tariffario.json         snapshot di tariffe ed esenzioni
│   │   ├── veicoli.corpus.json     veicoli reali deduplicati + casi sintetici
│   │   └── bollo.golden.json       importi attesi (generato)
│   ├── prisma-stub.ts              serve i fixture al motore, senza database
│   ├── compute.ts                  esecuzione condivisa generatore/test
│   └── golden-master.spec.ts       il confronto
├── integration/
│   ├── setup/                      migrazioni, reset, factory
│   ├── scadenze.int-spec.ts
│   └── pagamenti.int-spec.ts
└── tools/                          generatori dei fixture e diagnostica
```

---

## Il golden master

### Cosa fa

Esegue `BolloService.calcolaBollo` su **338 veicoli** (272 firme distinte
estratte dai 2.438 veicoli reali dell'archivio, più 70 casi costruiti a mano)
per due periodicità, e confronta ogni risultato — importo, sconto RID,
esenzioni, tariffe applicate, note e dettaglio del calcolo — con il fixture.

I veicoli reali sono **deduplicati per firma di calcolo**: due veicoli che
differiscono solo per targa o cliente producono lo stesso importo, quindi ne
basta uno. Ogni rappresentante porta il campo `occorrenze`, che dice quanti
veicoli reali ricadono in quel caso: è ciò che permette di quantificare
l'impatto di una modifica.

I casi sintetici coprono i rami che i dati reali non toccano (autocarri con
peso, motocicli, rimorchi, esenzioni per alimentazione) e le soglie esatte
(100 KW, 11 KW, 12 tonnellate, 5 e 30 anni di anzianità).

### Determinismo

Il motore usa `new Date()` per l'anzianità del veicolo. Senza accorgimenti gli
importi cambierebbero da soli col passare dei giorni. Tutto gira quindi con
l'orologio congelato al **2026-06-15T12:00:00Z** (`GOLDEN_REFERENCE_DATE` in
`test/helpers/frozen-time.ts`), sia in generazione sia in verifica.

Cambiare quella costante richiede rigenerare i fixture; un test apposito lo
verifica.

### Quando un importo cambia di proposito

```bash
cd backend
npx ts-node test/tools/generate-golden.ts   # oppure: npm run golden:genera
git diff test/golden/fixtures/bollo.golden.json
```

**Il diff va letto, non solo committato.** È lì che si vede quali veicoli sono
cambiati, di quanto, e se il cambiamento è quello che si voleva. Il blocco
`riepilogo` in testa al fixture dà il colpo d'occhio: quanti veicoli passano da
importo zero a importo calcolato, quanti entrano o escono dagli errori.

### Rigenerare corpus e tariffario

Servono solo se cambiano il seed delle tariffe o i dati di archivio. Richiedono
un database con tariffe e veicoli importati:

```bash
cd backend
export DATABASE_URL=postgresql://...
npm run prisma:migrate:deploy
npm run prisma:seed
npm run prisma:import-mdb

npm run golden:tariffario   # test/golden/fixtures/tariffario.json
npm run golden:corpus       # test/golden/fixtures/veicoli.corpus.json
npm run golden:genera       # test/golden/fixtures/bollo.golden.json
```

Lo stesso `tariffario.json` alimenta anche i test di integrazione, così i due
livelli non possono divergere.

---

## Test di integrazione

Girano su un PostgreSQL reale perché molte parti del sistema non sono
verificabili con un mock: filtri annidati su cliente/veicolo attivi,
`updateMany` con `OR` su mese/anno, transazioni, vincoli di integrità,
locking ottimistico.

```bash
# PostgreSQL locale o in container
docker run -d --name sissibol-test -p 5433:5432 \
  -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=sissibol_test \
  postgres:15-alpine

cd backend
DATABASE_URL_TEST=postgresql://test:test@localhost:5433/sissibol_test \
  npm run test:integration
```

`DATABASE_URL_TEST` è volutamente distinto da `DATABASE_URL`: la suite azzera
le tabelle fra un test e l'altro e non deve poter puntare per sbaglio a un
database di lavoro.

Il `globalSetup` applica le migrazioni con `prisma migrate deploy` su schema
vuoto: se la catena di migrazioni non è applicabile da zero, la suite fallisce
subito. In CI lo stesso controllo gira a ogni push.

---

## Diagnostica: divario rispetto all'archivio

`test/tools/legacy-diff.ts` confronta gli importi calcolati dal motore con
quelli **realmente addebitati** nell'archivio Access — l'unico riferimento
oggettivo disponibile.

```bash
cd backend
DATABASE_URL=postgresql://... npx ts-node test/tools/legacy-diff.ts 2026
```

### Misura di partenza (settembre 2026)

Su 2.436 veicoli con importo in archivio, tariffario Lombardia 2026:

```
  importo coincidente:          0 (0.0%)
  calcolato 0 (non calcolabile): 2426 (99.6%)
  calcolo in errore:            10 (0.4%)

  totale a archivio:  € 205.276,61
  totale calcolato:   €      0,00
```

Le cause, quantificate dal golden master:

| Causa | Veicoli |
|---|---|
| Potenza KW non valorizzata all'import | 2.316 |
| Autocarri senza peso complessivo né portata | 112 |
| Regione priva di tariffario configurato e senza fallback `DEFAULT` | 10 |

L'import da Access non valorizza `classeAmbientale`, `alimentazione`,
`cilindrata`, `portataKg` e `pesoComplessivoKg`, e per 2.268 veicoli nemmeno
`tipoVeicolo` (il codice `Tipo` vale 0, che non esiste nella tabella di
lookup). Il motore, privo di questi dati, restituisce 0 con una nota anziché
segnalare che il calcolo non è possibile.

**Questo numero è la metrica della Fase 2.** Il rifacimento del motore e la
bonifica del dominio dovranno spostarlo, e questo strumento serve a
verificarne i progressi in modo oggettivo.

---

## Verificare che la rete funzioni davvero

Una rete di sicurezza che non cattura nulla è peggio di nessuna rete, perché dà
falsa fiducia. Per verificarla, si introduce una modifica deliberata nel motore
e si controlla che il golden master fallisca:

```bash
cd backend
# esempio: alterare l'arrotondamento in calcolaAutovettura
#   Math.round(importoTotale * 100) / 100  ->  Math.round(importoTotale * 10) / 10
npx jest test/golden     # deve FALLIRE elencando i veicoli divergenti
git checkout src/bollo/bollo.service.ts
```

Attenzione ai **mutanti equivalenti**: una modifica può non cambiare alcun
risultato sul corpus e quindi non essere catturata senza che sia colpa della
rete. È successo in fase di costruzione — il corpus non conteneva importi con
due decimali significativi, e le modifiche all'arrotondamento restavano
invisibili. Sono stati aggiunti casi apposta (`SYN-AUTO-E6-87`,
`SYN-AUTO-E6-113`, `SYN-GPL-87`). Se una modifica non viene catturata,
la domanda giusta è se al corpus manchi un caso.

---

## Cosa i test NON dicono

I fixture registrano il comportamento **attuale**, non quello corretto. Dove il
sistema oggi sbaglia, il golden master fotografa l'errore — apposta: serve a
rendere visibile la correzione quando arriverà.

I punti annotati nei commenti dei test, da affrontare nelle fasi successive:

- il motore restituisce `0` invece di dichiarare il calcolo impossibile;
- `updateScaduteAutomaticamente` aggiorna anche le scadenze di clienti
  disattivati, mentre `findAll` le esclude: i due percorsi sono incoerenti;
- un pagamento su veicolo di regione non configurata viene registrato **senza
  snapshot**, cioè senza tracciabilità dell'importo;
- il locking ottimistico dei pagamenti si attiva solo se il client invia
  `version`: un client che la omette lo scavalca;
- la periodicità letta dall'archivio ricade su `ANNUALE` per qualunque valore
  anomalo (0, 14, 137, 138, 139) senza segnalazione;
- `normalizeTipoVeicolo` produce `Motrice` e `Altro`, tipi per cui non esiste
  alcuna tariffa.

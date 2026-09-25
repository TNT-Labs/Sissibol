# Motore di calcolo del bollo

Questo documento descrive il motore di calcolo introdotto nella **Fase 2**
della reingegnerizzazione (versione `2.0.0`), le politiche che applica e ogni
differenza rispetto al motore precedente, con la sua ragione.

---

## Il principio

**Un importo che sembra valido ma non lo è è il peggior errore possibile.**

Il motore precedente, quando non poteva calcolare, restituiva zero con una nota;
e quando mancava un dato, lo inventava: la classe Euro più economica, due assi,
la Lombardia, il tipo "autovettura". Il risultato era sempre un numero, e quel
numero finiva negli importi previsti delle scadenze, nei ricalcoli e negli
snapshot di pagamento.

Il motore 2 ha tre esiti, e mai un numero inventato:

| Esito | Importo | Significato |
|---|---|---|
| `CALCOLATO` | dal tariffario | importo determinato |
| `ESENTE` | `0` | nulla da pagare, legittimamente |
| `NON_CALCOLABILE` | `null` | mancano dati o tariffe; i **motivi** dicono quali |

Un esito `NON_CALCOLABILE` porta sempre i motivi, ciascuno con un codice e,
quando riguarda un dato del veicolo, il campo da completare:

| Codice | Rimedio |
|---|---|
| `DATO_MANCANTE` | completare il campo indicato |
| `DATO_NON_VALIDO` | correggere il campo indicato |
| `TIPO_NON_GESTITO` | riclassificare il veicolo (`Motrice`, `Altro`...) |
| `TARIFFA_MANCANTE` | aggiungere la tariffa nella pagina Tariffe |
| `FUORI_FASCIA` | estendere le fasce del tariffario |
| `TARIFFA_AMBIGUA` | correggere righe sovrapposte o indistinguibili |
| `PERIODICITA_NON_PREVISTA` | il tariffario non prevede il quadrimestrale per quel veicolo |
| `TARIFFARIO_ASSENTE` | configurare il tariffario della regione, o un `DEFAULT` |

---

## Struttura

```
backend/src/bollo/
├── motore/                 modulo PURO: niente database, framework, orologio
│   ├── tipi.ts             input e risultato
│   ├── numeri.ts           aritmetica decimale, fasce, anni compiuti
│   ├── regole.ts           una regola per famiglia di veicoli
│   ├── esenzioni.ts        esenzioni e riduzioni, dichiarative
│   ├── calcola.ts          sequenza: esenzioni -> regola -> riduzione -> RID
│   ├── versione.ts         VERSIONE_MOTORE
│   └── motore.spec.ts      test delle politiche, una per una
└── bollo.service.ts        adattatore: carica veicolo e tariffario, chiama il motore
```

Il motore riceve tutto come dati — veicolo, tariffario, periodicità, data di
riferimento — e a parità di input produce sempre lo stesso output. Un test
verifica che nessun suo file importi Prisma, NestJS o altri moduli
dell'applicazione. I valori decimali viaggiano come stringhe e i calcoli usano
`decimal.js`.

`BolloService` passava da circa 925 righe di calcolo a un adattatore: seleziona
il tariffario (con ripiego su `DEFAULT`), converte i dati e riporta il risultato
nella forma dell'API. Solleva un'eccezione solo per un veicolo inesistente;
ogni altra impossibilità è un esito.

---

## Politiche

### Dati mancanti

- **Dati della formula** (tipo, potenza, classe Euro, peso, portata, assi,
  sospensioni, cilindrata, posti, massa rimorchiabile, regione): se mancano, il
  bollo è `NON_CALCOLABILE`. Vengono elencati **tutti insieme**, non solo il
  primo, così l'operatore completa il veicolo in una volta.
- **Dati di un beneficio** (alimentazione, data di immatricolazione): se
  mancano, l'esenzione o riduzione che ne dipende **non viene concessa**; il
  calcolo prosegue e lo dichiara fra le `assunzioni`. Un'assunzione compare
  solo se il beneficio non valutato avrebbe potuto cambiare il risultato.

### Fasce del tariffario

Una tariffa si applica solo se il veicolo rientra nella sua fascia. Se non
rientra in nessuna, `FUORI_FASCIA`; se ne soddisfa più d'una in modo
indistinguibile, `TARIFFA_AMBIGUA`. Gli scaglioni progressivi (autovetture)
sono controllati per sovrapposizioni: il tariffario è modificabile
dall'interfaccia e un errore di inserimento non deve far pagare due volte lo
stesso scaglione.

Gli estremi delle fasce, che il tariffario non dichiara, seguono la convenzione
storica di ciascuna grandezza, ora esplicita in `numeri.ts`:

| Grandezza | Estremi |
|---|---|
| potenza autovetture (scaglioni) | minimo escluso, massimo incluso |
| potenza motocicli | minimo escluso, massimo incluso |
| portata, cilindrata, peso, massa rimorchiabile | minimo incluso, massimo escluso |
| assi, posti (interi) | entrambi inclusi |

### Periodicità

Per una scadenza quadrimestrale si usano **solo** le tariffe quadrimestrali. Se
il tariffario non ne prevede per quel veicolo, l'esito è
`PERIODICITA_NON_PREVISTA`.

### Esenzioni e riduzioni

- Un'esenzione si applica se **tutti** i criteri che dichiara sono soddisfatti.
- Un'esenzione totale prevale e non richiede i dati tecnici del veicolo.
- Fra più riduzioni parziali si applica **la sola più vantaggiosa**
  (`POLITICA_CUMULO` in `esenzioni.ts`).
- `anniDaImmatricolazione` insieme a un'alimentazione è un periodo di validità
  ("primi 5 anni": finché il veicolo non li ha compiuti); da solo è una soglia
  minima ("ultratrentennali": dal trentesimo anno compiuto).

### Arrotondamenti

Al centesimo, metà verso l'alto, in aritmetica decimale, negli stessi punti del
motore precedente: importo lordo, importo dopo la riduzione, importo con sconto.
Il motore precedente usava numeri in virgola mobile, che su alcuni valori
sbagliano di un centesimo (`1.005 * 100 = 100.49999999999999`).

### Anzianità del veicolo

È misurata alla data odierna, come nel motore precedente, ma la data è un
parametro del motore e non una lettura dell'orologio. Vedi i punti aperti.

---

## Differenze rispetto al motore precedente

Verificate con il golden master: su 684 voci (272 firme di veicoli reali e 70
casi costruiti, per due periodicità), lo strumento `confronta-golden.ts`
classifica ogni differenza.

| Categoria | Voci | Veicoli reali |
|---|---|---|
| Invariato | 48 | — |
| Zero → non calcolabile | 561 | 2.428 |
| Importo → non calcolabile | 54 | 0 |
| Errore → non calcolabile | 14 | 10 |
| Esente → calcolato | 3 | 0 |
| Esente → non calcolabile (quadrimestrale) | 3 | 0 |
| **Importo cambiato** | **1** | 0 |

**Tutti i 48 casi che il motore precedente calcolava correttamente sono
identici al centesimo**, importo con sconto compreso. Nessuna delle differenze
riguarda un veicolo reale per cui il motore precedente producesse un importo:
sui dati dell'archivio non ne produceva nessuno.

### Le correzioni, una per una

1. **Zero invece di "non calcolabile".** Il motore restituiva zero per ogni
   veicolo senza i dati necessari: 2.428 veicoli reali su 2.438. Lo zero era
   indistinguibile da un'esenzione.

2. **Quadrimestrale al prezzo annuale.** Per tutti i veicoli tranne gli
   autocarri da 12 t in su, una scadenza quadrimestrale riceveva l'importo
   annuale: tre volte l'anno. Gli importi quadrimestrali dell'archivio sono in
   effetti circa un terzo di quelli annuali.

3. **Elettrici esenti un anno di troppo.** La condizione era `anni <= 5`: un
   veicolo di 5 anni e un giorno risultava esente, mentre la riduzione parziale
   configurata per lui si chiama "elettrici **oltre** i 5 anni". Ora
   l'esenzione vale finché il veicolo non ha compiuto 5 anni.

4. **Elettrici senza data esenti.** Senza data di immatricolazione il motore
   assumeva "0 anni" ed esentava. Ora l'esenzione totale non è concessa senza
   il dato che la giustifica; si applica la riduzione parziale, che non ne ha
   bisogno, e lo si dichiara fra le assunzioni.

5. **Cumulo delle riduzioni dipendente dall'ordine.** Il codice dichiarava di
   voler applicare la riduzione più vantaggiosa senza cumulare anzianità e
   alimentazione, ma per come erano ordinate le valutazioni una vettura GPL
   ultratrentennale riceveva 50% + 25% e un'elettrica ultratrentennale no.
   Ora si applica sempre la sola più vantaggiosa: 300 € diventano 150 € e non
   75 €. **È l'unico importo calcolato che cambia.**

6. **Assunzioni silenziose.** Classe Euro mancante → Euro 4, la tariffa più
   bassa; classe non riconosciuta → idem; tipo mancante → autovettura; regione
   mancante → Lombardia; assi mancanti → 2; sospensioni mancanti →
   pneumatiche. Ora ciascuno è un dato mancante dichiarato.

7. **Soglie ignorate.** Un rimorchio da 5 t pagava la tariffa "rimorchi sotto
   le 3,5 t"; una portata oltre l'ultima fascia o una cilindrata oltre i 500 cc
   davano zero. Ora `FUORI_FASCIA`.

8. **Trattore stradale.** Il tariffario non contiene la sua tassa di base, e
   le quattro righe della tassa aggiuntiva hanno tutte la stessa fascia (i
   criteri sono solo nella descrizione). Il motore prendeva la prima riga, per
   ordine di inserimento: un trattore da 40 t pagava 267 € l'anno. Ora
   l'esito elenca entrambi i problemi del tariffario.

9. **Tipi senza tariffa.** `Autotreno`, `Autoarticolato` e `Semirimorchio` non
   hanno righe nel tariffario, `Motrice` e `Altro` nemmeno una regola di
   calcolo: davano zero, ora sono dichiarati.

10. **Regioni senza tariffario.** Sollevavano un'eccezione; ora sono un esito
    `NON_CALCOLABILE` con motivo `TARIFFARIO_ASSENTE`.

### Effetti sui servizi

Il motore precedente propagava il suo zero ovunque. Ora:

- **creazione e generazione di scadenze**: l'importo previsto resta vuoto, e la
  generazione conta le scadenze create senza importo;
- **ricalcolo di una scadenza**: se il bollo non è calcolabile l'importo
  esistente non viene toccato, e l'errore spiega cosa manca. Prima veniva
  sovrascritto con zero, cancellando l'importo importato dall'archivio o
  inserito a mano;
- **aggiornamento massivo degli importi di un veicolo**: stesse garanzie, più
  la registrazione di ogni modifica nel registro;
- **snapshot di pagamento**: registra la versione del motore e le assunzioni,
  e il tariffario effettivamente applicato (prima riportava la regione del
  veicolo anche quando era stato usato il `DEFAULT`). Se il bollo non è
  calcolabile non viene creato alcuno snapshot: prima se ne salvava uno con
  importo zero, cioè una prova falsa;
- **interfaccia**: una scadenza senza importo mostra "Da calcolare" invece di
  "-", e una esente mostra `€ 0.00` invece dello stesso "-"; il pagamento
  multiplo avvisa quante scadenze saranno escluse perché senza importo; il
  ricalcolo impossibile spiega cosa manca invece di un avviso generico.

---

## Emerso durante la verifica

Tre problemi trovati eseguendo il nuovo motore e l'interfaccia sui dati reali.

### Il seed non creava più il tariffario (regressione della fase 1)

La migrazione che ha reso obbligatoria la validità del tariffario
(`valido_da`) ha rotto `prisma/seed.js`: una nuova installazione restava senza
tariffe e nessun bollo era calcolabile. Non se n'era accorto nessuno perché
l'avvio Docker esegue il seed con `|| echo 'Seed skipped'`, e la CI non gira sui
branch di lavoro. Corretti entrambi i seed; il nuovo test di integrazione
`seed.int-spec.ts` esegue il seed reale, fallisce senza la correzione, e
verifica anche che il tariffario creato coincida con quello su cui gira il
golden master.

### 98.087 scadenze con importo segnaposto di 1 € — risolto

Nessun importo reale dell'archivio è compreso fra 1 € e 20,98 €, ma 98.087
scadenze avevano importo esattamente 1 €: è il segnaposto con cui l'archivio
Access segnava un bollo non noto. Sembrava un importo valido, e il pagamento
multiplo avrebbe registrato pagamenti da 1 €.

| Stato | Scadenze a 1 € | Trattamento |
|---|---|---|
| da pagare (tutte dal 2026 in poi) | 61.805 | importo reso mancante |
| scadute | 25.409 | importo reso mancante |
| pagate, con un pagamento registrato di 1 € | 10.873 | invariate: fatti storici |

Deciso con lo studio. La migrazione `20260926000000_importi_segnaposto_archivio`
rende mancante (`NULL`) il segnaposto sulle scadenze non pagate e prive di
pagamenti, e registra ciascuna delle 87.214 modifiche nel registro con il
valore precedente: è tracciabile e reversibile (un test lo dimostra). Verificata
sul database ricostruito dall'archivio reale: 87.214 scadenze aggiornate, 87.214
voci di registro, pagate e pagamenti intatti. L'import applica la stessa regola
(`importoPrevistoDaArchivio`), quindi una nuova importazione arriva allo stesso
stato senza passare dalla migrazione.

Effetto collaterale utile: tolti i segnaposto, **solo 518 dei 2.436 veicoli
hanno un importo reale da qualche parte nell'archivio**. Per gli altri 1.918
l'archivio non ha mai registrato un bollo vero, e non può fare da riferimento
per verificare il motore.

### Pagina non utilizzabile da smartphone

A 390 px di larghezza l'applicazione debordava orizzontalmente e il pulsante
"Esci" finiva fuori dallo schermo. La causa principale era nel layout, quindi
valida per tutte le pagine: il contenuto principale, elemento di una riga flex,
non poteva restringersi sotto la larghezza del proprio contenuto
(`min-width: auto`), e ogni tabella larga allargava l'intera pagina. Corretti
il layout (`min-w-0`, barra superiore con sole icone sotto i 640 px) e la
pagina Scadenze (intestazioni che vanno a capo, tabella che scorre nel proprio
riquadro). Verificato con Playwright: debordamento da 133 px a 0, desktop
invariato.

---

## Problemi del tariffario Lombardia 2026

Emersi rendendo espliciti i motivi. Vanno corretti con il tariffario ufficiale
alla mano, dalla pagina Tariffe: **il motore non inventa importi, e nemmeno
questo lavoro lo ha fatto.**

| Problema | Effetto |
|---|---|
| Nessuna tassa di base per `Trattore stradale` | nessun trattore è calcolabile |
| Le 4 righe della tassa aggiuntiva trattori hanno tutte fascia 0-∞; i criteri (massa < 18 t, ≥ 18 t, 2 assi, 3 assi) sono solo nella descrizione | tariffa ambigua |
| Nessuna riga per `Autotreno`, `Autoarticolato`, `Semirimorchio` | non calcolabili |
| Portata oltre 8.000 kg senza fascia (autocarri fra 8 e 12 t) | fuori fascia |
| Cilindrata oltre 500 cc senza fascia (motocarri, motofurgoni) | fuori fascia |
| Righe `Autovettura ultratrentennale` e `Motociclo ultratrentennale` riferite a tipi che nessun veicolo può avere; l'iscrizione ai registri storici non è modellata | righe inutilizzate |
| Tariffe quadrimestrali presenti solo per autocarri da 12 t per assi | ogni altra scadenza quadrimestrale non è calcolabile |

---

## Decisioni dello studio e punti aperti

Confermati:

- **Cumulo delle riduzioni**: si applica la sola più vantaggiosa
  (`POLITICA_CUMULO`).
- **Tariffario Lombardia 2026**: le lacune elencate sopra vengono completate
  dallo studio, dalla pagina Tariffe, con il tariffario ufficiale.
- **Importi segnaposto di 1 €**: resi mancanti sulle scadenze non pagate,
  conservati su quelle pagate.

Ancora aperti:

- **Data di riferimento per l'anzianità.** Oggi è il giorno del calcolo, come
  prima; l'esenzione "primi 5 anni" andrebbe forse valutata rispetto al periodo
  d'imposta. Essendo un parametro del motore, il cambio è di una riga
  nell'adattatore.
- **Veicoli ultratrentennali iscritti ai registri storici.** Il tariffario ha
  una tassa fissa per loro, ma il veicolo non ha un campo che dica se è
  iscritto.
---

## Versionamento

`VERSIONE_MOTORE` (`motore/versione.ts`) è registrata in ogni snapshot di
pagamento. Va incrementata a ogni modifica che può spostare un importo:
maggiore per le regole e le politiche, minore per nuovi tipi o esiti, patch per
i soli testi. Gli snapshot precedenti alla riscrittura hanno versione `NULL`.

Quando una modifica cambia di proposito il comportamento:

```bash
cd backend
git show HEAD:backend/test/golden/fixtures/bollo.golden.json > /tmp/golden-prima.json
npm run golden:genera
npx ts-node test/tools/confronta-golden.ts /tmp/golden-prima.json test/golden/fixtures/bollo.golden.json
```

Lo strumento classifica ogni differenza ed esce con errore se un importo
calcolato è cambiato: quelle voci vanno giustificate una per una.

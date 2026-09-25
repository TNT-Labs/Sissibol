# Bonifica dei dati dei veicoli

Questo documento descrive la **Fase 4** della reingegnerizzazione: completare i
dati che servono a calcolare il bollo, e la pagina **Dati veicoli** che guida
quel lavoro.

---

## Il problema, misurato sull'archivio reale

Il motore di calcolo è corretto e verificato. Ma sui dati importati non può
calcolare nulla:

| | |
|---|---|
| Veicoli attivi | 2.438 |
| Con il bollo calcolabile | **0** |
| Scadenze del 2026 senza importo | 1.278 |

L'archivio Access **non contiene** i dati mancanti: la colonna `Tipo` vale 0 per
2.471 mezzi, `KW` per 2.706, `NumAssi` per 2.701. Non c'è niente da recuperare
con un nuovo import. I dati vanno letti sulle carte di circolazione. I tipi non
sono stati ricostruiti con regole automatiche, perché indovinare la categoria di
un veicolo cambierebbe un importo.

Cosa manca, primo blocco per veicolo:

| Dato | Veicoli | Dove trovarlo |
|---|---|---|
| Tipo di veicolo | 2.270 | riquadro J |
| Peso complessivo | 65 | riquadro F.2 |
| Massa rimorchiabile | 47 | riquadro O.1 |
| Classe ambientale | 45 | riquadro V.9 |
| Potenza (kW) | 45 | riquadro P.2 |
| Regione | 1 | sede del proprietario |

Il motore chiede i dati **un blocco alla volta**: a un autocarro senza tipo non
si possono ancora chiedere gli assi, finché non si sa se supera le 12
tonnellate. Dopo ogni completamento il veicolo va rivalutato, e la pagina lo fa.

Problemi del **tariffario**, che non si risolvono sui veicoli:

| Problema | Veicoli |
|---|---|
| Manca la tassa di base per il trattore stradale | 47 |
| Nessun tariffario per Trentino-Alto Adige, Lazio, Veneto | 10 |
| Nessuna tariffa per semirimorchi, autotreni, autoarticolati (emergerà assegnando i tipi) | — |

---

## La pagina Dati veicoli

- **Avanzamento**: veicoli con il bollo calcolabile sul totale, e scadenze senza
  importo. È la misura della bonifica.
- **Cosa manca**: un filtro per ogni dato mancante, con il riquadro della carta
  di circolazione in cui trovarlo.
- **Periodicità**: i veicoli che pagano ogni quattro mesi sono per forza mezzi
  pesanti, da 12 tonnellate in su. È un buon punto di partenza per classificarli
  (sono 1.128).
- **Completa**: un modulo con i soli dati che il motore chiede. Dopo il
  salvataggio mostra quelli successivi oppure l'importo calcolato. Con
  **Veicolo successivo** si prosegue senza tornare alla lista.
- **Modifica multipla**: si selezionano più veicoli e si imposta per tutti lo
  stesso tipo, classe ambientale, alimentazione, regione o sospensione. Una
  flotta ha spesso molti mezzi uguali. Potenza e pesi non si impostano in blocco:
  sono propri di ciascun mezzo.
- **Esporta elenco**: CSV per Excel, da lavorare con le carte di circolazione
  sottomano.

La stessa analisi è disponibile da riga di comando, con lo stesso servizio:

```bash
cd backend
DATABASE_URL=postgresql://... npm run dati:completezza
DATABASE_URL=postgresql://... npx ts-node test/tools/completezza-dati.ts --csv da-completare.csv
```

---

## Cosa succede quando si completano i dati

1. **Gli importi mancanti vengono calcolati subito.** Le scadenze da pagare
   ancora senza importo lo ricevono appena il veicolo diventa calcolabile.
   Questo vale per ogni modifica del veicolo, anche dalla pagina Veicoli.
2. **Gli importi esistenti non vengono toccati.** Quelli dell'archivio o
   inseriti a mano restano come sono. Per ricalcolarli tutti dal tariffario c'è
   `POST /bollo/aggiorna-scadenze/:idVeicolo`, come scelta esplicita.
3. **Ogni modifica dei dati di calcolo viene registrata**: chi, quando, e il
   valore prima e dopo. Prima non restava traccia di chi aveva cambiato, per
   esempio, la potenza di un veicolo, cioè il suo bollo.
4. **Le scadenze degli anni senza tariffario restano senza importo.** L'archivio
   contiene scadenze fino al 2050: riceveranno l'importo quando verrà inserito
   il tariffario del loro anno. Per questo il conteggio delle scadenze senza
   importo considera solo gli anni che hanno un tariffario.

---

## Valori validati dall'API

Tipo di veicolo, classe ambientale, alimentazione, sospensioni e regione hanno
valori ammessi, già imposti dal database fin dalla fase 1. Ora li controlla
anche l'API, con un messaggio che elenca i valori validi, invece di rispondere
500 senza spiegazione. Un test verifica che i valori dell'API coincidano con i
vincoli del database. Anche le grandezze fisiche (potenza, pesi, assi) devono
essere maggiori di zero: un dato non noto si lascia vuoto.

---

## API

| Metodo | Percorso | Cosa |
|---|---|---|
| GET | `/completezza?stato=&campo=&cerca=&periodicita=&pagina=&perPagina=` | rapporto e lista di lavoro |
| GET | `/completezza/veicolo/:id` | cosa manca a un veicolo, con i valori attuali |
| POST | `/completezza/imposta` | `{ idVeicoli, campo, valore }`: stesso valore su più veicoli (al massimo 200) |
| PATCH | `/veicoli/:id` | modifica; la risposta indica `importiCompletati` |

`stato`: `DA_COMPLETARE` (default, bollo non calcolabile), `CONSIGLIATI`
(calcolabile, ma senza i dati per valutare esenzioni), `TUTTI`.

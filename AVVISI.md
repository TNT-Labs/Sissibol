# Avvisi ai clienti

Questo documento descrive l'invio degli avvisi di scadenza ai clienti, introdotto
nella **Fase 3** della reingegnerizzazione: come funziona, come si attiva e quali
garanzie offre.

Lo scopo dello scadenziario è avvisare il cliente in tempo, e poterlo
dimostrare. Fino alla fase 1 gli avvisi venivano maturati e registrati, ma
nessuno li spediva.

---

## Come funziona

```
 ogni giorno alle AVVISI_ORA          su "Invia ora" o, se attivo, subito dopo
 ┌──────────────────────┐             ┌───────────────────────────────────────┐
 │ maturazione          │  DA_INVIARE │ invio                                 │
 │ 30 giorni: primo     │ ──────────▶ │ ricontrolla ogni avviso               │
 │  7 giorni: secondo   │             │ un'email per cliente                  │
 └──────────────────────┘             │ INVIATO / ERRORE / ANNULLATO          │
                                      └───────────────────────────────────────┘
```

1. **Maturazione.** Ogni giorno, per le scadenze da pagare di veicoli e clienti
   attivi, matura il primo avviso a 30 giorni dalla scadenza e il secondo a 7.
   È idempotente: un vincolo di unicità impedisce doppioni.
2. **Invio.** Gli avvisi in coda vengono ricontrollati uno per uno (la scadenza
   potrebbe essere stata pagata nel frattempo) e raggruppati per cliente:
   **un'email per cliente**, con l'elenco dei veicoli in scadenza, non una per
   targa. Lo studio ha clienti con decine di mezzi.

La pagina **Avvisi** mostra la coda, gli errori, gli invii e i clienti che non
possono essere avvisati perché manca un'email valida.

### Quando un avviso non parte

| Situazione al momento dell'invio | Esito |
|---|---|
| Scadenza pagata | Annullato |
| Scadenza superata o già scaduta | Annullato |
| Veicolo o cliente disattivato | Annullato |
| Il cliente non vuole ricevere avvisi | Annullato |
| Il primo avviso è ancora in coda | Il secondo viene **assorbito** dal primo |
| Il secondo avviso è già partito | Il primo viene annullato |
| Email del cliente mancante o non valida | Errore: si corregge l'email e lo si rimette in coda |

**Primo e secondo avviso insieme.** Se l'applicazione viene attivata a ridosso di
una scadenza (meno di 7 giorni), maturano entrambi. Il cliente riceve un solo
avviso, il primo, con il testo normale. Scrivergli "secondo avviso" quando non ha
mai ricevuto il primo sarebbe falso. La dicitura "secondo avviso" compare solo se
il primo è stato davvero inviato, anche se risulta dall'archivio storico.

---

## Garanzie

1. **Mai due volte lo stesso avviso.** Prima di spedire, ogni avviso viene preso
   in carico con un aggiornamento condizionato sul database
   (`DA_INVIARE → IN_INVIO`). Due invii contemporanei, anche da processi
   diversi, non possono prendere lo stesso avviso. Un test li esegue in
   parallelo e lo verifica.
2. **Mai un invio incerto ripetuto alla cieca.** Se il processo si ferma dopo
   aver spedito l'email ma prima di registrarlo, l'avviso resta `IN_INVIO`. Dopo
   15 minuti diventa `ERRORE` con esito incerto: meglio che una persona verifichi
   piuttosto che scrivere due volte al cliente.
3. **La prova dell'invio.** Sull'avviso restano data e ora, Message-ID del
   server di posta, destinatari, oggetto e testo inviato. L'anteprima di un
   avviso inviato mostra esattamente ciò che ha ricevuto il cliente.
4. **Un server di posta guasto non consuma i tentativi.** Gli errori vengono
   classificati:

   | Errore | Esempi | Cosa succede |
   |---|---|---|
   | Del server | credenziali errate, server irraggiungibile, 421 | L'invio si ferma e gli avvisi tornano in coda intatti |
   | Temporaneo | 4xx: casella piena, riprovare più tardi | Nuovo tentativo dopo 1 ora e poi dopo 6; al terzo fallimento diventa errore |
   | Definitivo | 5xx: indirizzo inesistente | Errore subito: serve correggere l'email |

5. **Nessun invio accidentale.** L'invio automatico è spento di default, anche
   con il server di posta configurato: vedi sotto.

---

## Attivazione

### 1. Server di posta

Nel file `.env` usato da Docker Compose, o nell'ambiente del backend:

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false              # true per la porta 465
SMTP_USER=avvisi@studio.it
SMTP_PASS=...
SMTP_FROM="Studio Rossi <avvisi@studio.it>"
```

Senza `SMTP_HOST` e senza un mittente (`SMTP_FROM` o `SMTP_USER`) le email sono
disattivate: gli avvisi maturano comunque, e la pagina Avvisi lo segnala.

### 2. Contenuto

```bash
AVVISI_FIRMA="Studio Rossi - Pratiche auto\nTel. 02 1234567"   # \n = a capo
AVVISI_RISPONDI_A=info@studio.it     # dove arrivano le risposte dei clienti
```

Il testo dell'email è in `backend/src/avvisi/composizione.ts`. L'anteprima nella
pagina Avvisi mostra l'email esatta prima dell'invio.

### 3. Prova, poi invio automatico

1. Dalla pagina Avvisi un amministratore usa **Invia ora** e controlla gli esiti.
   `GET /avvisi/verifica-smtp` verifica connessione e credenziali senza spedire
   nulla.
2. Quando il risultato è quello atteso:

   ```bash
   AVVISI_INVIO_AUTOMATICO=true
   AVVISI_ORA=09:00                         # nel fuso di APP_FUSO_ORARIO
   AVVISI_MAX_EMAIL_PER_ESECUZIONE=200      # limite per giro; i restanti al giro dopo
   ```

L'invio automatico è una scelta esplicita perché significa scrivere ai clienti
dello studio. Non deve essere l'effetto collaterale di aver configurato SMTP per
il riepilogo interno.

### Fuso orario

Gli orari (`AVVISI_ORA`, `NOTIFICHE_ORA`) sono interpretati nel fuso
`APP_FUSO_ORARIO`, predefinito `Europe/Rome`. Prima il riepilogo interno usava
il fuso del container, cioè UTC: "07:00" significava le 9 d'estate in Italia.

### Il cliente che non vuole avvisi

Nella scheda del cliente, l'opzione **Avvisi di scadenza via email**. Spenta:
non maturano nuovi avvisi, e quelli in coda vengono annullati.

---

## API

| Metodo | Percorso | Chi | Cosa |
|---|---|---|---|
| GET | `/avvisi/stato` | tutti | configurazione, conteggi, ultimo invio |
| GET | `/avvisi?esito=` | tutti | avvisi per esito (`DA_INVIARE`, `ERRORE`, `INVIATO`, `ANNULLATO`, `IN_INVIO`) |
| GET | `/avvisi/senza-recapito` | tutti | clienti con scadenze imminenti senza email valida |
| GET | `/avvisi/:id/anteprima` | tutti | email che partirebbe, o contenuto inviato |
| POST | `/avvisi/genera` | tutti | matura gli avvisi dovuti (idempotente) |
| POST | `/avvisi/rimetti-in-coda` | tutti | `{ ids }`: errori e annullati tornano in coda |
| POST | `/avvisi/:id/annulla` | tutti | annulla un avviso non inviato |
| POST | `/avvisi/invia` | ADMIN | invia ora |
| GET | `/avvisi/verifica-smtp` | ADMIN | verifica il server di posta |

Le operazioni manuali (rimettere in coda, annullare) sono registrate nel
registro delle modifiche con l'utente che le ha eseguite.

---

## Fuori ambito, per ora

- **Solleciti dopo la scadenza.** Il tipo `SOLLECITO` esiste nel modello, ma
  non viene maturato. Sollecitare un bollo già scaduto è una scelta dello
  studio: sull'archivio storico, attivarlo senza una finestra temporale
  scriverebbe a centinaia di scadenze vecchie.
- **Conferma di consegna e rimbalzi asincroni.** Il server di posta può
  accettare un'email e rifiutarla più tardi (bounce): quel rifiuto arriva alla
  casella del mittente, non all'applicazione.
- **Altri canali** (SMS, PEC).

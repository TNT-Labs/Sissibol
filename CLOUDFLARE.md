# Pubblicazione con Cloudflare Tunnel

Sissibol risponde su `https://shopbeautylab.it/bolli` (o su un sottodominio)
attraverso un **tunnel Cloudflare**: il computer dello studio apre una
connessione *in uscita* verso Cloudflare, e le richieste arrivano da lì.

- nessuna porta aperta sul router o sul computer, nessun IP pubblico esposto;
- certificati HTTPS gestiti da Cloudflare, senza rinnovi da seguire;
- protezioni di Cloudflare (WAF, limiti, Access) davanti all'applicazione.

```
browser ── HTTPS ──► Cloudflare ──tunnel──► cloudflared ─► nginx (/bolli) ─► backend ─► database
                     (TLS, WAF,           (connessione    solo rete        rete interna, senza
                      Access)              in uscita)     "tunnel"         accesso a Internet
```

`cloudflared` raggiunge solo nginx; backend e database stanno su una rete
Docker senza accesso a Internet e senza porte pubblicate.

---

## 1. Scelta dell'indirizzo

| | Indirizzo | Quando | Sicurezza |
|---|---|---|---|
| **A** (consigliata) | `https://gestione.shopbeautylab.it/bolli` | sempre possibile | **isolata** dal sito del negozio |
| **B** | `https://shopbeautylab.it/bolli` | il dominio principale non ospita nessun altro sito | stessa origine del dominio |
| **C** | `https://shopbeautylab.it/bolli` | il dominio principale ospita già il negozio | stessa origine del negozio |

**Perché il sottodominio è più sicuro.** Il browser separa i dati per
*origine* (schema + host). Con B e C l'applicazione condivide l'origine con
tutto ciò che gira su `shopbeautylab.it`: se una pagina del negozio venisse
compromessa (un plugin, un tag di marketing, uno script di terze parti), quello
script potrebbe usare la sessione di chi ha Sissibol aperto e leggere i dati
dei clienti. Con un sottodominio dedicato questo è impossibile. Il nome del
sottodominio è libero (`gestione`, `studio`, ...): meglio evitare nomi che
rivelino il contenuto.

Se si sceglie comunque B o C, **Cloudflare Access (punto 5) è
indispensabile**, non facoltativo.

---

## 2. Creare il tunnel

Prerequisito: il dominio è gestito da Cloudflare (nameserver di Cloudflare).

1. [Cloudflare One](https://one.dash.cloudflare.com) → **Networks → Tunnels →
   Create a tunnel** → *Cloudflared* → nome `sissibol`.
2. Nella pagina di installazione copiare il **token** (la lunga stringa dopo
   `--token`). Non serve eseguire il comando proposto: cloudflared gira nel
   container.
3. **Public hostname / Published application**, secondo la scelta del punto 1.
   Il *Service* è sempre `HTTP` → `frontend:8080`.

   | Scelta | Subdomain | Domain | Path |
   |---|---|---|---|
   | A | `gestione` | `shopbeautylab.it` | *(vuoto)* |
   | B | *(vuoto)* | `shopbeautylab.it` | `^/bolli(/\|$)` |
   | C | `sissibol-origine` (nome a piacere, non pubblicizzato) | `shopbeautylab.it` | *(vuoto)* |

   Con B **non** usare questa strada se il dominio ospita un altro sito:
   Cloudflare sposterebbe tutto il dominio sul tunnel e il sito smetterebbe
   di funzionare. In quel caso è la scelta C.

---

## 3. Configurare e avviare

```bash
cp .env.cloudflare.example .env
openssl rand -base64 32     # -> POSTGRES_PASSWORD
openssl rand -base64 48     # -> JWT_SECRET (almeno 32 caratteri, obbligatorio)
openssl rand -hex 32        # -> ORIGINE_SEGRETO, solo per la scelta C
```

Nel file `.env`:

- `APP_DOMINIO`: `gestione.shopbeautylab.it` (A) oppure `shopbeautylab.it` (B, C);
- `TUNNEL_TOKEN`: il token del punto 2;
- `ORIGINE_SEGRETO`: vuota per A e B, il valore generato per C.

```bash
docker compose -f docker-compose.cloudflare.yml up -d --build
docker compose -f docker-compose.cloudflare.yml ps          # tutti "healthy"
docker compose -f docker-compose.cloudflare.yml logs cloudflared | grep -i registered
```

Il tunnel risulta *Healthy* anche nella pagina Tunnels di Cloudflare. Per i
comandi `make` aggiungere `COMPOSE=docker-compose.cloudflare.yml`
(es. `make backup COMPOSE=docker-compose.cloudflare.yml`).

**Primo accesso**: `admin@sissibol.it` con la password provvisoria
(`ADMIN_PASSWORD_INIZIALE`, oppure quella generata:
`make admin-password COMPOSE=docker-compose.cloudflare.yml`). L'applicazione
chiede subito di sceglierne una personale; finché non è cambiata non mostra
alcun dato.

---

## 4. Solo scelta C: il Worker

Il Worker `cloudflare/worker-bolli.js` prende le richieste di
`shopbeautylab.it/bolli*` e le passa al tunnel; tutti gli altri percorsi
restano del negozio.

1. **Workers & Pages → Create → Worker** → nome `sissibol-bolli` → *Deploy*,
   poi *Edit code*: sostituire il codice con il contenuto di
   `cloudflare/worker-bolli.js` → *Deploy*.
2. **Settings → Variables and Secrets**:
   - `ORIGINE` (testo): `https://sissibol-origine.shopbeautylab.it`
   - `SEGRETO_ORIGINE` (**Secret**): lo stesso valore di `ORIGINE_SEGRETO`.
3. **Settings → Domains & Routes → Add → Route**: `shopbeautylab.it/bolli*`,
   zona `shopbeautylab.it`. Disattivare `workers.dev` e *Preview URLs*.

Con `ORIGINE_SEGRETO` impostata, nginx respinge (403) ogni richiesta che non
porta il segreto: l'indirizzo `sissibol-origine` non è utilizzabile
scavalcando il Worker. Il Worker inoltra all'applicazione solo il suo cookie,
non quelli del negozio, e le comunica l'IP reale del visitatore (serve ai
limiti dei tentativi). Se si cambia il segreto, aggiornarlo in entrambi i
posti e riavviare: `docker compose -f docker-compose.cloudflare.yml up -d frontend`.

---

## 5. Cloudflare Access: solo il personale dello studio

Con Access, chi non è autorizzato non vede nemmeno la pagina di login:
nessun tentativo di password, nessuna vulnerabilità sfruttabile da estranei.
Il piano gratuito copre fino a 50 utenti.

1. Cloudflare One → **Access → Applications → Add an application →
   Self-hosted**.
2. *Destination*: il dominio e il percorso pubblici
   (`gestione.shopbeautylab.it`, oppure `shopbeautylab.it` con percorso `bolli`).
   Per la scelta C proteggere l'indirizzo pubblico, non `sissibol-origine`.
3. *Session duration*: `24 hours`.
4. *Policy*: **Allow**, *Include → Emails*: gli indirizzi del personale
   (oppure *Emails ending in* `@dominio-dello-studio.it`).
5. *Login methods*: **One-time PIN** (codice via email) o un provider come
   Google/Microsoft con verifica in due passaggi.

All'accesso si riceve un codice per email, poi si entra in Sissibol con la
propria password: due verifiche indipendenti. Quando la sessione di Access
scade, l'applicazione può mostrare errori di rete: basta ricaricare la pagina.

---

## 6. Impostazioni consigliate del dominio

- **SSL/TLS → Edge Certificates**: *Always Use HTTPS* attivo, *Minimum TLS
  Version* 1.2.
- **Security → WAF → Rate limiting rules** (una regola è inclusa nel piano
  gratuito): *URI Path* `equals` `/bolli/api/auth/login`, 5 richieste in 10
  secondi per IP → *Block* per 10 secondi.
- **Security → WAF → Managed rules**: attive (Cloudflare Free Managed Ruleset).
- **Non** attivare *Bot Fight Mode* sul dominio: può bloccare le chiamate
  dell'applicazione verso l'API. Access e i limiti coprono già il caso.
- **Rules → Configuration Rules** per `URI Path starts with /bolli`:
  disattivare *Rocket Loader* ed *Email Obfuscation*: inseriscono script
  nell'HTML, che la politica di sicurezza dei contenuti (CSP)
  dell'applicazione blocca.
- Nessuna *Cache Rule* su `/bolli`: le risposte dell'API sono già marcate
  `no-store` e non devono mai finire in cache.

---

## 7. Cosa protegge i dati

| Rischio | Protezione |
|---|---|
| Accesso di estranei | Cloudflare Access (punto 5); login con password personale |
| Password deboli | almeno 12 caratteri con maiuscole, minuscole, numeri e simboli; niente parole ovvie né il nome dell'email; controllo nel backend |
| Password provvisorie | quelle iniziali o assegnate da un amministratore vanno cambiate al primo accesso; prima non si vede nessun dato |
| Tentativi a raffica | dopo 5 password errate l'utente è sospeso 15 minuti; limiti per IP in nginx, nel backend e (facoltativo) in Cloudflare |
| Sessione rubata | token di accesso di 15 minuti; rinnovo con cookie `HttpOnly`, `Secure`, `SameSite=Strict`, valido solo su `/bolli/api/auth`, ruotato a ogni uso; cambio password e reset chiudono le altre sessioni; utente eliminato = accesso revocato subito |
| Script malevoli (XSS) | CSP senza script inline né esterni, nessun `eval`; `X-Frame-Options: DENY` |
| Intercettazione | HTTPS fino a Cloudflare, tunnel cifrato fino al server |
| Accesso diretto al server | nessuna porta pubblicata; backend e database su rete senza Internet; con il Worker, segreto d'origine obbligatorio |
| Token falsificati | `JWT_SECRET` di almeno 32 caratteri, altrimenti il backend non parte |
| Dati nei registri | i registri di nginx non contengono le query string (ricerche per targa, nome) |
| Perdita dei dati | backup giornalieri verificati (BACKUP.md): **copiarli anche fuori dal server** |

Restano a carico dello studio: tenere aggiornato il computer (sistema
operativo, Docker), non condividere le password, aggiornare Sissibol e
`cloudflared` (versione fissata in `docker-compose.cloudflare.yml`),
conservare `.env` e i backup in modo sicuro.

---

## 8. Controllo finale

- [ ] `https://<indirizzo>/bolli/` mostra il login (con Access: prima il codice email)
- [ ] un altro percorso (es. `/bolli-prova` o la home del negozio) non mostra Sissibol
- [ ] la password provvisoria dell'amministratore è stata sostituita
- [ ] Access attivo, provato da un indirizzo email **non** autorizzato
- [ ] scelta C: `https://sissibol-origine.shopbeautylab.it/bolli/` risponde **403**
- [ ] `make backup-stato COMPOSE=docker-compose.cloudflare.yml` riporta `"esito":"OK"`
- [ ] la cartella `backups/` viene copiata fuori dal server

---

## Aggiornamenti

```bash
git pull
docker compose -f docker-compose.cloudflare.yml up -d --build
```

Database, ricevute e backup restano dove sono.

### Dalla configurazione HTTPS con DuckDNS

I due compose usano lo stesso database e le stesse cartelle: basta fermare
l'uno e avviare l'altro.

```bash
docker compose -f docker-compose.https.yml down
docker compose -f docker-compose.cloudflare.yml up -d --build
```

La porta 443 del router non serve più e va chiusa.

---

## Problemi frequenti

| Sintomo | Causa probabile |
|---|---|
| Errore Cloudflare 1033 | tunnel non connesso: `docker compose -f docker-compose.cloudflare.yml logs cloudflared` (token errato?) |
| Errore 502 / 504 | il frontend non è avviato o non è *healthy* |
| 403 su tutte le pagine | scelta C: `ORIGINE_SEGRETO` diversa dal secret del Worker; scelte A/B: `ORIGINE_SEGRETO` va lasciata vuota |
| Il frontend non parte | `ORIGINE_SEGRETO` non valida (32-128 caratteri fra lettere, numeri, `-`, `_`) |
| Il backend non parte | `JWT_SECRET` assente o più corta di 32 caratteri |
| Login impossibile (errore del server) | `APP_DOMINIO` diverso dall'indirizzo usato nel browser |
| La pagina resta bianca | Rocket Loader o Email Obfuscation attivi su `/bolli` (punto 6) |

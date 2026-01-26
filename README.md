# Sissibol - PWA Gestione Scadenziario Bolli

Progressive Web App per la gestione dello scadenziario bolli per autotrasporto.

## Caratteristiche

### Gestione Clienti
- **Persona Fisica (PF)**: Nome, Cognome, Codice Fiscale
- **Persona Giuridica (PG)**: Ragione Sociale, Partita IVA
- Campi comuni: Indirizzo, Email, Telefono, Note
- Ricerca su tutti i campi (nome, cognome, ragione sociale, P.IVA, C.F., email)

### Gestione Veicoli
- Catalogazione veicoli per cliente
- Dati tecnici completi per calcolo bollo:
  - Tipo veicolo e classe ambientale (Euro 0-6)
  - Alimentazione (Benzina, Diesel, GPL, Metano, Elettrico, Ibrido)
  - Potenza (KW), Cilindrata (cc)
  - Portata (KG), Peso complessivo (KG)
  - Numero assi, Tipo sospensione
  - Numero posti, Massa rimorchiabile
  - Data immatricolazione (per ultratrentennali)

### Scadenziario Bolli
- Tracking scadenze con stati: DA_PAGARE, PAGATO, SCADUTO
- Periodicità: ANNUALE o QUADRIMESTRALE
- Aggiornamento automatico scadenze scadute
- Notifiche scadenze imminenti (30 giorni)
- Calcolo automatico importo previsto

### Sistema Calcolo Bollo
- **Tariffario configurabile** per regione e anno
- Supporto tariffe Lombardia 2026 precaricate
- Calcolo basato su:
  - Tipo veicolo (Autovettura, Motociclo, Autocarro, Rimorchio, etc.)
  - Categoria Euro (0, 1, 2, 3, 4-5-6)
  - Potenza KW, Cilindrata, Portata, Peso, Assi
  - Tipo sospensione (pneumatiche/non pneumatiche)
- Gestione esenzioni e riduzioni:
  - Veicoli elettrici (esenzione 5 anni)
  - Veicoli GPL/Metano (riduzione 25%)
  - Veicoli ultratrentennali (interesse storico)
  - Sconto RID (domiciliazione bancaria)

### Pagamenti
- Registrazione pagamenti con data e importo
- Upload ricevute (file allegati)
- Metodi di pagamento configurabili
- Aggiornamento automatico stato scadenza

### Report
- Export PDF con jsPDF
- Export Excel con xlsx
- Filtri per periodo, cliente, stato

### PWA - Progressive Web App
- Installabile su Desktop e Mobile
- Funzionamento offline (Service Worker)
- **Aggiornamento automatico**: prompt quando disponibile nuova versione
- Cache intelligente (NetworkFirst per API)
- Controllo aggiornamenti ogni 60 secondi

### Autenticazione e Sicurezza
- JWT con ruoli (ADMIN, OPERATORE)
- Password criptate con bcrypt
- Guards per protezione routes
- Validazione input con class-validator

## Stack Tecnologico

### Backend
- **NestJS 10** - Framework Node.js
- **Prisma ORM 5** - Database ORM con migrations
- **PostgreSQL 14+** - Database relazionale
- **JWT** - Autenticazione stateless
- **class-validator** - Validazione DTO
- **Multer** - Upload file

### Frontend
- **React 19** - UI Library
- **TypeScript 5.9** - Type safety
- **Vite 7** - Build tool veloce
- **Tailwind CSS 3** - Utility-first styling
- **React Router 6** - Routing SPA
- **Axios** - HTTP client
- **date-fns** - Manipolazione date
- **lucide-react** - Icone moderne
- **vite-plugin-pwa** - PWA support con Workbox
- **jsPDF / xlsx** - Export documenti

## Setup e Installazione

### Metodo 1: Docker (Consigliato)

**Prerequisiti:**
- Docker >= 20.x
- Docker Compose >= 2.x

**Avvio rapido:**

```bash
# Clona il repository
git clone <repository-url>
cd Sissibol

# Avvia tutti i servizi con Docker Compose
docker-compose up -d

# Attendi che tutti i servizi siano pronti (30-60 secondi)
# L'applicazione sarà disponibile su:
# - Frontend: http://localhost
# - Backend API: http://localhost:3000
# - Database: localhost:5432
```

**Comandi utili:**

```bash
# Avvia i servizi
docker-compose up -d

# Ferma i servizi
docker-compose down

# Visualizza log
docker-compose logs -f

# Ricostruisci le immagini (dopo modifiche al codice)
docker-compose build --no-cache
docker-compose up -d

# Accedi alla shell del backend
docker-compose exec backend sh

# Accedi al database
docker-compose exec postgres psql -U sissibol -d sissibol
```

### Metodo 2: Installazione Locale

**Prerequisiti:**
- Node.js >= 18.x
- PostgreSQL >= 14.x
- npm

#### 1. Setup Backend

```bash
cd backend

# Installa dipendenze
npm install

# Configura variabili d'ambiente
cp .env.example .env
# Modifica .env con le tue credenziali PostgreSQL

# Genera Prisma Client
npx prisma generate

# Crea il database e esegui le migration
npx prisma migrate dev

# (Opzionale) Carica tariffe Lombardia 2026
npx ts-node prisma/seed-tariffe-lombardia-2026.ts

# Avvia il server in modalità sviluppo
npm run start:dev
```

Il backend sarà disponibile su `http://localhost:3000`

#### 2. Setup Frontend

```bash
cd frontend

# Installa dipendenze
npm install

# Crea file .env.local
echo "VITE_API_URL=http://localhost:3000" > .env.local

# Avvia il dev server
npm run dev
```

Il frontend sarà disponibile su `http://localhost:5173`

## Variabili d'Ambiente

### Backend (.env)

```env
DATABASE_URL="postgresql://user:password@localhost:5432/sissibol?schema=public"
JWT_SECRET="your-secret-key-change-in-production"
JWT_EXPIRATION="24h"
PORT=3000
NODE_ENV="development"
```

### Frontend (.env.local)

```env
VITE_API_URL=http://localhost:3000
```

## Schema Database

### Entità Principali

```
utenti
├── id (PK)
├── email (unique)
├── password (bcrypt)
├── ruolo (ADMIN | OPERATORE)
└── timestamps

clienti
├── id (PK)
├── tipoCliente (PERSONA_FISICA | PERSONA_GIURIDICA)
├── ragioneSociale (per PG)
├── partitaIva (per PG)
├── nome, cognome (per PF)
├── codiceFiscale (per PF)
├── indirizzo, email, telefono, note
└── timestamps

veicoli
├── id (PK)
├── idCliente (FK -> clienti)
├── targa
├── tipoVeicolo, classeAmbientale, regione
├── alimentazione, potenzaKw, cilindrata
├── portataKg, pesoComplessivoKg
├── numeroAssi, tipoSospensione
├── numeroPosti, massaRimorchiabileKg
├── dataImmatricolazione, note
└── timestamps

scadenze
├── id (PK)
├── idVeicolo (FK -> veicoli)
├── meseScadenza (1-12), annoScadenza
├── periodicita (ANNUALE | QUADRIMESTRALE)
├── importoPrevisto
├── stato (DA_PAGARE | PAGATO | SCADUTO)
└── timestamps

pagamenti
├── id (PK)
├── idScadenza (FK -> scadenze)
├── dataPagamento, importoPagato
├── metodoPagamento, ricevutaFile
└── timestamps
```

### Configurazione Tariffe

```
configurazioni_bollo
├── id (PK)
├── annoValidita, regione
├── scontoRid (% sconto domiciliazione)
├── attivo, note
└── timestamps

tariffe_bollo
├── id (PK)
├── idConfigurazione (FK)
├── tipoVeicolo, categoriaEuro
├── unitaMisura (KW | CC | KG | POSTI | ASSI | FISSO)
├── sogliaMin, sogliaMax
├── importoUnitario, importoFisso
├── tipoSospensione, periodicita
├── descrizione, ordine
└── timestamps

esenzioni_bollo
├── id (PK)
├── idConfigurazione (FK)
├── tipoEsenzione (TOTALE | PARZIALE)
├── percentualeRiduzione
├── tipoVeicolo, alimentazione
├── anniDaImmatricolazione
├── descrizione, note
└── timestamps
```

## API Endpoints

### Autenticazione
| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| POST | `/auth/login` | Login utente |
| POST | `/auth/register` | Registrazione nuovo utente |
| GET | `/auth/profile` | Profilo utente corrente |

### Clienti
| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/clienti` | Lista clienti (con ricerca) |
| GET | `/clienti/:id` | Dettaglio cliente con veicoli |
| POST | `/clienti` | Crea nuovo cliente (PF o PG) |
| PATCH | `/clienti/:id` | Aggiorna cliente |
| DELETE | `/clienti/:id` | Elimina cliente |

### Veicoli
| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/veicoli` | Lista veicoli (filtro per cliente) |
| GET | `/veicoli/:id` | Dettaglio veicolo con scadenze |
| POST | `/veicoli` | Crea nuovo veicolo |
| PATCH | `/veicoli/:id` | Aggiorna veicolo |
| DELETE | `/veicoli/:id` | Elimina veicolo |

### Scadenze
| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/scadenze` | Lista scadenze (filtro stato/cliente) |
| GET | `/scadenze/in-scadenza` | Scadenze imminenti (30 giorni) |
| GET | `/scadenze/:id` | Dettaglio scadenza |
| POST | `/scadenze` | Crea nuova scadenza |
| PATCH | `/scadenze/:id` | Aggiorna scadenza |
| POST | `/scadenze/:id/ricalcola` | Ricalcola importo |
| DELETE | `/scadenze/:id` | Elimina scadenza |

### Pagamenti
| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/pagamenti` | Lista pagamenti |
| GET | `/pagamenti/:id` | Dettaglio pagamento |
| POST | `/pagamenti` | Crea pagamento (con upload) |
| PATCH | `/pagamenti/:id` | Aggiorna pagamento |
| DELETE | `/pagamenti/:id` | Elimina pagamento |

### Calcolo Bollo
| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/bollo/calcola/:idVeicolo` | Calcola bollo per veicolo |
| GET | `/bollo/cliente/:idCliente` | Calcola bolli per tutti i veicoli cliente |
| POST | `/bollo/aggiorna-scadenze/:idVeicolo` | Aggiorna importi scadenze future |
| GET | `/bollo/configurazioni` | Lista configurazioni tariffe |
| GET | `/bollo/configurazioni/:id` | Dettaglio configurazione |
| POST | `/bollo/configurazioni` | Crea configurazione |
| POST | `/bollo/configurazioni/:id/duplica` | Duplica per nuovo anno |
| GET | `/bollo/configurazioni/:id/tariffe` | Lista tariffe configurazione |
| POST | `/bollo/configurazioni/:id/tariffe` | Crea nuova tariffa |
| POST | `/bollo/tariffe/:id` | Aggiorna tariffa |

## Tipi Veicolo Supportati

Il sistema supporta i seguenti tipi di veicolo con tariffe specifiche:

| Tipo Veicolo | Unità di Misura | Note |
|--------------|-----------------|------|
| Autovettura | KW | Tariffa per potenza |
| Autoveicolo uso promiscuo | KW | Come autovettura |
| Motociclo | KW | Oltre 50cc |
| Ciclomotore | - | Importo fisso (< 50cc) |
| Motocarri/Motofurgoni | CC | Per cilindrata |
| Autocarro < 12 ton | KG | Per portata |
| Autocarro >= 12 ton | ASSI | Per numero assi e sospensione |
| Trattore stradale | ASSI | Con supplemento per rimorchio |
| Rimorchio | KG/POSTI | Per portata o posti |
| Autobus | KW | Per potenza |

## Architettura Docker

```
┌─────────────────────────────────────────────────────┐
│                   Docker Network                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │  Frontend   │  │   Backend   │  │  PostgreSQL │ │
│  │   (Nginx)   │◄─┤   (NestJS)  │◄─┤  (Database) │ │
│  │   Port 80   │  │  Port 3000  │  │  Port 5432  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
│       │                  │                  │        │
│   Static Files      API Requests      Persistent    │
│   + PWA Assets                          Volume       │
└─────────────────────────────────────────────────────┘
```

### Volumi Docker

- `postgres_data`: Persistenza dati PostgreSQL
- `./backend/uploads`: Upload file ricevute

## PWA - Funzionalità Offline

L'applicazione è una Progressive Web App completa:

### Installazione
- **Desktop**: Chrome, Edge, Firefox (menu "Installa app")
- **Mobile**: iOS Safari ("Aggiungi a Home"), Android Chrome

### Caching
- **Risorse statiche**: Pre-cached al primo caricamento
- **API calls**: NetworkFirst con fallback cache (24h)
- **Immagini/Font**: Cache with revalidation

### Aggiornamento Automatico
- Controllo nuove versioni ogni 60 secondi
- Prompt utente quando disponibile aggiornamento
- Possibilità di aggiornare subito o rimandare
- Timestamp build visibile nel prompt

## Build per Produzione

### Con Docker

```bash
# Build e avvio
docker-compose up -d --build

# Per deployment su server:
# 1. Modifica docker-compose.yml con configurazioni produzione
# 2. Cambia JWT_SECRET con valore sicuro
# 3. Configura HTTPS con reverse proxy (nginx/traefik)
docker-compose -f docker-compose.yml up -d
```

### Build Locale

```bash
# Backend
cd backend
npm run build
npm run start:prod

# Frontend
cd frontend
npm run build
npm run preview  # Preview della build
```

## Sicurezza

- Password criptate con bcrypt (salt rounds: 10)
- Autenticazione JWT con scadenza configurabile
- Guards NestJS per protezione routes
- Validazione input con class-validator e decoratori
- CORS configurato per origini specifiche
- Sanitizzazione input per prevenzione XSS/SQL injection
- Upload file con validazione tipo e dimensione

## Primo Accesso

Dopo l'installazione, crea il primo utente amministratore:

```bash
# Via API
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@sissibol.com",
    "password": "admin123",
    "ruolo": "ADMIN"
  }'
```

Oppure usa il seed automatico (Docker):
```bash
docker-compose exec backend npm run prisma:seed
```

## Funzionalità Future

- [ ] Sistema notifiche email automatiche
- [ ] Integrazione calendario Google/Outlook
- [ ] Dashboard con grafici e statistiche avanzate
- [ ] Gestione allegati multipli per pagamento
- [ ] Backup automatici schedulati
- [ ] App mobile nativa (React Native)
- [ ] Integrazione PagoPA per pagamenti online
- [ ] OCR per lettura automatica documenti

## Troubleshooting

### Errore "Cannot find module dist/main.js"
```bash
# Ricostruisci le immagini Docker
docker-compose build --no-cache backend
docker-compose up -d
```

### Errore connessione database
```bash
# Verifica che PostgreSQL sia avviato
docker-compose ps
docker-compose logs postgres
```

### PWA non si aggiorna
1. Chiudi tutte le tab dell'applicazione
2. Riapri l'applicazione
3. Attendi il prompt di aggiornamento
4. Oppure: DevTools > Application > Service Workers > Update

## Licenza

MIT

## Supporto

Per problemi o domande, apri una issue su GitHub.

---

**Sviluppato per la gestione efficiente dello scadenziario bolli nel settore autotrasporto**

# Sissibol - PWA Gestione Scadenziario Bolli

Progressive Web App per la gestione dello scadenziario bolli per autotrasporto.

## 📋 Caratteristiche

- ✅ **Gestione Clienti**: Anagrafica completa dei clienti
- ✅ **Gestione Veicoli**: Catalogazione veicoli per cliente
- ✅ **Scadenziario Bolli**: Tracking delle scadenze con stati (DA_PAGARE, PAGATO, SCADUTO)
- ✅ **Pagamenti**: Registrazione pagamenti con upload ricevute
- ✅ **Dashboard**: Vista riepilogativa delle scadenze imminenti
- ✅ **Report**: Export PDF/Excel (in sviluppo)
- ✅ **Notifiche**: Sistema di notifiche in-app (in sviluppo)
- ✅ **PWA**: Installabile e funzionante offline
- ✅ **Autenticazione**: JWT con ruoli (ADMIN, OPERATORE)

## 🛠️ Stack Tecnologico

### Backend
- **NestJS** - Framework Node.js
- **Prisma ORM** - Database ORM
- **PostgreSQL** - Database relazionale
- **JWT** - Autenticazione
- **Bcrypt** - Cifratura password

### Frontend
- **React 19** - UI Library
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **React Router** - Routing
- **Axios** - HTTP client
- **date-fns** - Date manipulation
- **lucide-react** - Icons
- **vite-plugin-pwa** - PWA support

## 🚀 Setup e Installazione

### 🐳 Metodo 1: Docker (Consigliato)

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

# Crea il primo utente amministratore
make seed-admin
# Oppure manualmente:
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sissibol.com","password":"admin123","ruolo":"ADMIN"}'
```

**Comandi utili (con Makefile):**

```bash
make help           # Mostra tutti i comandi disponibili
make up             # Avvia tutti i servizi
make down           # Ferma tutti i servizi
make logs           # Mostra i log di tutti i servizi
make restart        # Riavvia tutti i servizi
make clean          # Rimuove tutti i container e volumi
make rebuild        # Ricostruisce tutto da zero
make prisma-studio  # Apri Prisma Studio
make db-shell       # Apri shell PostgreSQL
```

**Configurazione personalizzata:**

Per modificare le configurazioni, edita il file `docker-compose.yml`:
- Cambia le porte esposte
- Modifica le credenziali del database
- Aggiorna il JWT_SECRET per produzione

---

### 💻 Metodo 2: Installazione Locale

**Prerequisiti:**
- Node.js >= 18.x
- PostgreSQL >= 14.x
- npm o yarn

### 1. Clona il repository

```bash
git clone <repository-url>
cd Sissibol
```

### 2. Setup Backend

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
npx prisma migrate dev --name init

# (Opzionale) Apri Prisma Studio per visualizzare il database
npx prisma studio

# Avvia il server in modalità sviluppo
npm run start:dev
```

Il backend sarà disponibile su `http://localhost:3000`

### 3. Setup Frontend

```bash
cd ../frontend

# Installa dipendenze
npm install

# Crea file .env.local
echo "VITE_API_URL=http://localhost:3000" > .env.local

# Avvia il dev server
npm run dev
```

Il frontend sarà disponibile su `http://localhost:5173`

## 📝 Variabili d'Ambiente

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

## 🗄️ Database Schema

```sql
- utenti (id, email, password, ruolo)
- clienti (id, ragione_sociale, partita_iva, indirizzo, email, telefono, note)
- veicoli (id, id_cliente, targa, tipo_veicolo, classe_ambientale, regione, note)
- scadenze (id, id_veicolo, data_scadenza, importo_previsto, stato)
- pagamenti (id, id_scadenza, data_pagamento, importo_pagato, metodo_pagamento, ricevuta_file)
```

## 🔑 Primo Accesso

Per creare il primo utente amministratore:

```bash
# Nel backend, usa Prisma Studio o esegui una query SQL
npx prisma studio

# Oppure usa l'endpoint /auth/register via API:
POST http://localhost:3000/auth/register
{
  "email": "admin@example.com",
  "password": "password123",
  "ruolo": "ADMIN"
}
```

## 📱 PWA - Progressive Web App

L'applicazione è configurata come PWA e può essere installata su:
- Desktop (Chrome, Edge, Firefox)
- Mobile (iOS Safari, Android Chrome)

Funzionalità offline:
- Cache delle risorse statiche
- Cache delle chiamate API (NetworkFirst strategy)
- Service Worker auto-aggiornante

## 🔒 Sicurezza

- Password criptate con bcrypt (salt rounds: 10)
- Autenticazione JWT
- Guards per protezione routes
- CORS configurato
- Validazione input con class-validator
- XSS protection

## 📚 API Endpoints

### Autenticazione
- `POST /auth/login` - Login
- `POST /auth/register` - Registrazione
- `GET /auth/profile` - Profilo utente

### Clienti
- `GET /clienti` - Lista clienti (con ricerca)
- `GET /clienti/:id` - Dettaglio cliente
- `POST /clienti` - Crea cliente
- `PATCH /clienti/:id` - Aggiorna cliente
- `DELETE /clienti/:id` - Elimina cliente

### Veicoli
- `GET /veicoli` - Lista veicoli (filtro per cliente)
- `GET /veicoli/:id` - Dettaglio veicolo
- `POST /veicoli` - Crea veicolo
- `PATCH /veicoli/:id` - Aggiorna veicolo
- `DELETE /veicoli/:id` - Elimina veicolo

### Scadenze
- `GET /scadenze` - Lista scadenze (filtro per stato/cliente)
- `GET /scadenze/in-scadenza` - Scadenze imminenti
- `GET /scadenze/:id` - Dettaglio scadenza
- `POST /scadenze` - Crea scadenza
- `PATCH /scadenze/:id` - Aggiorna scadenza
- `DELETE /scadenze/:id` - Elimina scadenza

### Pagamenti
- `GET /pagamenti` - Lista pagamenti
- `GET /pagamenti/:id` - Dettaglio pagamento
- `POST /pagamenti` - Crea pagamento (con upload ricevuta)
- `PATCH /pagamenti/:id` - Aggiorna pagamento
- `DELETE /pagamenti/:id` - Elimina pagamento

## 🧪 Testing

### Con Docker
```bash
# Backend tests
docker-compose exec backend npm test

# Frontend tests
docker-compose exec frontend npm test
```

### Senza Docker
```bash
# Backend
cd backend
npm test

# Frontend
cd frontend
npm test
```

## 🏗️ Build per Produzione

### 🐳 Con Docker (Consigliato)

```bash
# Build e avvio con docker-compose
docker-compose up -d --build

# Oppure usa il Makefile
make rebuild

# Per deployment su server:
# 1. Modifica docker-compose.yml con le configurazioni di produzione
# 2. Cambia JWT_SECRET con un valore sicuro
# 3. Configura HTTPS con un reverse proxy (nginx/traefik)
# 4. Esegui:
docker-compose -f docker-compose.yml up -d
```

### 💻 Build Locale

#### Backend

```bash
cd backend
npm run build
npm run start:prod
```

#### Frontend

```bash
cd frontend
npm run build
npm run preview  # Preview della build
```

## 🐳 Architettura Docker

```
┌─────────────────────────────────────────────────────┐
│                   Docker Network                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │  Frontend   │  │   Backend   │  │  PostgreSQL │ │
│  │   (Nginx)   │◄─┤   (NestJS)  │◄─┤  (Database) │ │
│  │   Port 80   │  │  Port 3000  │  │  Port 5432  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
│       │                  │                  │        │
│       │                  │                  │        │
│   Static Files      API Requests      Persistent    │
│                                         Volume       │
└─────────────────────────────────────────────────────┘
```

### Volumi Docker

- `postgres_data`: Persistenza dati PostgreSQL
- `./backend/uploads`: Upload file ricevute (montato come volume)

### Variabili d'Ambiente Docker

Configurate in `docker-compose.yml`:
- `DATABASE_URL`: Connection string PostgreSQL
- `JWT_SECRET`: Chiave segreta JWT
- `VITE_API_URL`: URL API per il frontend

## 🔄 Funzionalità Future

- [ ] Completamento pagine Veicoli, Scadenze, Pagamenti, Report
- [ ] Sistema di notifiche email
- [ ] Export PDF/Excel avanzati
- [ ] Gestione allegati multipli
- [ ] Dashboard con grafici e statistiche
- [ ] Filtri avanzati e ricerca globale
- [ ] Backup automatici
- [ ] Integrazione calendario Google/Outlook
- [ ] App mobile nativa (React Native)

## 📄 Licenza

MIT

## 👥 Supporto

Per problemi o domande, apri una issue su GitHub.

---

**Sviluppato con ❤️ per la gestione efficiente dello scadenziario bolli**

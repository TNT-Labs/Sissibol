# 🐳 Guida Docker - Sissibol

Questa guida descrive come usare Docker per eseguire Sissibol in sviluppo e produzione.

## 📋 Indice

- [Prerequisiti](#prerequisiti)
- [Quick Start](#quick-start)
- [Modalità Produzione](#modalità-produzione)
- [Modalità Sviluppo](#modalità-sviluppo)
- [Comandi Utili](#comandi-utili)
- [Troubleshooting](#troubleshooting)
- [Configurazione Avanzata](#configurazione-avanzata)

## Prerequisiti

- Docker >= 20.x
- Docker Compose >= 2.x
- Make (opzionale, per comandi semplificati)

### Installazione Docker

**Ubuntu/Debian:**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

**macOS:**
```bash
brew install --cask docker
```

**Windows:**
Scarica [Docker Desktop](https://www.docker.com/products/docker-desktop)

## Quick Start

```bash
# 1. Configurazione: JWT_SECRET è obbligatoria
cp .env.example .env
# impostare in .env:  JWT_SECRET=<output di: openssl rand -base64 48>
# facoltativo:        ADMIN_PASSWORD_INIZIALE=<password provvisoria di almeno 12 caratteri>

# 2. Avvio (con Make, oppure: docker compose up -d --build)
make up

# 3. Password del primo amministratore (admin@sissibol.it), se non indicata in .env
make admin-password

# Accedi a http://localhost e cambia la password al primo accesso
```

Al primo avvio il backend applica le migrazioni e crea l'amministratore. In
produzione la password non è più `admin123`: si usa `ADMIN_PASSWORD_INIZIALE`
oppure se ne genera una casuale, mostrata una sola volta nei log. È
provvisoria: al primo accesso l'applicazione chiede di sceglierne una
personale (almeno 12 caratteri con maiuscole, minuscole, numeri e simboli).

Per raggiungere l'applicazione da Internet: [CLOUDFLARE.md](CLOUDFLARE.md)
(tunnel Cloudflare, `docker-compose.cloudflare.yml`, consigliato) oppure
[HTTPS.md](HTTPS.md) (DuckDNS, `docker-compose.https.yml`).

## Modalità Produzione

Usa `docker-compose.yml` per la modalità produzione.

### Caratteristiche
- Build ottimizzate multi-stage
- Frontend servito tramite Nginx
- Backend compilato
- Volumi per persistenza dati
- Health checks

### Avvio

```bash
# Build e avvio
docker compose up -d --build

# Verifica stato
docker compose ps

# Log
docker compose logs -f
```

### Servizi Esposti

- **Frontend**: http://<server> (porta 80, anche dalla rete)
- **Backend API**: http://localhost:3000 (solo da questo computer; dalla rete: http://<server>/api)
- **PostgreSQL**: localhost:5432 (solo da questo computer)
- **Salute**: http://localhost:3000/health (200 se l'applicazione raggiunge il database)

### Configurazione Produzione

Tutta la configurazione sta nel file `.env` (vedi `.env.example`); il compose
non va modificato. Le immagini si costruiscono dalla radice del repository con
`npm ci` sul `package-lock.json`: due build dello stesso commit installano le
stesse versioni delle dipendenze.

Database e API sono esposti solo su `127.0.0.1` (il computer che ospita
l'applicazione); dalla rete si passa dall'interfaccia su porta 80, che
inoltra `/api` al backend.

## Modalità Sviluppo

Usa `docker-compose.dev.yml` per lo sviluppo con hot reload.

### Caratteristiche
- Hot reload per backend e frontend
- Volumi montati per modifiche in tempo reale
- Nessuna build necessaria per modifiche al codice
- Logs dettagliati

### Avvio

```bash
# Con Make
make dev-up

# Senza Make
docker compose -f docker-compose.dev.yml up -d
```

### Servizi Esposti

- **Frontend (Vite)**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **PostgreSQL**: localhost:5432

### Workflow Sviluppo

1. Avvia i servizi dev: `make dev-up`
2. Modifica il codice nel tuo editor
3. Le modifiche vengono ricaricate automaticamente
4. Visualizza i log: `make dev-logs`

## Comandi Utili

### Gestione Base

```bash
make help          # Mostra tutti i comandi
make up            # Avvia produzione
make down          # Ferma servizi
make restart       # Riavvia servizi
make logs          # Visualizza log
make status        # Stato servizi
```

### Sviluppo

```bash
make dev-up        # Avvia sviluppo
make dev-down      # Ferma sviluppo
make dev-logs      # Log sviluppo
make dev-rebuild   # Rebuild sviluppo
```

### Database

```bash
make db-shell      # Shell PostgreSQL
make prisma-studio # Apri Prisma Studio
make prisma-migrate # Esegui migrations
```

### Shell Containers

```bash
make backend-shell  # Shell backend
make frontend-shell # Shell frontend

# Oppure
docker compose exec backend sh
docker compose exec frontend sh
```

### Pulizia

```bash
make clean         # Rimuovi tutto (containers, volumes, images)
make rebuild       # Pulisci e ricostruisci
```

## Troubleshooting

### Problema: Porta già in uso

```bash
# Verifica cosa usa la porta
sudo lsof -i :80
sudo lsof -i :3000
sudo lsof -i :5432

# Modifica le porte in docker-compose.yml
services:
  frontend:
    ports:
      - "8080:80"  # Cambia porta frontend
```

### Problema: Database non si connette

```bash
# Verifica che PostgreSQL sia healthy
docker compose ps

# Controlla i log del database
docker compose logs postgres

# Riavvia solo il database
docker compose restart postgres
```

### Problema: Prisma non trova il database

```bash
# Esegui manualmente le migrations
docker compose exec backend npx prisma migrate deploy

# Rigenera Prisma Client
docker compose exec backend npx prisma generate
```

### Problema: Modifiche non si riflettono (modalità dev)

```bash
# Verifica che i volumi siano montati
docker compose -f docker-compose.dev.yml config

# Ricostruisci
make dev-rebuild
```

### Problema: Spazio disco pieno

```bash
# Pulisci containers non usati
docker system prune

# Pulisci volumi non usati
docker volume prune

# Pulisci immagini non usate
docker image prune -a
```

### Reset Completo

```bash
# Ferma tutto e rimuovi volumi
docker compose down -v

# Rimuovi immagini Sissibol
docker images | grep sissibol | awk '{print $3}' | xargs docker rmi

# Riavvia
make build
make up
```

## Configurazione Avanzata

### Reverse Proxy (Nginx/Traefik)

Per deployment in produzione con HTTPS:

```yaml
# nginx.conf
server {
    listen 443 ssl http2;
    server_name sissibol.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Backup

Il servizio `backup` del compose salva ogni giorno database e ricevute nella
cartella `backups/`, verifica ogni backup e conserva giornalieri e mensili.
Stato, ripristino e copia fuori sede sono descritti in [BACKUP.md](BACKUP.md).

```bash
make backup-stato   # stato dell'ultimo backup
make backup         # backup immediato
make ripristina FILE=sissibol-20261001-023000.dump
```

### Monitoraggio

```bash
# Risorse utilizzate
docker stats

# Log in tempo reale
docker compose logs -f --tail=100

# Solo errori
docker compose logs | grep -i error
```

### Scalabilità

Per scalare il backend:

```bash
docker compose up -d --scale backend=3
```

Richiede un load balancer (nginx/traefik) davanti.

## Variabili d'Ambiente

### Backend

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `DATABASE_URL` | - | Connection string PostgreSQL |
| `JWT_SECRET` | - | Chiave segreta JWT |
| `JWT_EXPIRATION` | — | Non più usata: l'accesso dura 15 minuti e si rinnova da solo per 7 giorni |
| `PORT` | `3000` | Porta backend |
| `NODE_ENV` | `production` | Ambiente |

### Frontend

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:3000` | URL API backend |

## Architettura

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Network                        │
│                                                          │
│  ┌──────────────┐      ┌──────────────┐      ┌────────┐│
│  │  Frontend    │      │   Backend    │      │  DB    ││
│  │  (Nginx)     │◄────►│   (NestJS)   │◄────►│ Postgres││
│  │  Port: 80    │      │  Port: 3000  │      │ 5432   ││
│  └──────────────┘      └──────────────┘      └────────┘│
│       │                        │                   │    │
│   Static Files            REST API          Persistent │
│   (React PWA)            (JWT Auth)           Volume   │
└─────────────────────────────────────────────────────────┘
```

## Supporto

Per problemi o domande:
- Apri una issue su GitHub
- Consulta i log: `make logs`
- Verifica lo stato: `make status`

---

**Happy Dockering! 🐳**

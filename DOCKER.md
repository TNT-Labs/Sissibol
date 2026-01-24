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

### Con Make (Consigliato)

```bash
# Avvia tutto in modalità produzione
make up

# Crea utente admin
make seed-admin

# Accedi a http://localhost
# Email: admin@sissibol.com
# Password: admin123
```

### Senza Make

```bash
# Avvia tutto
docker-compose up -d

# Crea utente admin
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sissibol.com","password":"admin123","ruolo":"ADMIN"}'
```

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
docker-compose up -d --build

# Verifica stato
docker-compose ps

# Log
docker-compose logs -f
```

### Servizi Esposti

- **Frontend**: http://localhost (porta 80)
- **Backend API**: http://localhost:3000
- **PostgreSQL**: localhost:5432

### Configurazione Produzione

Modifica `docker-compose.yml`:

```yaml
services:
  backend:
    environment:
      JWT_SECRET: "cambia-questo-secret-in-produzione"  # ⚠️ IMPORTANTE
      DATABASE_URL: "postgresql://..."
      NODE_ENV: "production"
```

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
docker-compose -f docker-compose.dev.yml up -d
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
docker-compose exec backend sh
docker-compose exec frontend sh
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
docker-compose ps

# Controlla i log del database
docker-compose logs postgres

# Riavvia solo il database
docker-compose restart postgres
```

### Problema: Prisma non trova il database

```bash
# Esegui manualmente le migrations
docker-compose exec backend npx prisma migrate deploy

# Rigenera Prisma Client
docker-compose exec backend npx prisma generate
```

### Problema: Modifiche non si riflettono (modalità dev)

```bash
# Verifica che i volumi siano montati
docker-compose -f docker-compose.dev.yml config

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
docker-compose down -v

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

### Backup Database

```bash
# Backup manuale
docker-compose exec postgres pg_dump -U sissibol_user sissibol > backup.sql

# Restore
cat backup.sql | docker-compose exec -T postgres psql -U sissibol_user sissibol
```

### Backup Automatico

Aggiungi al `docker-compose.yml`:

```yaml
services:
  backup:
    image: prodrigestivill/postgres-backup-local
    restart: always
    volumes:
      - ./backups:/backups
    environment:
      POSTGRES_HOST: postgres
      POSTGRES_DB: sissibol
      POSTGRES_USER: sissibol_user
      POSTGRES_PASSWORD: sissibol_password
      SCHEDULE: "0 2 * * *"  # Ogni giorno alle 2:00
```

### Monitoraggio

```bash
# Risorse utilizzate
docker stats

# Log in tempo reale
docker-compose logs -f --tail=100

# Solo errori
docker-compose logs | grep -i error
```

### Scalabilità

Per scalare il backend:

```bash
docker-compose up -d --scale backend=3
```

Richiede un load balancer (nginx/traefik) davanti.

## Variabili d'Ambiente

### Backend

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `DATABASE_URL` | - | Connection string PostgreSQL |
| `JWT_SECRET` | - | Chiave segreta JWT |
| `JWT_EXPIRATION` | `24h` | Durata token |
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

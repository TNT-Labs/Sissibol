# =============================================================================
# Backend - immagine di produzione
# =============================================================================
# Contesto di build: la radice del monorepo (docker compose: context "."), per
# installare le dipendenze dal package-lock.json con npm ci. Senza lockfile
# ogni build poteva prendere versioni diverse: è così che un aggiornamento
# delle dipendenze aveva rotto la build con Node 18.
#
# Node 22 LTS: deve coincidere con la versione usata dalla CI e dal frontend.
# =============================================================================

FROM node:22-alpine AS builder

WORKDIR /app

# OpenSSL per Prisma
RUN apk add --no-cache openssl libc6-compat

# Prima solo i manifest: lo strato delle dipendenze resta in cache finché non
# cambiano. npm ci vuole i package.json di tutti i workspace del lockfile.
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace=backend

COPY backend/ backend/
WORKDIR /app/backend
RUN npx prisma generate && npm run build

# =============================================================================
FROM node:22-alpine AS production

WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
# Solo dipendenze di produzione; la CLI prisma serve all'avvio per le migrazioni.
RUN npm ci --workspace=backend --omit=dev && npm cache clean --force

COPY backend/prisma backend/prisma
WORKDIR /app/backend
RUN npx prisma generate

COPY --from=builder /app/backend/dist ./dist

# Ricevute caricate (montate come volume)
RUN mkdir -p uploads

EXPOSE 3000
ENV NODE_ENV=production

# /health risponde 200 solo se anche il database è raggiungibile.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health >/dev/null || exit 1

# Migrazioni e seed a ogni avvio (entrambi idempotenti), poi l'applicazione.
CMD ["sh", "-c", "echo '🚀 Starting Sissibol Backend...' && \
     echo '🔄 Running migrations...' && npm run prisma:migrate:deploy && \
     echo '🌱 Running seed...' && (npm run prisma:seed || echo '⚠️ Seed skipped') && \
     echo '✅ Starting application...' && exec node dist/main.js"]

# Build stage
# Contesto di build: la radice del monorepo, per installare dal package-lock.json
# con npm ci (build riproducibili).
# Node 22 LTS: Vite 7 e il plugin PWA richiedono Node >= 20, e Node 18 e 20
# sono fuori supporto. Deve coincidere con la versione usata dalla CI.
FROM node:22-alpine AS builder

WORKDIR /app

# Prima solo i manifest, per la cache delle dipendenze. npm ci vuole i
# package.json di tutti i workspace del lockfile.
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace=frontend

COPY frontend/ frontend/

# Build argument for API URL
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app/frontend
RUN npm run build

# Production stage with nginx
FROM nginx:alpine AS production

# Copy custom nginx config
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl libc6-compat

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl libc6-compat

# Install only production dependencies
COPY package*.json ./
COPY prisma ./prisma/

RUN npm install --only=production && \
    npx prisma generate && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Create uploads directory
RUN mkdir -p /app/uploads

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Start application with migrations and seed
CMD ["sh", "-c", "echo '🚀 Starting Sissibol Backend...' && \
     echo '⏳ Waiting for database...' && sleep 5 && \
     echo '🔄 Running migrations...' && npx prisma migrate deploy && \
     echo '🌱 Running seed...' && npm run prisma:seed || echo '⚠️ Seed skipped' && \
     echo '✅ Starting application...' && node dist/main.js"]

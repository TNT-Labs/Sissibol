#!/bin/sh
set -e

echo "🚀 Starting Sissibol Backend..."

echo "⏳ Waiting for database to be ready..."
sleep 3

echo "🔄 Running database migrations..."
npx prisma migrate deploy

echo "🌱 Running database seed..."
npm run prisma:seed || echo "⚠️  Seed already executed or failed"

echo "✅ Starting application..."
exec node dist/main.js

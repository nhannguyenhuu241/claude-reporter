#!/bin/sh
set -e

echo "▶ Running Prisma db push..."
# db push syncs schema to DB without requiring migration history — safe for single-server deployments
npx prisma db push --skip-generate --accept-data-loss

echo "▶ Starting Claude Reporter on port $PORT..."
exec npx tsx server.ts

#!/bin/sh
set -e

echo "▶ Running Prisma db push..."
npx prisma db push --skip-generate

echo "▶ Starting Claude Reporter on port $PORT..."
exec npx tsx server.ts

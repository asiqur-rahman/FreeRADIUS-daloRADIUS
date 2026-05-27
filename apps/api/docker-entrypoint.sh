#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# RadiusNexus API — Docker entrypoint
#
# 1. Applies any pending Prisma migrations (idempotent — safe to run every start)
# 2. Hands off to the main process (node dist/index.js)
# ─────────────────────────────────────────────────────────────────────────────
set -e

echo "[entrypoint] Ensuring migration tracking table exists..."
node node_modules/prisma/build/index.js db execute \
  --file ./prisma/ensure-migrations-table.sql
echo "[entrypoint] Running database migrations..."
node node_modules/prisma/build/index.js migrate deploy
echo "[entrypoint] Migrations done. Starting API server..."

exec "$@"
